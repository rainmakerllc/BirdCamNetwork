#!/usr/bin/env node

/**
 * BirdCam Pi Bridge - Main Entry Point
 * 
 * Connects IP cameras to the BirdCam Network with:
 * - ONVIF discovery and connection
 * - RTSP to HLS transcoding
 * - Motion detection with clip recording
 * - PTZ camera control
 * - Web dashboard for management
 * - Firebase integration for cloud sync
 */

import { config, validateConfig } from './config.js';
import { initFirebase, registerCamera, sendHeartbeat, updateCameraStatus } from './firebase.js';
import { startStreaming, stopStreaming, probeStream, isStreaming, setRtspUrl } from './streamer.js';
import { startServer, setPtzController } from './server.js';
import { startTunnel, startQuickTunnel, stopTunnel, getPublicUrl } from './tunnel.js';
import { discoverCameras, connectCamera, getBestStreamUrl, autoConnect, type OnvifDevice } from './onvif.js';
import { getMotionDetector, stopMotionDetection, type MotionEvent } from './motion.js';
import { getRecorder } from './recorder.js';
import { createPtzController, type PtzController } from './ptz.js';
import { createAmcrestPtzController, isAmcrestCamera, type AmcrestPtzController } from './amcrest-ptz.js';
import { startGo2rtc, stopGo2rtc, isGo2rtcRunning, ensureGo2rtc } from './webrtc.js';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║               BirdCam Network - Pi Bridge                    ║
║                   Stream Relay v1.1.0                        ║
║                                                              ║
║   Features: ONVIF • HLS • Motion • PTZ • Recording • Web     ║
╚══════════════════════════════════════════════════════════════╝
`);

let cameraId: string | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let onvifDevice: OnvifDevice | null = null;
let ptzController: PtzController | AmcrestPtzController | null = null;

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

async function initializePtz(): Promise<void> {
  if (!config.onvif.enabled || !onvifDevice) {
    console.log('[Main] PTZ: Not available (ONVIF not enabled)');
    return;
  }

  try {
    const profileToken = onvifDevice.profiles[0]?.token;
    if (!profileToken) {
      console.log('[Main] PTZ: No profile token available');
      return;
    }

    // Determine which PTZ controller to use
    const ptzMode = config.ptz.mode;
    const isAmcrest = isAmcrestCamera(onvifDevice.manufacturer, onvifDevice.model);
    
    // Decide: use Amcrest CGI if mode is 'amcrest' OR (mode is 'auto' AND camera is Amcrest)
    const useAmcrestCgi = ptzMode === 'amcrest' || (ptzMode === 'auto' && isAmcrest);
    
    if (useAmcrestCgi) {
      console.log(`[Main] PTZ: Using Amcrest CGI API (mode=${ptzMode}, detected=${isAmcrest ? 'Amcrest' : 'other'})`);
      
      ptzController = createAmcrestPtzController(
        config.onvif.host,
        config.onvif.port,
        config.onvif.username,
        config.onvif.password,
        config.ptz.channel
      );
    } else {
      console.log(`[Main] PTZ: Using ONVIF protocol (mode=${ptzMode})`);
      
      ptzController = createPtzController(
        config.onvif.host,
        config.onvif.port,
        config.onvif.username,
        config.onvif.password,
        profileToken
      );
    }

    const capabilities = await ptzController.getCapabilities();
    if (capabilities.supported) {
      console.log(`[Main] PTZ: Enabled via ${useAmcrestCgi ? 'Amcrest CGI' : 'ONVIF'}`);
      setPtzController(ptzController as PtzController);
    } else {
      console.log('[Main] PTZ: Camera does not support PTZ');
      ptzController = null;
    }
  } catch (err) {
    console.warn('[Main] PTZ: Failed to initialize:', (err as Error).message);
    ptzController = null;
  }
}

async function initializeMotionDetection(rtspUrl: string): Promise<void> {
  if (process.env.MOTION_DETECTION_ENABLED === 'false') {
    console.log('[Main] Motion detection: Disabled by config');
    return;
  }

  const recorder = getRecorder({
    clipsDir: process.env.CLIPS_DIR || '/var/birdcam/clips',
    snapshotsDir: process.env.SNAPSHOTS_DIR || '/var/birdcam/snapshots',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '7', 10),
    maxStorageMb: parseInt(process.env.MAX_STORAGE_MB || '10000', 10),
  });
  recorder.setRtspUrl(rtspUrl);

  const motion = getMotionDetector({
    enabled: true,
    sensitivity: parseInt(process.env.MOTION_SENSITIVITY || '50', 10),
    cooldownMs: parseInt(process.env.MOTION_COOLDOWN_MS || '5000', 10),
  });

  // On motion, start recording and capture snapshot
  motion.on('motion', async (event: MotionEvent) => {
    console.log(`[Main] Motion detected! Confidence: ${event.confidence.toFixed(1)}%`);
    
    // Capture snapshot
    const snapshot = await recorder.captureSnapshot('motion');
    if (snapshot) {
      event.snapshotPath = snapshot.path;
    }
    
    // Start recording if not already
    if (!recorder.isRecording()) {
      await recorder.startRecording('motion');
      
      // Auto-stop after configured duration
      setTimeout(() => {
        if (recorder.isRecording()) {
          recorder.stopRecording();
        }
      }, 15000); // 15 second clips
    }
    
    // Update Firebase if connected
    if (cameraId) {
      try {
        await updateCameraStatus(cameraId, 'motion', {
          confidence: event.confidence,
          snapshot: snapshot?.path,
        });
      } catch {}
    }
  });

  motion.on('motionEnd', () => {
    console.log('[Main] Motion ended');
  });

  // Start motion detection
  try {
    await motion.start(rtspUrl);
    console.log('[Main] Motion detection: Enabled');
  } catch (err) {
    console.warn('[Main] Motion detection: Failed to start:', (err as Error).message);
  }
}

async function main() {
  console.log(`[Main] Device ID: ${config.deviceId}`);
  console.log(`[Main] Camera: ${config.camera.name}`);
  
  // Validate configuration
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error('[Main] Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  
  // Initialize Firebase (if configured)
  if (config.firebase.enabled) {
    console.log('[Main] Initializing Firebase...');
    try {
      initFirebase();
    } catch (err) {
      console.warn('[Main] Firebase init failed:', (err as Error).message);
      console.warn('[Main] Continuing without cloud sync...');
    }
  } else {
    console.log('[Main] Firebase: Disabled (no service account configured)');
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
  
  // Initialize PTZ control
  await initializePtz();
  
  // Start HLS server
  console.log('[Main] Starting web server...');
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
  
  // Start streaming based on mode
  const streamMode = config.streaming.mode;
  console.log(`[Main] Stream mode: ${streamMode}`);
  
  // Start WebRTC if enabled
  let webrtcEnabled = false;
  if (streamMode === 'webrtc' || streamMode === 'auto') {
    console.log('[Main] Initializing WebRTC (go2rtc)...');
    const go2rtcReady = await startGo2rtc(rtspUrl);
    if (go2rtcReady) {
      webrtcEnabled = true;
      console.log('[Main] WebRTC streaming enabled');
    } else {
      console.warn('[Main] WebRTC init failed, will use HLS only');
    }
  }
  
  // Start HLS streaming (always needed as fallback or if webrtc-only mode failed)
  if (streamMode === 'hls' || streamMode === 'auto' || !webrtcEnabled) {
    console.log('[Main] Starting RTSP→HLS transcoding...');
    await startStreaming();
  }
  
  // Wait for streams to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Initialize motion detection
  await initializeMotionDetection(rtspUrl);
  
  // Register camera with BirdCam Network (if Firebase enabled)
  if (config.firebase.enabled) {
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
          ptzSupported: ptzController !== null,
        });
      }
    } catch (err) {
      console.warn('[Main] Failed to register camera:', (err as Error).message);
      console.warn('[Main] Continuing without cloud registration...');
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
  } else {
    console.log('[Main] Cloud registration: Skipped (Firebase disabled)');
  }
  
  // Print startup summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🐦 BirdCam Pi Bridge is running!');
  console.log('');
  console.log(`  📺 Dashboard: ${localUrl}`);
  if (publicUrl !== localUrl) {
    console.log(`  🌍 Public:    ${publicUrl}`);
  }
  console.log(`  🎥 HLS:       ${publicUrl}/stream.m3u8`);
  if (webrtcEnabled) {
    console.log(`  ⚡ WebRTC:    Enabled (via go2rtc)`);
  }
  console.log('');
  console.log('  Features:');
  console.log(`    • Stream Mode: ${streamMode.toUpperCase()}`);
  console.log(`    • WebRTC:      ${webrtcEnabled ? '✅ Enabled' : '❌ Not available'}`);
  console.log(`    • HLS:         ${isStreaming() ? '✅ Active' : '⏳ Starting...'}`);
  console.log(`    • PTZ Control: ${ptzController ? '✅ Enabled' : '❌ Not available'}`);
  console.log(`    • Motion:      ${getMotionDetector().isRunning() ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`    • Recording:   ✅ Ready`);
  console.log('');
  if (cameraId) {
    console.log(`  🔗 Camera ID: ${cameraId}`);
    console.log('     Add this camera in your BirdCam dashboard!');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[Main] Received ${signal}, shutting down...`);
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // Stop motion detection
  stopMotionDetection();
  
  // Update camera status to offline
  if (cameraId) {
    updateCameraStatus(cameraId, 'offline').catch(() => {});
  }
  
  // Stop streaming services
  stopGo2rtc();
  stopStreaming();
  stopTunnel();
  
  setTimeout(() => {
    console.log('[Main] Goodbye! 🐦');
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
