import { EventEmitter } from 'events';
import dgram from 'dgram';
import http from 'http';
import crypto from 'crypto';
import { config } from './config.js';

// ONVIF WS-Discovery multicast address
const MULTICAST_ADDRESS = '239.255.255.250';
const DISCOVERY_PORT = 3702;

export interface OnvifDevice {
  address: string;
  port: number;
  name: string;
  manufacturer: string;
  model: string;
  xaddr: string;
  profiles: OnvifProfile[];
}

export interface OnvifProfile {
  token: string;
  name: string;
  resolution: { width: number; height: number };
  streamUri?: string;
}

export interface DiscoveredCamera {
  ip: string;
  port: number;
  name: string;
  manufacturer: string;
  model: string;
  xaddr: string;
}

// WS-Discovery probe message
function createProbeMessage(): string {
  const uuid = crypto.randomUUID();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
               xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
               xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery"
               xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <soap:Header>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
    <wsa:MessageID>urn:uuid:${uuid}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
  </soap:Header>
  <soap:Body>
    <wsd:Probe>
      <wsd:Types>dn:NetworkVideoTransmitter</wsd:Types>
    </wsd:Probe>
  </soap:Body>
</soap:Envelope>`;
}

// Time offset to compensate for camera clock drift (in milliseconds)
let cameraTimeOffset = 0;

/**
 * Set the time offset between local time and camera time
 * Positive = camera is ahead, Negative = camera is behind
 */
export function setCameraTimeOffset(offsetMs: number): void {
  cameraTimeOffset = offsetMs;
  console.log(`[ONVIF] Camera time offset set to ${offsetMs}ms (${(offsetMs / 1000 / 60).toFixed(1)} minutes)`);
}

/**
 * Get the current time adjusted for camera offset
 */
function getCameraAdjustedTime(): Date {
  return new Date(Date.now() + cameraTimeOffset);
}

// SOAP request with ONVIF auth
function createAuthHeader(username: string, password: string): { header: string; created: string; nonce64: string } {
  const nonce = crypto.randomBytes(16);
  // Use camera-adjusted time for WS-Security timestamp
  const created = getCameraAdjustedTime().toISOString();
  
  // WS-Security UsernameToken with password digest
  const sha1 = crypto.createHash('sha1');
  sha1.update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)]));
  const digest = sha1.digest('base64');
  const nonce64 = nonce.toString('base64');
  
  return { header: digest, created, nonce64 };
}

function createSoapEnvelope(body: string, username?: string, password?: string): string {
  let securityHeader = '';
  
  if (username && password) {
    const auth = createAuthHeader(username, password);
    securityHeader = `
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" 
                   xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${auth.header}</wsse:Password>
        <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${auth.nonce64}</wsse:Nonce>
        <wsu:Created>${auth.created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>`;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
               xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Header>${securityHeader}</soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

// Simple XML value extractor (no external deps)
function extractValue(xml: string, tag: string): string | null {
  // Handle namespaced tags
  const patterns = [
    new RegExp(`<[^:>]*:?${tag}[^>]*>([^<]*)<`, 'i'),
    new RegExp(`<${tag}[^>]*>([^<]*)<`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  const patterns = [
    new RegExp(`<[^:>]*:?${tag}[^>]*>([^<]*)<`, 'gi'),
    new RegExp(`<${tag}[^>]*>([^<]*)<`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      if (match[1].trim()) results.push(match[1].trim());
    }
  }
  return results;
}

// HTTP SOAP request
async function soapRequest(
  url: string,
  action: string,
  body: string,
  username?: string,
  password?: string,
  timeout = 10000
): Promise<string> {
  const parsed = new URL(url);
  const envelope = createSoapEnvelope(body, username, password);
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
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
          reject(new Error(`SOAP request failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SOAP request timeout'));
    });
    
    req.write(envelope);
    req.end();
  });
}

/**
 * Discover ONVIF cameras on the local network
 */
