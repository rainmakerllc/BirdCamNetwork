/**
 * Amcrest PTZ Control Module
 * 
 * Controls camera movement via Amcrest's HTTP CGI API.
 * More reliable than ONVIF for Amcrest cameras.
 * 
 * API Reference: https://s3.amazonaws.com/amcrest-files/Amcrest+HTTP+API+3.2017.pdf
 */

import http from 'http';
import crypto from 'crypto';
import { config } from './config.js';
import type { PtzCapabilities, PtzPosition, PtzPreset } from './ptz.js';

// Amcrest PTZ command codes
const PTZ_CODES = {
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  LEFT_UP: 'LeftUp',
  LEFT_DOWN: 'LeftDown',
  RIGHT_UP: 'RightUp',
  RIGHT_DOWN: 'RightDown',
  ZOOM_IN: 'ZoomTele',
  ZOOM_OUT: 'ZoomWide',
  FOCUS_NEAR: 'FocusNear',
  FOCUS_FAR: 'FocusFar',
  IRIS_LARGE: 'IrisLarge',
  IRIS_SMALL: 'IrisSmall',
  GOTO_PRESET: 'GotoPreset',
  SET_PRESET: 'SetPreset',
  CLEAR_PRESET: 'ClearPreset',
} as const;

interface AmcrestResponse {
  success: boolean;
  data?: string;
  error?: string;
}

// Parse WWW-Authenticate header for Digest auth
function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] || match[3];
  }
  return result;
}

// Generate Digest auth header
function generateDigestAuth(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: Record<string, string>
): string {
  const { realm, nonce, qop, opaque } = challenge;
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  
  // HA1 = MD5(username:realm:password)
  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  
  // HA2 = MD5(method:uri)
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  
  // Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
  let response: string;
  if (qop) {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }
  
  let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque) authHeader += `, opaque="${opaque}"`;
  
  return authHeader;
}

