/**
 * PTZ (Pan/Tilt/Zoom) Control Module
 * 
 * Controls camera movement via ONVIF PTZ service.
 */

import http from 'http';
import crypto from 'crypto';
import { config } from './config.js';

export interface PtzCapabilities {
  supported: boolean;
  absoluteMove: boolean;
  relativeMove: boolean;
  continuousMove: boolean;
  presets: boolean;
  home: boolean;
  panRange?: { min: number; max: number };
  tiltRange?: { min: number; max: number };
  zoomRange?: { min: number; max: number };
}

export interface PtzPosition {
  pan: number;   // -1 to 1
  tilt: number;  // -1 to 1
  zoom: number;  // 0 to 1
}

export interface PtzPreset {
  token: string;
  name: string;
}

// Create WS-Security header for ONVIF
function createSecurityHeader(username: string, password: string): string {
  const nonce = crypto.randomBytes(16);
  const created = new Date().toISOString();
  
  const sha1 = crypto.createHash('sha1');
  sha1.update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)]));
  const digest = sha1.digest('base64');
  const nonce64 = nonce.toString('base64');
  
  return `
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" 
                   xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce64}</wsse:Nonce>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>`;
}

function createSoapEnvelope(body: string, username?: string, password?: string): string {
  const securityHeader = username && password ? createSecurityHeader(username, password) : '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
               xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Header>${securityHeader}</soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

async function soapRequest(
  host: string,
  port: number,
  path: string,
  body: string,
  username?: string,
  password?: string,
  timeout = 10000
): Promise<string> {
  const envelope = createSoapEnvelope(body, username, password);
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: host,
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(envelope),
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`PTZ request failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('PTZ request timeout'));
    });
    
    req.write(envelope);
    req.end();
  });
}

export class PtzController {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private profileToken: string;
  private capabilities: PtzCapabilities | null = null;

  constructor(host: string, port: number, username: string, password: string, profileToken: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.profileToken = profileToken;
  }

  /**
   * Get PTZ capabilities for the camera
   */
  async getCapabilities(): Promise<PtzCapabilities> {
    if (this.capabilities) return this.capabilities;

    try {
      const body = `
        <tptz:GetConfigurations xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/>`;
      
      const response = await soapRequest(
        this.host,
        this.port,
        '/onvif/ptz_service',
        body,
        this.username,
        this.password
      );

      // Parse capabilities from response
      const hasAbsolute = response.includes('AbsolutePanTiltPositionSpace') || response.includes('AbsoluteZoomPositionSpace');
      const hasRelative = response.includes('RelativePanTiltTranslationSpace') || response.includes('RelativeZoomTranslationSpace');
      const hasContinuous = response.includes('ContinuousPanTiltVelocitySpace') || response.includes('ContinuousZoomVelocitySpace');

      this.capabilities = {
        supported: hasAbsolute || hasRelative || hasContinuous,
        absoluteMove: hasAbsolute,
        relativeMove: hasRelative,
        continuousMove: hasContinuous,
        presets: true, // Assume presets are supported
        home: true,
      };

      console.log(`[PTZ] Capabilities: ${JSON.stringify(this.capabilities)}`);
      return this.capabilities;
    } catch (err) {
      console.warn(`[PTZ] Could not get capabilities: ${(err as Error).message}`);
      this.capabilities = { supported: false, absoluteMove: false, relativeMove: false, continuousMove: false, presets: false, home: false };
      return this.capabilities;
    }
  }

  /**
   * Move camera continuously in a direction
   * Values range from -1 to 1 for pan/tilt, 0 to 1 for zoom
   */
  async continuousMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    const body = `
      <tptz:ContinuousMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:Velocity>
          <tt:PanTilt x="${pan}" y="${tilt}"/>
          <tt:Zoom x="${zoom}"/>
        </tptz:Velocity>
      </tptz:ContinuousMove>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log(`[PTZ] Continuous move: pan=${pan}, tilt=${tilt}, zoom=${zoom}`);
      return true;
    } catch (err) {
      console.error(`[PTZ] Continuous move failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Stop camera movement
   */
  async stop(): Promise<boolean> {
    const body = `
      <tptz:Stop xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:PanTilt>true</tptz:PanTilt>
        <tptz:Zoom>true</tptz:Zoom>
      </tptz:Stop>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log('[PTZ] Stopped');
      return true;
    } catch (err) {
      console.error(`[PTZ] Stop failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Move to absolute position
   */
  async absoluteMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    const body = `
      <tptz:AbsoluteMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:Position>
          <tt:PanTilt x="${pan}" y="${tilt}"/>
          <tt:Zoom x="${zoom}"/>
        </tptz:Position>
      </tptz:AbsoluteMove>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log(`[PTZ] Absolute move: pan=${pan}, tilt=${tilt}, zoom=${zoom}`);
      return true;
    } catch (err) {
      console.error(`[PTZ] Absolute move failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Move relative to current position
   */
  async relativeMove(pan: number, tilt: number, zoom: number): Promise<boolean> {
    const body = `
      <tptz:RelativeMove xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:Translation>
          <tt:PanTilt x="${pan}" y="${tilt}"/>
          <tt:Zoom x="${zoom}"/>
        </tptz:Translation>
      </tptz:RelativeMove>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log(`[PTZ] Relative move: pan=${pan}, tilt=${tilt}, zoom=${zoom}`);
      return true;
    } catch (err) {
      console.error(`[PTZ] Relative move failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Get current position
   */
  async getPosition(): Promise<PtzPosition | null> {
    const body = `
      <tptz:GetStatus xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
      </tptz:GetStatus>`;

    try {
      const response = await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      
      // Parse position from response
      const panMatch = response.match(/<tt:PanTilt[^>]*x="([^"]+)"[^>]*y="([^"]+)"/i);
      const zoomMatch = response.match(/<tt:Zoom[^>]*x="([^"]+)"/i);

      if (panMatch) {
        return {
          pan: parseFloat(panMatch[1]),
          tilt: parseFloat(panMatch[2]),
          zoom: zoomMatch ? parseFloat(zoomMatch[1]) : 0,
        };
      }
      return null;
    } catch (err) {
      console.error(`[PTZ] Get position failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Go to home position
   */
  async goHome(): Promise<boolean> {
    const body = `
      <tptz:GotoHomePosition xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
      </tptz:GotoHomePosition>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log('[PTZ] Going home');
      return true;
    } catch (err) {
      console.error(`[PTZ] Go home failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Set current position as home
   */
  async setHome(): Promise<boolean> {
    const body = `
      <tptz:SetHomePosition xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
      </tptz:SetHomePosition>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log('[PTZ] Home position set');
      return true;
    } catch (err) {
      console.error(`[PTZ] Set home failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Get list of presets
   */
  async getPresets(): Promise<PtzPreset[]> {
    const body = `
      <tptz:GetPresets xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
      </tptz:GetPresets>`;

    try {
      const response = await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      
      const presets: PtzPreset[] = [];
      const presetMatches = response.matchAll(/<tptz:Preset[^>]*token="([^"]+)"[^>]*>[\s\S]*?<tt:Name>([^<]*)<\/tt:Name>/gi);
      
      for (const match of presetMatches) {
        presets.push({
          token: match[1],
          name: match[2] || match[1],
        });
      }

      console.log(`[PTZ] Found ${presets.length} presets`);
      return presets;
    } catch (err) {
      console.error(`[PTZ] Get presets failed: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Go to a preset position
   */
  async gotoPreset(presetToken: string): Promise<boolean> {
    const body = `
      <tptz:GotoPreset xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:PresetToken>${presetToken}</tptz:PresetToken>
      </tptz:GotoPreset>`;

    try {
      await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      console.log(`[PTZ] Going to preset: ${presetToken}`);
      return true;
    } catch (err) {
      console.error(`[PTZ] Go to preset failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Save current position as a preset
   */
  async setPreset(name: string): Promise<string | null> {
    const body = `
      <tptz:SetPreset xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
        <tptz:ProfileToken>${this.profileToken}</tptz:ProfileToken>
        <tptz:PresetName>${name}</tptz:PresetName>
      </tptz:SetPreset>`;

    try {
      const response = await soapRequest(this.host, this.port, '/onvif/ptz_service', body, this.username, this.password);
      
      const tokenMatch = response.match(/<tptz:PresetToken>([^<]+)<\/tptz:PresetToken>/i);
      const token = tokenMatch ? tokenMatch[1] : null;
      
      console.log(`[PTZ] Preset saved: ${name} -> ${token}`);
      return token;
    } catch (err) {
      console.error(`[PTZ] Set preset failed: ${(err as Error).message}`);
      return null;
    }
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

// Factory function
export function createPtzController(
  host: string,
  port: number,
  username: string,
  password: string,
  profileToken: string
): PtzController {
  return new PtzController(host, port, username, password, profileToken);
}
