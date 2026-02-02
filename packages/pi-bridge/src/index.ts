#!/usr/bin/env node

import { config, validateConfig } from './config.js';
import { initFirebase, registerCamera, sendHeartbeat, updateCameraStatus, uploadClip, saveDetection } from './firebase.js';
import { startStreaming, stopStreaming, probeStream, isStreaming, setRtspUrl } from './streamer.js';
import { startServer } from './server.js';
import { startTunnel, startQuickTunnel, stopTunnel, getPublicUrl } from './tunnel.js';
import { discoverCameras, connectCamera, getBestStreamUrl, autoConnect, type OnvifDevice } from './onvif.js';
import { initDetector, setDetectorSource, onBirdDetected, startDetection, stopDetection, type BirdDetection } from './detector.js';
import { initRecorder, setRecorderSource, recordClip, captureSnapshot, getClipBuffer, getThumbnailBuffer } from './recorder.js';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║               BirdCam Network - Pi Bridge                    ║
║                   Stream Relay v1.0.0                        ║
╚══════════════════════════════════════════════════════════════╝
`);

let cameraId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let onvifDevice: OnvifDevice | null = null;

async function resolveRtspUrl(): Promise<string> {
  // If ONVIF is enabled, discover/connect to get RTSP URL
  if (config.onvif.enabled) {
    console.log('[Main] ONVIF mode enabled');
    
    if (config.onvif.autoDiscover) {
      // Auto-discover cameras on the network
      console.log('[Main] Auto-discovering ONVIF cameras...');
      const result = await autoConnect(config.onvif.username, config.onvif.password);
      
      if (!result) {
        throw new Error('No ONVIF cameras found on the network');
      }
      
      onvifDevice = result.device;
      console.log(`[Main] Connected to: ${onvifDevice.manufacturer} ${onvifDevice.model}`);
      return result.rtspUrl;
    } else {
      // Connect to specific ONVIF host
      console.log(`[Main] Connecting to ONVIF camera at ${config.onvif.host}:${config.onvif.port}...`);
      onvifDevice = await connectCamera(
        config.onvif.host,
        config.onvif.port,
        config.onvif.username,
        config.onvif.password
      );
      
      console.log(`[Main] Connected to: ${onvifDevice.manufacturer} ${onvifDevice.model}`);
      console.log(`[Main] Available profiles:`);
      onvifDevice.profiles.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name}: ${p.resolution.width}x${p.resolution.height}`);
      });
      
      // Select specific profile if configured, otherwise auto-select best
      if (config.onvif.profileToken) {
        const profile = onvifDevice.profiles.find(p => p.token === config.onvif.profileToken);
        if (!profile || !profile.streamUri) {
          throw new Error(`ONVIF profile '${config.onvif.profileToken}' not found`);
        }
        
        let rtspUrl = profile.streamUri;
        if (config.onvif.username && config.onvif.password) {
          const url = new URL(rtspUrl);
          url.username = encodeURIComponent(config.onvif.username);
          url.password = encodeURIComponent(config.onvif.password);
          rtspUrl = url.toString();
        }
        return rtspUrl;
      }
      
      return getBestStreamUrl(onvifDevice, config.onvif.username, config.onvif.password);
    }
  }
  
  // Use direct RTSP URL from config
  return config.camera.rtspUrl;
}