// Make HTTP request with optional retry for Digest auth
function makeHttpRequest(
  host: string,
  port: number,
  path: string,
  headers: Record<string, string>,
  timeout: number
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: host,
      port,
      path,
      method: 'GET',
      headers,
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, data });
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function amcrestRequest(
  host: string,
  port: number,
  path: string,
  username: string,
  password: string,
  timeout = 10000
): Promise<AmcrestResponse> {
  try {
    // First request - may get 401 with Digest challenge
    const firstResponse = await makeHttpRequest(host, port, path, {}, timeout);
    
    if (firstResponse.statusCode === 200) {
      return { success: true, data: firstResponse.data };
    }
    
    if (firstResponse.statusCode === 401) {
      const wwwAuth = firstResponse.headers['www-authenticate'];
      if (!wwwAuth || !wwwAuth.toLowerCase().includes('digest')) {
        return { success: false, error: 'Digest auth not supported by camera' };
      }
      
      // Parse challenge and retry with Digest auth
      const challenge = parseDigestChallenge(wwwAuth);
      const authHeader = generateDigestAuth(username, password, 'GET', path, challenge);
      
      const secondResponse = await makeHttpRequest(host, port, path, { 'Authorization': authHeader }, timeout);
      
      if (secondResponse.statusCode === 200) {
        return { success: true, data: secondResponse.data };
      } else {
        return { success: false, error: `HTTP ${secondResponse.statusCode}: ${secondResponse.data}` };
      }
    }
    
    return { success: false, error: `HTTP ${firstResponse.statusCode}: ${firstResponse.data}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export class AmcrestPtzController {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private channel: number;
  private capabilities: PtzCapabilities | null = null;
  private currentMovement: string | null = null;

  constructor(
    host: string,
    port: number,
    username: string,
    password: string,
    channel: number = 0
  ) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.channel = channel;
  }

  private async ptzCommand(
    action: 'start' | 'stop',
    code: string,
    arg1: number = 0,
    arg2: number = 1,
    arg3: number = 0
  ): Promise<boolean> {
    const path = `/cgi-bin/ptz.cgi?action=${action}&channel=${this.channel}&code=${code}&arg1=${arg1}&arg2=${arg2}&arg3=${arg3}`;
    
    const response = await amcrestRequest(
      this.host,
      this.port,
      path,
      this.username,
      this.password
    );
    
    if (response.success) {
      console.log(`[AmcrestPTZ] ${action} ${code}: OK`);
      return true;
    } else {
      console.error(`[AmcrestPTZ] ${action} ${code} failed: ${response.error}`);
      return false;
    }
  }

  /**
   * Get PTZ capabilities
   */
  async getCapabilities(): Promise<PtzCapabilities> {
    if (this.capabilities) return this.capabilities;

    try {
      // Test if PTZ is available by sending a safe stop command
      // (getStatus doesn't work on all Amcrest cameras)
      const path = `/cgi-bin/ptz.cgi?action=stop&channel=${this.channel}&code=Up&arg1=0&arg2=0&arg3=0`;
      const response = await amcrestRequest(
        this.host,
        this.port,
        path,
        this.username,
        this.password
      );

      // Check if response contains "OK" (successful PTZ command)
      if (response.success && response.data && response.data.includes('OK')) {
        console.log('[AmcrestPTZ] PTZ test successful - camera supports PTZ');
        // Note: Many Amcrest cameras don't support zoom/presets via CGI
        // Test actual capabilities by trying commands
        this.capabilities = {
          supported: true,
          absoluteMove: false, // Amcrest CGI doesn't support absolute positioning
          relativeMove: false,
          continuousMove: true,
          presets: false,  // Not all cameras support this
          home: false,     // Not all cameras support this
          zoom: false,     // Many fixed-lens cameras don't have zoom
        } as PtzCapabilities;
      } else {
        console.log('[AmcrestPTZ] PTZ test failed:', response.error || response.data);
        this.capabilities = {
          supported: false,
          absoluteMove: false,
          relativeMove: false,
          continuousMove: false,
          presets: false,
          home: false,
        };
      }

      console.log(`[AmcrestPTZ] Capabilities: ${JSON.stringify(this.capabilities)}`);
      return this.capabilities;
    } catch (err) {
      console.warn(`[AmcrestPTZ] Could not get capabilities: ${(err as Error).message}`);
      this.capabilities = {
        supported: false,
        absoluteMove: false,
        relativeMove: false,
        continuousMove: false,
        presets: false,
        home: false,
      };
      return this.capabilities;
    }
  }

  /**
   * Move camera continuously in a direction
   * Values range from -1 to 1 for pan/tilt, -1 to 1 for zoom
   */
  async continuousMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    // Stop any current movement first
    if (this.currentMovement) {
      await this.stop();
    }

    // Determine direction and speed
    const speed = Math.max(Math.abs(pan), Math.abs(tilt), Math.abs(zoom));
    const speedArg = Math.min(Math.round(speed * 8), 8); // Amcrest uses 1-8 speed scale

    let code: string | null = null;

    // Handle combined pan/tilt movements
    if (pan !== 0 || tilt !== 0) {
      if (pan < 0 && tilt > 0) code = PTZ_CODES.LEFT_UP;
      else if (pan > 0 && tilt > 0) code = PTZ_CODES.RIGHT_UP;
      else if (pan < 0 && tilt < 0) code = PTZ_CODES.LEFT_DOWN;
      else if (pan > 0 && tilt < 0) code = PTZ_CODES.RIGHT_DOWN;
      else if (pan < 0) code = PTZ_CODES.LEFT;
      else if (pan > 0) code = PTZ_CODES.RIGHT;
      else if (tilt > 0) code = PTZ_CODES.UP;
      else if (tilt < 0) code = PTZ_CODES.DOWN;
    }

    // Handle zoom (priority if specified with pan/tilt)
    if (zoom !== 0 && !code) {
      code = zoom > 0 ? PTZ_CODES.ZOOM_IN : PTZ_CODES.ZOOM_OUT;
    }

    if (!code) {
      return true; // No movement requested
    }

    this.currentMovement = code;
    const success = await this.ptzCommand('start', code, 0, speedArg, 0);
    
    if (!success) {
      this.currentMovement = null;
    }
    
    return success;
  }

  /**
   * Stop camera movement
   */
  async stop(): Promise<boolean> {
    if (!this.currentMovement) {
      // Stop all possible movements
      const codes = [
        PTZ_CODES.UP, PTZ_CODES.DOWN, PTZ_CODES.LEFT, PTZ_CODES.RIGHT,
        PTZ_CODES.ZOOM_IN, PTZ_CODES.ZOOM_OUT
      ];
      
      for (const code of codes) {
        await this.ptzCommand('stop', code, 0, 0, 0);
      }
      return true;
    }

    const success = await this.ptzCommand('stop', this.currentMovement, 0, 0, 0);
    this.currentMovement = null;
    return success;
  }

  /**
   * Move to absolute position (limited support - uses relative as workaround)
   */
  async absoluteMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    console.log(`[AmcrestPTZ] Absolute move not fully supported, using relative approximation`);
    // Amcrest CGI doesn't have great absolute positioning
    // This would require tracking current position and calculating deltas
    return false;
  }

  /**
   * Move relative to current position
   */
  async relativeMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    // Use continuous move with auto-stop
    const success = await this.continuousMove(pan, tilt, zoom);
    if (success) {
      // Auto-stop after a brief movement proportional to the values
      const duration = Math.max(Math.abs(pan), Math.abs(tilt), Math.abs(zoom)) * 500;
      setTimeout(() => this.stop(), Math.max(duration, 100));
    }
    return success;
  }

  /**
   * Get current position (limited support on Amcrest)
   */
  async getPosition(): Promise<PtzPosition | null> {
    try {
      const path = `/cgi-bin/ptz.cgi?action=getStatus&channel=${this.channel}`;
      const response = await amcrestRequest(
        this.host,
        this.port,
        path,
        this.username,
        this.password
      );

      if (response.success && response.data) {
        // Parse response like: status.Postion[0]=123.4 status.Postion[1]=45.6 status.Postion[2]=1.0
        const posMatch = response.data.match(/Postion\[0\]=([0-9.-]+)/i);
        const tiltMatch = response.data.match(/Postion\[1\]=([0-9.-]+)/i);
        const zoomMatch = response.data.match(/Postion\[2\]=([0-9.-]+)/i);

        if (posMatch && tiltMatch) {
          return {
            pan: parseFloat(posMatch[1]) / 180, // Normalize to -1 to 1
            tilt: parseFloat(tiltMatch[1]) / 90,
            zoom: zoomMatch ? parseFloat(zoomMatch[1]) : 0,
          };
        }
      }
      return null;
    } catch (err) {
      console.error(`[AmcrestPTZ] Get position failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Go to home position
   */
  async goHome(): Promise<boolean> {
    // Amcrest typically uses preset 1 as home, or has a dedicated home command
    return this.gotoPreset('1');
  }

  /**
   * Set current position as home
   */
  async setHome(): Promise<boolean> {
    return this.setPreset('1') !== null;
  }

  /**
   * Get list of presets
   */
  async getPresets(): Promise<PtzPreset[]> {
    const presets: PtzPreset[] = [];
    
    // Amcrest cameras typically support presets 1-255
    // Query which ones are set
    for (let i = 1; i <= 10; i++) {
      // Most cameras have at least 10 presets, we'll check the first 10
      presets.push({
        token: String(i),
        name: `Preset ${i}`,
      });
    }

    console.log(`[AmcrestPTZ] Returning ${presets.length} preset slots`);
    return presets;
  }

  /**
   * Go to a preset position
   */
  async gotoPreset(presetToken: string): Promise<boolean> {
    const presetNum = parseInt(presetToken, 10);
    if (isNaN(presetNum) || presetNum < 1) {
      console.error(`[AmcrestPTZ] Invalid preset token: ${presetToken}`);
      return false;
    }

    const success = await this.ptzCommand('start', PTZ_CODES.GOTO_PRESET, 0, presetNum, 0);
    console.log(`[AmcrestPTZ] Going to preset ${presetNum}: ${success ? 'OK' : 'Failed'}`);
    return success;
  }

  /**
   * Save current position as a preset
   */
  async setPreset(name: string): Promise<string | null> {
    const presetNum = parseInt(name, 10) || 1;
    
    const success = await this.ptzCommand('start', PTZ_CODES.SET_PRESET, 0, presetNum, 0);
    
    if (success) {
      console.log(`[AmcrestPTZ] Preset ${presetNum} saved`);
      return String(presetNum);
    }
    return null;
  }

  /**
   * Convenience methods for simple movement
   */
  async panLeft(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(-speed, 0, 0);
  }

  async panRight(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(speed, 0, 0);
  }

  async tiltUp(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(0, speed, 0);
  }

  async tiltDown(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(0, -speed, 0);
  }

  async zoomIn(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(0, 0, speed);
  }

  async zoomOut(speed: number = 0.5): Promise<boolean> {
    return this.continuousMove(0, 0, -speed);
  }
}

/**
 * Detect if a camera is an Amcrest (or Dahua) device
 */
export function isAmcrestCamera(manufacturer: string, model: string): boolean {
  const lowerMfg = (manufacturer || '').toLowerCase();
  const lowerModel = (model || '').toLowerCase();
  
  return (
    lowerMfg.includes('amcrest') ||
    lowerMfg.includes('dahua') ||
    lowerModel.includes('amcrest') ||
    lowerModel.includes('dahua') ||
    lowerModel.includes('ip4m') ||
    lowerModel.includes('ip8m') ||
    lowerModel.includes('ip5m') ||
    lowerModel.includes('ip2m')
  );
}

/**
 * Factory function
 */
export function createAmcrestPtzController(
  host: string,
  port: number,
  username: string,
  password: string,
  channel: number = 0
): AmcrestPtzController {
  return new AmcrestPtzController(host, port, username, password, channel);
}
