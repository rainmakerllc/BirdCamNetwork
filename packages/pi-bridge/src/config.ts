import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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
    return readFileSync(idFile, 'utf-8').trim();
  }
  
  // Generate new ID and save it
  const newId = `pi-${uuidv4().slice(0, 8)}`;
  try {
    writeFileSync(idFile, newId);
  } catch {
    // Ignore write errors
  }
  return newId;
}

// Extract host from RTSP URL
function extractHostFromRtsp(rtspUrl: string): string {
  try {
    // Handle rtsp://user:pass@host:port/path format
    const match = rtspUrl.match(/rtsp:\/\/(?:[^@]+@)?([^:\/]+)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

export const config = {
  // Camera
  camera: {
    rtspUrl: process.env.CAMERA_RTSP_URL || '',
    name: process.env.CAMERA_NAME || 'Pi Camera',
    location: process.env.CAMERA_LOCATION || '',
    // Extract host from RTSP URL for display when ONVIF is disabled
    get host(): string {
      return extractHostFromRtsp(this.rtspUrl);
    },
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
  
  // PTZ Control
  ptz: {
    // Use Amcrest CGI API instead of ONVIF for PTZ (more reliable on Amcrest cameras)
    // 'auto' = detect Amcrest and use CGI, 'amcrest' = force CGI, 'onvif' = force ONVIF
    mode: (process.env.PTZ_MODE || 'auto') as 'auto' | 'amcrest' | 'onvif',
    // Channel for Amcrest CGI (usually 0 or 1)
    channel: parseInt(process.env.PTZ_CHANNEL || '0', 10),
  },
  
  // Firebase (optional - leave FIREBASE_SERVICE_ACCOUNT_PATH empty to disable)
  firebase: {
    enabled: !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    projectId: process.env.FIREBASE_PROJECT_ID || 'birdwatchnetwork',
  },
  
  // Streaming
  streaming: {
    mode: (process.env.STREAM_MODE || 'webrtc') as 'webrtc' | 'hls' | 'auto',
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
  
  // Bird Detection
  detection: {
    enabled: process.env.BIRD_DETECTION_ENABLED !== 'false',  // Enabled by default
    minConfidence: parseFloat(process.env.DETECTION_MIN_CONFIDENCE || '0.7'),
    analysisInterval: parseInt(process.env.DETECTION_INTERVAL || '3', 10),
    sampleDuration: parseInt(process.env.DETECTION_SAMPLE_DURATION || '3', 10),
    latitude: process.env.LOCATION_LATITUDE ? parseFloat(process.env.LOCATION_LATITUDE) : undefined,
    longitude: process.env.LOCATION_LONGITUDE ? parseFloat(process.env.LOCATION_LONGITUDE) : undefined,
    locale: process.env.BIRDNET_LOCALE || 'en',
  },
  
  // Clip Recording
  recording: {
    enabled: process.env.CLIP_RECORDING_ENABLED !== 'false',  // Enabled by default
    clipDuration: parseInt(process.env.CLIP_DURATION || '15', 10),
    preBuffer: parseInt(process.env.CLIP_PRE_BUFFER || '5', 10),
    outputDir: process.env.CLIPS_OUTPUT_DIR || './clips',
    maxClips: parseInt(process.env.MAX_CLIPS || '100', 10),
    maxStorageMB: parseInt(process.env.MAX_STORAGE_MB || '1024', 10),
    generateThumbnail: process.env.GENERATE_THUMBNAILS !== 'false',
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
  
  // Firebase validation only if path is provided
  if (config.firebase.serviceAccountPath && !existsSync(config.firebase.serviceAccountPath)) {
    errors.push(`Firebase service account not found: ${config.firebase.serviceAccountPath}`);
  }
  
  if (config.tunnel.enabled && !config.tunnel.token) {
    errors.push('CLOUDFLARE_TUNNEL_TOKEN is required when USE_CLOUDFLARE_TUNNEL=true');
  }
  
  return errors;
}