export async function discoverCameras(timeoutMs = 5000): Promise<DiscoveredCamera[]> {
  const cameras: DiscoveredCamera[] = [];
  const seen = new Set<string>();
  
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    socket.on('message', (msg, rinfo) => {
      const xml = msg.toString();
      
      // Extract XAddr (ONVIF service URL)
      const xaddrMatch = xml.match(/<[^:>]*:?XAddrs[^>]*>([^<]+)</i);
      if (!xaddrMatch) return;
      
      const xaddrs = xaddrMatch[1].split(/\s+/);
      const xaddr = xaddrs.find(x => x.startsWith('http://')) || xaddrs[0];
      
      if (seen.has(xaddr)) return;
      seen.add(xaddr);
      
      // Extract device info
      const camera: DiscoveredCamera = {
        ip: rinfo.address,
        port: 80,
        name: extractValue(xml, 'Name') || 'Unknown Camera',
        manufacturer: extractValue(xml, 'Manufacturer') || 'Unknown',
        model: extractValue(xml, 'Model') || 'Unknown',
        xaddr,
      };
      
      // Try to extract port from xaddr
      try {
        const url = new URL(xaddr);
        camera.port = parseInt(url.port) || 80;
      } catch {}
      
      console.log(`[ONVIF] Discovered: ${camera.name} at ${camera.ip}`);
      cameras.push(camera);
    });
    
    socket.on('listening', () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(128);
      
      const probe = Buffer.from(createProbeMessage());
      socket.send(probe, 0, probe.length, DISCOVERY_PORT, MULTICAST_ADDRESS);
      
      console.log('[ONVIF] Discovery probe sent, waiting for responses...');
    });
    
    socket.bind(() => {
      setTimeout(() => {
        socket.close();
        console.log(`[ONVIF] Discovery complete, found ${cameras.length} camera(s)`);
        resolve(cameras);
      }, timeoutMs);
    });
  });
}

/**
 * Detect camera time offset by querying system date without auth
 * This helps when camera clock is not synced with the Pi
 */
export async function detectCameraTimeOffset(host: string, port: number = 80): Promise<number> {
  const baseUrl = `http://${host}:${port}/onvif/device_service`;
  
  // GetSystemDateAndTime doesn't require auth on most cameras
  const body = `<tds:GetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/>`;
  
  try {
    const localTimeBefore = Date.now();
    const response = await soapRequest(baseUrl, 'GetSystemDateAndTime', body);
    const localTimeAfter = Date.now();
    const localTime = (localTimeBefore + localTimeAfter) / 2;
    
    // Extract camera time from response
    const hour = extractValue(response, 'Hour');
    const minute = extractValue(response, 'Minute');
    const second = extractValue(response, 'Second');
    const year = extractValue(response, 'Year');
    const month = extractValue(response, 'Month');
    const day = extractValue(response, 'Day');
    
    if (hour && minute && second && year && month && day) {
      // Construct camera time (assuming UTC)
      const cameraTime = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      )).getTime();
      
      const offset = cameraTime - localTime;
      console.log(`[ONVIF] Camera time offset: ${(offset / 1000).toFixed(1)}s (${(offset / 1000 / 60).toFixed(1)} min)`);
      
      // Only apply offset if significant (> 5 seconds)
      if (Math.abs(offset) > 5000) {
        setCameraTimeOffset(offset);
        return offset;
      }
    }
  } catch (err) {
    console.warn('[ONVIF] Could not detect camera time, using local time:', (err as Error).message);
  }
  
  return 0;
}

/**
 * Connect to an ONVIF camera and get its stream URLs
 */