async function main() {
  console.log(`[Main] Device ID: ${config.deviceId}`);
  console.log(`[Main] Camera: ${config.camera.name}`);
  
  // Validate configuration (allow missing Firebase in debug mode)
  const errors = validateConfig();
  const firebaseErrors = errors.filter(e => e.includes('Firebase') || e.includes('firebase'));
  const otherErrors = errors.filter(e => !e.includes('Firebase') && !e.includes('firebase'));
  
  if (otherErrors.length > 0) {
    console.error('[Main] Configuration errors:');
    otherErrors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  
  // Initialize Firebase (optional in debug mode)
  let firebaseEnabled = true;
  if (firebaseErrors.length > 0) {
    if (config.debug) {
      console.warn('[Main] Firebase not configured - running in local-only mode');
      console.warn('[Main] Camera registration and cloud sync disabled');
      firebaseEnabled = false;
    } else {
      console.error('[Main] Configuration errors:');
      firebaseErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }
  } else {
    console.log('[Main] Initializing Firebase...');
    try {
      initFirebase();
    } catch (err) {
      if (config.debug) {
        console.warn('[Main] Firebase init failed - running in local-only mode:', (err as Error).message);
        firebaseEnabled = false;
      } else {
        throw err;
      }
    }
  }
  
  // Resolve RTSP URL (from config or ONVIF)
  console.log('[Main] Resolving camera stream...');
  let rtspUrl: string;
  try {
    rtspUrl = await resolveRtspUrl();
    setRtspUrl(rtspUrl);
    console.log(`[Main] RTSP URL: ${rtspUrl.replace(/\/\/[^@]+@/, '//***@')}`);
  } catch (err) {
    console.error('[Main] Failed to resolve camera stream:', (err as Error).message);
    process.exit(1);
  }
  
  // Probe the camera stream
  console.log('[Main] Probing camera stream...');
  const streamInfo = await probeStream();
  if (streamInfo) {
    console.log(`[Main] Stream info: ${streamInfo.resolution} @ ${streamInfo.fps}fps (${streamInfo.codec})`);
  } else {
    console.warn('[Main] Could not probe stream - continuing anyway');
  }
  
  // Start HLS server
  console.log('[Main] Starting HLS server...');
  const localUrl = await startServer();
  
  // Start tunnel
  let publicUrl = localUrl;
  if (config.tunnel.enabled) {
    try {
      if (config.tunnel.token) {
        publicUrl = await startTunnel();
      } else {
        // Use quick tunnel if no token configured
        console.log('[Main] No tunnel token - using quick tunnel (random URL)');
        publicUrl = await startQuickTunnel();
      }
    } catch (err) {
      console.error('[Main] Tunnel failed:', (err as Error).message);
      console.log('[Main] Continuing with local-only access');
    }
  }
  
  // Start streaming
  console.log('[Main] Starting RTSP→HLS transcoding...');
  await startStreaming();
  
  // Wait for stream to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Register camera with BirdCam Network
  if (firebaseEnabled) {
    console.log('[Main] Registering with BirdCam Network...');
    try {
      cameraId = await registerCamera(
        '', // userId will be set when user claims the camera
        `${publicUrl}/stream.m3u8`,
        `${localUrl}/stream.m3u8`
      );
      console.log(`[Main] Registered camera: ${cameraId}`);
      
      // Update with stream info if available
      if (streamInfo) {
        await updateCameraStatus(cameraId, 'active', {
          codec: streamInfo.codec,
          resolution: streamInfo.resolution,
        });
      }
    } catch (err) {
      console.error('[Main] Failed to register camera:', (err as Error).message);
    }
  } else {
    console.log('[Main] Skipping cloud registration (local-only mode)');
  }
  
  // Initialize bird detection
  if (config.detection.enabled) {
    console.log('[Main] Setting up bird detection...');
    initDetector({
      minConfidence: config.detection.minConfidence,
      analysisInterval: config.detection.analysisInterval,
      sampleDuration: config.detection.sampleDuration,
      latitude: config.detection.latitude,
      longitude: config.detection.longitude,
      locale: config.detection.locale,
    });
    setDetectorSource(rtspUrl);
    
    // Initialize clip recording
    if (config.recording.enabled) {
      console.log('[Main] Setting up clip recording...');
      initRecorder({
        clipDuration: config.recording.clipDuration,
        preBuffer: config.recording.preBuffer,
        outputDir: config.recording.outputDir,
        maxClips: config.recording.maxClips,
        maxStorageMB: config.recording.maxStorageMB,
        generateThumbnail: config.recording.generateThumbnail,
      });
      setRecorderSource(rtspUrl);
    }
    
    // Handle bird detections
    onBirdDetected(async (detection: BirdDetection) => {
      console.log(`[Main] 🐦 Bird detected: ${detection.species} (${(detection.confidence * 100).toFixed(1)}%)`);
      
      // Record clip if enabled
      if (config.recording.enabled) {
        try {
          const clip = await recordClip('bird_detection', {
            species: detection.species,
            confidence: detection.confidence,
          });
          
          // Upload to Firebase if we have a camera ID
          if (cameraId) {
            console.log('[Main] Uploading detection to cloud...');
            try {
              const clipBuffer = getClipBuffer(clip.id);
              const thumbnailBuffer = clip.thumbnailPath ? getThumbnailBuffer(clip.id) : undefined;
              
              await saveDetection(cameraId, {
                species: detection.species,
                scientificName: detection.scientificName,
                confidence: detection.confidence,
                clipId: clip.id,
                clipBuffer,
                thumbnailBuffer,
                timestamp: detection.timestamp,
              });
              console.log('[Main] Detection uploaded successfully');
            } catch (uploadErr) {
              console.error('[Main] Upload failed:', (uploadErr as Error).message);
            }
          }
        } catch (recordErr) {
          console.error('[Main] Recording failed:', (recordErr as Error).message);
        }
      }
    });
    
    // Start detection
    await startDetection();
  }
  
  // Start heartbeat
  heartbeatInterval = setInterval(async () => {
    if (cameraId) {
      try {
        await sendHeartbeat(cameraId);
        if (config.debug) {
          console.log('[Main] Heartbeat sent');
        }
      } catch (err) {
        console.error('[Main] Heartbeat failed:', (err as Error).message);
      }
    }
  }, 30000); // Every 30 seconds
  
  // Ready!
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🐦 BirdCam Pi Bridge is running!');
  console.log('');
  console.log(`  Local:  ${localUrl}`);
  if (publicUrl !== localUrl) {
    console.log(`  Public: ${publicUrl}`);
  }
  console.log(`  Stream: ${publicUrl}/stream.m3u8`);
  console.log('');
  if (cameraId) {
    console.log(`  Camera ID: ${cameraId}`);
    console.log('  Add this camera in your BirdCam dashboard to start watching!');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[Main] Received ${signal}, shutting down...`);
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Stop detection
  stopDetection();
  
  // Update camera status to offline
  if (cameraId) {
    updateCameraStatus(cameraId, 'offline').catch(() => {});
  }
  
  stopStreaming();
  stopTunnel();
  
  setTimeout(() => {
    console.log('[Main] Goodbye!');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Run
main().catch((err) => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
