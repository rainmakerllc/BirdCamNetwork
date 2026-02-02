import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { homedir } from 'os';

loadEnv();

// Generate or load device ID
function getDeviceId(): string {
  const envId = process.env.DEVICE_ID;
  if (envId) return envId;
  
  // Try to load from persistent file
  const idFile = join(homedir(), '.birdcam-device-id');
  if (existsSync(idFile)) {
    const { readFileSync } = require('fs');
    return readFileSync(idFile, 'utf-8').trim();
  }
  
  // Generate new ID and save it
  const newId = `pi-${uuidv4().slice(0, 8)}`;
  const { writeFileSync } = require('fs');
  try {
    writeFileSync(idFile, newId);
  } catch {
    // Ignore write errors
  }
  return newId;
}

export const config = {
  // Camera
  camera: {
    rtspUrl: process.env.CAMERA_RTSP_URL || '',
    name: process.env.CAMERA_NAME || 'Pi Camera',
    location: process.env.CAMERA_LOCATION || '',
  },
  
  // ONVIF
  onvif: {
    enabled: process.env.USE_ONVIF === 'true',
    autoDiscover: process.env.ONVIF_AUTO_DISCOVER === 'true',
    host: process.env.ONVIF_HOST || '',
    port: parseInt(process.env.ONVIF_PORT || '80', 10),
    username: process.env.ONVIF_USERNAME || '',
    password: process.env.ONVIF_PASSWORD || '',
    profileToken: process.env.ONVIF_PROFILE_TOKEN || '', // Specific profile, empty = auto-select best
  },
  
  // Firebase
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    projectId: process.env.FIREBASE_PROJECT_ID || 'birdwatchnetwork',
  },
  
  // HLS Stream
  hls: {
    port: parseInt(process.env.HLS_PORT || '8080', 10),
    segmentDuration: parseInt(process.env.HLS_SEGMENT_DURATION || '2', 10),
    playlistSize: parseInt(process.env.HLS_PLAYLIST_SIZE || '5', 10),
    outputDir: process.env.HLS_OUTPUT_DIR || '/tmp/birdcam-hls',
  },
  
  // Transcoding
  transcode: {
    resolution: process.env.OUTPUT_RESOLUTION || '',
    bitrate: process.env.OUTPUT_BITRATE || '2000k',
  },
  
  // Cloudflare Tunnel
  tunnel: {
    enabled: process.env.USE_CLOUDFLARE_TUNNEL === 'true',
    token: process.env.CLOUDFLARE_TUNNEL_TOKEN || '',
    hostname: process.env.CLOUDFLARE_TUNNEL_HOSTNAME || '',
  },
  
  // System
  deviceId: getDeviceId(),
  debug: process.env.DEBUG === 'true',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  
  // Camera URL is required UNLESS ONVIF is enabled
  if (!config.camera.rtspUrl && !config.onvif.enabled) {
    errors.push('CAMERA_RTSP_URL is required (or enable USE_ONVIF=true)');
  }
  
  // ONVIF validation
  if (config.onvif.enabled && !config.onvif.autoDiscover && !config.onvif.host) {
    errors.push('ONVIF_HOST is required when USE_ONVIF=true and ONVIF_AUTO_DISCOVER=false');
  }
  
  if (!config.firebase.serviceAccountPath) {
    errors.push('FIREBASE_SERVICE_ACCOUNT_PATH is required');
  } else if (!existsSync(config.firebase.serviceAccountPath)) {
    errors.push(`Firebase service account not found: ${config.firebase.serviceAccountPath}`);
  }
  
  if (config.tunnel.enabled && !config.tunnel.token) {
    errors.push('CLOUDFLARE_TUNNEL_TOKEN is required when USE_CLOUDFLARE_TUNNEL=true');
  }
  
  return errors;
}