export async function connectCamera(
  host: string,
  port: number = 80,
  username?: string,
  password?: string
): Promise<OnvifDevice> {
  const baseUrl = `http://${host}:${port}/onvif/device_service`;
  const mediaUrl = `http://${host}:${port}/onvif/media_service`;
  
  console.log(`[ONVIF] Connecting to ${host}:${port}...`);
  
  // Try to detect and compensate for camera time offset
  await detectCameraTimeOffset(host, port);
  
  // Get device info
  const deviceInfoBody = `<tds:GetDeviceInformation xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/>`;
  let deviceInfo: any = { manufacturer: 'Unknown', model: 'Unknown', name: 'ONVIF Camera' };
  
  try {
    const deviceResponse = await soapRequest(baseUrl, 'GetDeviceInformation', deviceInfoBody, username, password);
    deviceInfo = {
      manufacturer: extractValue(deviceResponse, 'Manufacturer') || 'Unknown',
      model: extractValue(deviceResponse, 'Model') || 'Unknown',
      name: extractValue(deviceResponse, 'FirmwareVersion') || 'ONVIF Camera',
    };
    console.log(`[ONVIF] Device: ${deviceInfo.manufacturer} ${deviceInfo.model}`);
  } catch (err) {
    console.warn('[ONVIF] Could not get device info:', (err as Error).message);
  }
  
  // Get media profiles
  const profilesBody = `<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>`;
  const profilesResponse = await soapRequest(mediaUrl, 'GetProfiles', profilesBody, username, password);
  
  // Extract profile tokens
  const profileMatches = profilesResponse.matchAll(/<[^:>]*:?Profiles[^>]*token="([^"]+)"[^>]*>/gi);
  const profileTokens: string[] = [];
  for (const match of profileMatches) {
    profileTokens.push(match[1]);
  }
  
  if (profileTokens.length === 0) {
    // Try alternative extraction
    const tokens = extractAll(profilesResponse, 'token');
    profileTokens.push(...tokens.slice(0, 4)); // Limit to first 4
  }
  
  console.log(`[ONVIF] Found ${profileTokens.length} media profile(s)`);
  
  // Get stream URIs for each profile
  const profiles: OnvifProfile[] = [];
  
  for (const token of profileTokens) {
    const streamBody = `
      <trt:GetStreamUri xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
        <trt:StreamSetup>
          <tt:Stream>RTP-Unicast</tt:Stream>
          <tt:Transport>
            <tt:Protocol>RTSP</tt:Protocol>
          </tt:Transport>
        </trt:StreamSetup>
        <trt:ProfileToken>${token}</trt:ProfileToken>
      </trt:GetStreamUri>`;
    
    try {
      const streamResponse = await soapRequest(mediaUrl, 'GetStreamUri', streamBody, username, password);
      const uri = extractValue(streamResponse, 'Uri');
      
      if (uri) {
        // Get profile video config for resolution
        let resolution = { width: 1920, height: 1080 }; // Default
        
        const configBody = `
          <trt:GetProfile xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
            <trt:ProfileToken>${token}</trt:ProfileToken>
          </trt:GetProfile>`;
        
        try {
          const configResponse = await soapRequest(mediaUrl, 'GetProfile', configBody, username, password);
          const width = extractValue(configResponse, 'Width');
          const height = extractValue(configResponse, 'Height');
          if (width && height) {
            resolution = { width: parseInt(width), height: parseInt(height) };
          }
        } catch {}
        
        profiles.push({
          token,
          name: `Profile ${profiles.length + 1}`,
          resolution,
          streamUri: uri,
        });
        
        console.log(`[ONVIF] Profile ${token}: ${resolution.width}x${resolution.height} → ${uri}`);
      }
    } catch (err) {
      console.warn(`[ONVIF] Could not get stream URI for profile ${token}:`, (err as Error).message);
    }
  }
  
  if (profiles.length === 0) {
    throw new Error('No ONVIF stream profiles found');
  }
  
  return {
    address: host,
    port,
    name: deviceInfo.name,
    manufacturer: deviceInfo.manufacturer,
    model: deviceInfo.model,
    xaddr: baseUrl,
    profiles,
  };
}

/**
 * Get the best RTSP URL from an ONVIF camera
 * Prefers higher resolution streams, adds auth if provided
 */
export function getBestStreamUrl(device: OnvifDevice, username?: string, password?: string): string {
  // Sort by resolution (highest first)
  const sorted = [...device.profiles].sort((a, b) => {
    const aPixels = a.resolution.width * a.resolution.height;
    const bPixels = b.resolution.width * b.resolution.height;
    return bPixels - aPixels;
  });
  
  const profile = sorted[0];
  if (!profile.streamUri) {
    throw new Error('No stream URI available');
  }
  
  let rtspUrl = profile.streamUri;
  
  // Add auth to URL if needed
  if (username && password) {
    const url = new URL(rtspUrl);
    if (!url.username) {
      url.username = encodeURIComponent(username);
      url.password = encodeURIComponent(password);
      rtspUrl = url.toString();
    }
  }
  
  return rtspUrl;
}

/**
 * Auto-discover and connect to the first ONVIF camera found
 */
export async function autoConnect(username?: string, password?: string): Promise<{
  device: OnvifDevice;
  rtspUrl: string;
} | null> {
  const cameras = await discoverCameras();
  
  if (cameras.length === 0) {
    console.log('[ONVIF] No cameras discovered');
    return null;
  }
  
  // Try each camera until one works
  for (const camera of cameras) {
    try {
      const device = await connectCamera(camera.ip, camera.port, username, password);
      const rtspUrl = getBestStreamUrl(device, username, password);
      return { device, rtspUrl };
    } catch (err) {
      console.warn(`[ONVIF] Failed to connect to ${camera.ip}:`, (err as Error).message);
    }
  }
  
  return null;
}

// ==================== Camera Time Management ====================

export interface CameraTime {
  utcTime: string;
  localTime: string;
  timezone: string;
  daylightSavings: boolean;
  ntpEnabled: boolean;
}

/**
 * Get camera's current system time via ONVIF
 */
export async function getCameraTime(
  host: string,
  port: number = 80,
  username?: string,
  password?: string
): Promise<CameraTime | null> {
  const deviceUrl = `http://${host}:${port}/onvif/device_service`;
  
  const body = `<tds:GetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/>`;
  
  try {
    const response = await soapRequest(deviceUrl, 'GetSystemDateAndTime', body, username, password);
    
    // Parse the response
    const dateTimeType = extractValue(response, 'DateTimeType') || 'Manual';
    const daylightSavings = extractValue(response, 'DaylightSavings') === 'true';
    const timezone = extractValue(response, 'TZ') || 'UTC';
    
    // Extract UTC time
    const utcYear = extractValue(response, 'Year') || new Date().getFullYear().toString();
    const utcMonth = extractValue(response, 'Month') || '1';
    const utcDay = extractValue(response, 'Day') || '1';
    const utcHour = extractValue(response, 'Hour') || '0';
    const utcMinute = extractValue(response, 'Minute') || '0';
    const utcSecond = extractValue(response, 'Second') || '0';
    
    // Build UTC date
    const utcDate = new Date(Date.UTC(
      parseInt(utcYear),
      parseInt(utcMonth) - 1,
      parseInt(utcDay),
      parseInt(utcHour),
      parseInt(utcMinute),
      parseInt(utcSecond)
    ));
    
    return {
      utcTime: utcDate.toISOString(),
      localTime: utcDate.toLocaleString(),
      timezone,
      daylightSavings,
      ntpEnabled: dateTimeType === 'NTP',
    };
  } catch (err) {
    console.error('[ONVIF] Failed to get camera time:', (err as Error).message);
    return null;
  }
}

/**
 * Set camera's system time via ONVIF
 * This is crucial because ONVIF auth fails if camera time is too far off
 */
export async function setCameraTime(
  host: string,
  port: number = 80,
  username?: string,
  password?: string,
  useNtp: boolean = false,
  ntpServer?: string
): Promise<boolean> {
  const deviceUrl = `http://${host}:${port}/onvif/device_service`;
  
  const now = new Date();
  
  let body: string;
  
  if (useNtp) {
    body = `
      <tds:SetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <tds:DateTimeType>NTP</tds:DateTimeType>
        <tds:DaylightSavings>false</tds:DaylightSavings>
      </tds:SetSystemDateAndTime>`;
  } else {
    body = `
      <tds:SetSystemDateAndTime xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <tds:DateTimeType>Manual</tds:DateTimeType>
        <tds:DaylightSavings>false</tds:DaylightSavings>
        <tds:UTCDateTime>
          <tt:Time>
            <tt:Hour>${now.getUTCHours()}</tt:Hour>
            <tt:Minute>${now.getUTCMinutes()}</tt:Minute>
            <tt:Second>${now.getUTCSeconds()}</tt:Second>
          </tt:Time>
          <tt:Date>
            <tt:Year>${now.getUTCFullYear()}</tt:Year>
            <tt:Month>${now.getUTCMonth() + 1}</tt:Month>
            <tt:Day>${now.getUTCDate()}</tt:Day>
          </tt:Date>
        </tds:UTCDateTime>
      </tds:SetSystemDateAndTime>`;
  }
  
  try {
    await soapRequest(deviceUrl, 'SetSystemDateAndTime', body, username, password);
    console.log(`[ONVIF] Camera time ${useNtp ? 'set to NTP' : 'synchronized to'}: ${now.toISOString()}`);
    return true;
  } catch (err) {
    console.error('[ONVIF] Failed to set camera time:', (err as Error).message);
    return false;
  }
}

/**
 * Check if camera time is within acceptable range (for ONVIF auth to work)
 * Returns the time difference in seconds
 */
export async function checkTimeSync(
  host: string,
  port: number = 80,
  username?: string,
  password?: string
): Promise<{ synced: boolean; diffSeconds: number; cameraTime: string; systemTime: string } | null> {
  const cameraTime = await getCameraTime(host, port, username, password);
  
  if (!cameraTime) {
    return null;
  }
  
  const cameraDate = new Date(cameraTime.utcTime);
  const systemDate = new Date();
  const diffMs = Math.abs(cameraDate.getTime() - systemDate.getTime());
  const diffSeconds = Math.round(diffMs / 1000);
  
  // ONVIF typically allows up to 5 minutes of time difference
  const synced = diffSeconds < 300;
  
  return {
    synced,
    diffSeconds,
    cameraTime: cameraTime.utcTime,
    systemTime: systemDate.toISOString(),
  };
}
