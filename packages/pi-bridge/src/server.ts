/**
 * Web Server Module
 * 
 * Serves HLS stream, provides REST API, and hosts a web dashboard
 * for camera management, PTZ control, recording, and monitoring.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import { existsSync, statSync, createReadStream, readFileSync } from 'fs';
import { config } from './config.js';
import { getStreamStats, isStreaming, probeStream } from './streamer.js';
import { getRecorder, type ClipInfo, type SnapshotInfo } from './recorder.js';
import { getMotionDetector, type MotionConfig } from './motion.js';
import { PtzController, createPtzController, type PtzCapabilities, type PtzPreset } from './ptz.js';
import type { AmcrestPtzController } from './amcrest-ptz.js';
import { isGo2rtcRunning, proxyToGo2rtc, getGo2rtcApiPort } from './webrtc.js';
import { getCameraTime, setCameraTime, checkTimeSync } from './onvif.js';
import { getSettings, RESOLUTION_PRESETS, type VideoSettings } from './settings.js';
import { initAuth, authMiddleware, isAuthConfigured, getApiKey } from './auth.js';
import { getPresetManager } from './ptz-presets.js';
import { getBirdTracker } from './bird-tracker.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,  // Allow embedding video
}));

// Rate limiting - prevent brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 1000,  // 1000 requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth failures
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,  // 20 failed attempts per 15 min
  message: { error: 'Too many authentication attempts' },
  skipSuccessfulRequests: true,
});
app.use('/api', authLimiter);

app.use(cors());
app.use(express.json());

// Initialize authentication
initAuth();

// Apply auth to all routes except health
app.use(authMiddleware);

// Global PTZ controller (set when camera connects)
// Supports both ONVIF PtzController and AmcrestPtzController
let ptzController: PtzController | AmcrestPtzController | null = null;

export function setPtzController(controller: PtzController | AmcrestPtzController): void {
  ptzController = controller;
}

// Middleware for API error handling
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => 
    Promise.resolve(fn(req, res, next)).catch(next);

// ==================== Health & Info ====================

app.get('/health', (req, res) => {
  const recorder = getRecorder();
  const motion = getMotionDetector();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    deviceId: config.deviceId,
    uptime: process.uptime(),
    streaming: isStreaming(),
    streamStats: getStreamStats(),
    webrtc: isGo2rtcRunning(),
    streamMode: config.streaming.mode,
    motionDetection: motion.isRunning(),
    recording: recorder.isRecording(),
    storage: recorder.getStorageStats(),
  });
});

app.get('/info', asyncHandler(async (req, res) => {
  const recorder = getRecorder();
  const motion = getMotionDetector();
  const streamInfo = await probeStream();
  
  res.json({
    device: {
      id: config.deviceId,
      name: config.camera.name,
      location: config.camera.location,
    },
    camera: {
      onvif: config.onvif.enabled,
      host: config.onvif.host || config.camera.host || 'N/A',
      stream: streamInfo,
    },
    status: {
      streaming: isStreaming(),
      motionDetection: motion.isRunning(),
      recording: recorder.isRecording(),
    },
    storage: recorder.getStorageStats(),
    ptz: ptzController ? await ptzController.getCapabilities() : { supported: false },
  });
}));

// ==================== Stream ====================

// HLS manifest
app.get('/stream.m3u8', (req, res) => {
  const filePath = join(config.hls.outputDir, 'stream.m3u8');
  
  if (!existsSync(filePath)) {
    res.status(503).json({ error: 'Stream not ready', hint: 'Wait for transcoding to start' });
    return;
  }
  
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  createReadStream(filePath).pipe(res);
});

// HLS segments
app.get('/segment:num.ts', (req, res) => {
  const filePath = join(config.hls.outputDir, `segment${req.params.num}.ts`);
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }
  
  const stat = statSync(filePath);
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'max-age=3600');
  createReadStream(filePath).pipe(res);
});

// ==================== WebRTC ====================

// WebRTC status
app.get('/api/webrtc/status', (req, res) => {
  res.json({
    available: isGo2rtcRunning(),
    streamMode: config.streaming.mode,
    go2rtcPort: getGo2rtcApiPort(),
  });
});

// WebRTC signaling - POST offer, receive answer
app.post('/api/webrtc/offer', asyncHandler(async (req, res) => {
  if (!isGo2rtcRunning()) {
    res.status(503).json({ error: 'WebRTC not available', hint: 'go2rtc is not running' });
    return;
  }
  
  try {
    // Proxy the offer to go2rtc
    const answer = await proxyToGo2rtc('/api/webrtc?src=birdcam', 'POST', req.body);
    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}));

// WebRTC ICE candidates
app.post('/api/webrtc/candidate', asyncHandler(async (req, res) => {
  if (!isGo2rtcRunning()) {
    res.status(503).json({ error: 'WebRTC not available' });
    return;
  }
  
  try {
    await proxyToGo2rtc('/api/webrtc?src=birdcam', 'POST', req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}));

// Proxy to go2rtc streams info (useful for debugging)
app.get('/api/webrtc/streams', asyncHandler(async (req, res) => {
  if (!isGo2rtcRunning()) {
    res.status(503).json({ error: 'WebRTC not available' });
    return;
  }
  
  try {
    const streams = await proxyToGo2rtc('/api/streams', 'GET');
    res.json(streams);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}));

// ==================== Snapshots ====================

// Capture snapshot
app.post('/api/snapshot', asyncHandler(async (req, res) => {
  const recorder = getRecorder();
  const snapshot = await recorder.captureSnapshot(req.body?.reason || 'api');
  
  if (snapshot) {
    res.json({ success: true, snapshot });
  } else {
    res.status(500).json({ success: false, error: 'Failed to capture snapshot' });
  }
}));

// Get latest snapshot as image
app.get('/api/snapshot/latest', asyncHandler(async (req, res) => {
  const recorder = getRecorder();
  const snapshots = recorder.listSnapshots();
  
  if (snapshots.length === 0) {
    // Capture one now
    const snapshot = await recorder.captureSnapshot('api');
    if (snapshot && existsSync(snapshot.path)) {
      res.setHeader('Content-Type', 'image/jpeg');
      createReadStream(snapshot.path).pipe(res);
      return;
    }
    res.status(404).json({ error: 'No snapshots available' });
    return;
  }
  
  const latest = snapshots[0];
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(latest.path).pipe(res);
}));

// List snapshots
app.get('/api/snapshots', (req, res) => {
  const recorder = getRecorder();
  const snapshots = recorder.listSnapshots();
  res.json({ count: snapshots.length, snapshots });
});

// Get specific snapshot
app.get('/api/snapshots/:id', (req, res) => {
  const recorder = getRecorder();
  const snapshots = recorder.listSnapshots();
  const snapshot = snapshots.find(s => s.id === req.params.id);
  
  if (!snapshot || !existsSync(snapshot.path)) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }
  
  res.setHeader('Content-Type', 'image/jpeg');
  createReadStream(snapshot.path).pipe(res);
});

// ==================== Recording ====================

// Start recording
app.post('/api/recording/start', asyncHandler(async (req, res) => {
  const recorder = getRecorder();
  const trigger = req.body?.trigger || 'manual';
  const id = await recorder.startRecording(trigger);
  
  if (id) {
    res.json({ success: true, recordingId: id });
  } else {
    res.status(500).json({ success: false, error: 'Failed to start recording' });
  }
}));

// Stop recording
app.post('/api/recording/stop', (req, res) => {
  const recorder = getRecorder();
  recorder.stopRecording();
  res.json({ success: true });
});

// Recording status
app.get('/api/recording/status', (req, res) => {
  const recorder = getRecorder();
  res.json({
    recording: recorder.isRecording(),
    storage: recorder.getStorageStats(),
  });
});

// List clips
app.get('/api/clips', (req, res) => {
  const recorder = getRecorder();
  const clips = recorder.listClips();
  res.json({ count: clips.length, clips });
});

// Get clip video
app.get('/api/clips/:id/video', (req, res) => {
  const recorder = getRecorder();
  const clips = recorder.listClips();
  const clip = clips.find(c => c.id === req.params.id);
  
  if (!clip || !existsSync(clip.path)) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }
  
  const stat = statSync(clip.path);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  createReadStream(clip.path).pipe(res);
});

// Get clip thumbnail
app.get('/api/clips/:id/thumbnail', (req, res) => {
  const recorder = getRecorder();
  const clips = recorder.listClips();
  const clip = clips.find(c => c.id === req.params.id);
  
  if (!clip || !clip.thumbnail || !existsSync(clip.thumbnail)) {
    res.status(404).json({ error: 'Thumbnail not found' });
    return;
  }
  
  res.setHeader('Content-Type', 'image/jpeg');
  createReadStream(clip.thumbnail).pipe(res);
});

// Delete clip
app.delete('/api/clips/:id', (req, res) => {
  const recorder = getRecorder();
  const success = recorder.deleteClip(req.params.id);
  res.json({ success });
});

// ==================== Motion Detection ====================

// Get motion config
app.get('/api/motion/config', (req, res) => {
  const motion = getMotionDetector();
  res.json(motion.getConfig());
});

// Update motion config
app.post('/api/motion/config', (req, res) => {
  const motion = getMotionDetector();
  motion.updateConfig(req.body);
  res.json({ success: true, config: motion.getConfig() });
});

// Motion status
app.get('/api/motion/status', (req, res) => {
  const motion = getMotionDetector();
  res.json({
    running: motion.isRunning(),
    config: motion.getConfig(),
  });
});

// ==================== PTZ Control ====================

// PTZ capabilities
app.get('/api/ptz/capabilities', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.json({ supported: false, error: 'PTZ not available' });
    return;
  }
  
  const capabilities = await ptzController.getCapabilities();
  res.json(capabilities);
}));

// PTZ status/position
app.get('/api/ptz/status', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.json({ supported: false });
    return;
  }
  
  const position = await ptzController.getPosition();
  const capabilities = await ptzController.getCapabilities();
  
  res.json({
    supported: capabilities.supported,
    position,
    capabilities,
  });
}));

// PTZ move commands
app.post('/api/ptz/move', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.status(400).json({ success: false, error: 'PTZ not available' });
    return;
  }
  
  const { pan = 0, tilt = 0, zoom = 0, type = 'continuous' } = req.body;
  let success = false;
  
  switch (type) {
    case 'continuous':
      success = await ptzController.continuousMove(pan, tilt, zoom);
      break;
    case 'absolute':
      success = await ptzController.absoluteMove(pan, tilt, zoom);
      break;
    case 'relative':
      success = await ptzController.relativeMove(pan, tilt, zoom);
      break;
  }
  
  res.json({ success });
}));

// PTZ stop
app.post('/api/ptz/stop', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.status(400).json({ success: false, error: 'PTZ not available' });
    return;
  }
  
  const success = await ptzController.stop();
  res.json({ success });
}));

// PTZ home
app.post('/api/ptz/home', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.status(400).json({ success: false, error: 'PTZ not available' });
    return;
  }
  
  const success = await ptzController.goHome();
  res.json({ success });
}));

// PTZ presets
app.get('/api/ptz/presets', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.json({ presets: [] });
    return;
  }
  
  const presets = await ptzController.getPresets();
  res.json({ presets });
}));

app.post('/api/ptz/presets/:token', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.status(400).json({ success: false, error: 'PTZ not available' });
    return;
  }
  
  const success = await ptzController.gotoPreset(req.params.token);
  res.json({ success });
}));

app.put('/api/ptz/presets', asyncHandler(async (req, res) => {
  if (!ptzController) {
    res.status(400).json({ success: false, error: 'PTZ not available' });
    return;
  }
  
  const { name } = req.body;
  const token = await ptzController.setPreset(name);
  res.json({ success: !!token, token });
}));

// ==================== Camera Time ====================

// Get camera time
app.get('/api/camera/time', asyncHandler(async (req, res) => {
  if (!config.onvif.enabled || !config.onvif.host) {
    res.status(400).json({ error: 'ONVIF not configured' });
    return;
  }
  
  const timeInfo = await getCameraTime(
    config.onvif.host,
    config.onvif.port,
    config.onvif.username,
    config.onvif.password
  );
  
  if (!timeInfo) {
    res.status(500).json({ error: 'Failed to get camera time' });
    return;
  }
  
  // Also check sync status
  const syncStatus = await checkTimeSync(
    config.onvif.host,
    config.onvif.port,
    config.onvif.username,
    config.onvif.password
  );
  
  res.json({
    ...timeInfo,
    syncStatus: syncStatus ? {
      synced: syncStatus.synced,
      diffSeconds: syncStatus.diffSeconds,
      systemTime: syncStatus.systemTime,
    } : null,
  });
}));

// Sync camera time to system time
app.post('/api/camera/time/sync', asyncHandler(async (req, res) => {
  if (!config.onvif.enabled || !config.onvif.host) {
    res.status(400).json({ success: false, error: 'ONVIF not configured' });
    return;
  }
  
  const { useNtp } = req.body || {};
  
  const success = await setCameraTime(
    config.onvif.host,
    config.onvif.port,
    config.onvif.username,
    config.onvif.password,
    useNtp || false
  );
  
  if (success) {
    // Get updated time info
    const timeInfo = await getCameraTime(
      config.onvif.host,
      config.onvif.port,
      config.onvif.username,
      config.onvif.password
    );
    
    res.json({ 
      success: true, 
      message: useNtp ? 'Camera set to NTP mode' : 'Camera time synchronized',
      time: timeInfo,
    });
  } else {
    res.status(500).json({ success: false, error: 'Failed to sync camera time' });
  }
}));

// ==================== Settings ====================

// Get all settings
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  res.json({
    ...settings.getAll(),
    resolutionPresets: RESOLUTION_PRESETS,
  });
});

// Get video settings
app.get('/api/settings/video', (req, res) => {
  const settings = getSettings();
  res.json(settings.getVideo());
});

// Update video settings
app.post('/api/settings/video', (req, res) => {
  const settings = getSettings();
  const updates = req.body as Partial<VideoSettings>;
  
  // Validate resolution
  if (updates.outputResolution && 
      !['1080p', '720p', '480p', 'source', 'custom'].includes(updates.outputResolution)) {
    res.status(400).json({ error: 'Invalid resolution preset' });
    return;
  }
  
  // Validate quality preset
  if (updates.qualityPreset && 
      !['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(updates.qualityPreset)) {
    res.status(400).json({ error: 'Invalid quality preset' });
    return;
  }
  
  const updated = settings.updateVideo(updates);
  res.json({ 
    success: true, 
    settings: updated,
    message: 'Settings saved. Restart stream to apply changes.',
  });
});

// Reset settings to defaults
app.post('/api/settings/reset', (req, res) => {
  const settings = getSettings();
  const defaults = settings.reset();
  res.json({ 
    success: true, 
    settings: defaults,
    message: 'Settings reset to defaults.',
  });
});

// Apply settings (restart stream)
app.post('/api/settings/apply', asyncHandler(async (req, res) => {
  const { stopStreaming, startStreaming, isStreaming } = await import('./streamer.js');
  
  if (isStreaming()) {
    console.log('[Settings] Restarting stream to apply settings...');
    stopStreaming();
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await startStreaming();
    res.json({ success: true, message: 'Stream restarted with new settings.' });
  } else {
    res.json({ success: true, message: 'Settings saved. Stream not running.' });
  }
}));

// ==================== Enhanced Preset Management ====================

// Get all saved presets
app.get('/api/presets', (req, res) => {
  const presetManager = getPresetManager();
  res.json({
    presets: presetManager.getPresets(),
    patrol: presetManager.getPatrolConfig(),
    patrolActive: presetManager.isPatrolling(),
  });
});

// Save a preset
app.post('/api/presets', asyncHandler(async (req, res) => {
  const presetManager = getPresetManager();
  
  if (req.body.createFromCurrent) {
    // Create from current camera position
    const preset = await presetManager.createPresetFromCurrent(
      req.body.name,
      req.body.description
    );
    res.json({ success: !!preset, preset });
  } else {
    // Save preset data
    const preset = await presetManager.savePreset(req.body);
    res.json({ success: true, preset });
  }
}));

// Go to a saved preset
app.post('/api/presets/:id/goto', asyncHandler(async (req, res) => {
  const presetManager = getPresetManager();
  const success = await presetManager.gotoPreset(req.params.id);
  res.json({ success });
}));

// Delete a preset
app.delete('/api/presets/:id', (req, res) => {
  const presetManager = getPresetManager();
  const success = presetManager.deletePreset(req.params.id);
  res.json({ success });
});

// Patrol mode
app.post('/api/patrol/start', (req, res) => {
  const presetManager = getPresetManager();
  const success = presetManager.startPatrol();
  res.json({ success });
});

app.post('/api/patrol/stop', (req, res) => {
  const presetManager = getPresetManager();
  presetManager.stopPatrol();
  res.json({ success: true });
});

app.post('/api/patrol/config', (req, res) => {
  const presetManager = getPresetManager();
  const config = presetManager.setPatrolConfig(req.body);
  res.json({ success: true, config });
});

// ==================== Bird Tracking ====================

// Get bird tracking summary
app.get('/api/birds/summary', (req, res) => {
  const tracker = getBirdTracker();
  res.json(tracker.getSummary());
});

// Get life list
app.get('/api/birds/lifelist', (req, res) => {
  const tracker = getBirdTracker();
  res.json({
    species: tracker.getLifeList(),
    count: tracker.getSpeciesCount(),
  });
});

// Get recent sightings
app.get('/api/birds/sightings', (req, res) => {
  const tracker = getBirdTracker();
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({
    sightings: tracker.getRecentSightings(limit),
  });
});

// Get sightings for today
app.get('/api/birds/today', (req, res) => {
  const tracker = getBirdTracker();
  res.json(tracker.getDailyStats());
});

// Get species stats
app.get('/api/birds/species/:name', (req, res) => {
  const tracker = getBirdTracker();
  const stats = tracker.getSpeciesStats(req.params.name);
  if (stats) {
    res.json(stats);
  } else {
    res.status(404).json({ error: 'Species not found' });
  }
});

// Get top species
app.get('/api/birds/top', (req, res) => {
  const tracker = getBirdTracker();
  const limit = parseInt(req.query.limit as string) || 10;
  res.json({
    species: tracker.getTopSpecies(limit),
  });
});

// Get activity heatmap
app.get('/api/birds/heatmap', (req, res) => {
  const tracker = getBirdTracker();
  res.json({
    heatmap: tracker.getActivityHeatmap(),
    labels: {
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      hours: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    },
  });
});

// Search sightings
app.get('/api/birds/search', (req, res) => {
  const tracker = getBirdTracker();
  const query = req.query.q as string || '';
  const minConfidence = parseFloat(req.query.minConfidence as string) || undefined;
  
  const results = tracker.search(query, { minConfidence });
  res.json({
    query,
    count: results.length,
    sightings: results.slice(0, 100), // Limit response
  });
});

// Export all data
app.get('/api/birds/export', (req, res) => {
  const tracker = getBirdTracker();
  res.json(tracker.exportData());
});

// ==================== Web Dashboard ====================

app.get('/', (req, res) => {
  res.send(getDashboardHtml());
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server] Error:', err.message);
  res.status(500).json({ error: err.message });
});

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.camera.name} - BirdCam Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
      --webrtc: #3b82f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); 
      color: var(--text);
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.5rem; display: flex; align-items: center; gap: 10px; }
    h1 span { font-size: 1.8rem; }
    .status-badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .status-badge { 
      padding: 4px 12px; 
      border-radius: 20px; 
      font-size: 0.8rem;
      font-weight: 500;
    }
    .status-live { background: var(--accent); color: #000; }
    .status-offline { background: var(--danger); }
    .status-webrtc { background: var(--webrtc); color: white; }
    .status-hls { background: var(--warning); color: #000; }
    .status-onvif { background: #8b5cf6; color: white; }
    
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
    
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card:last-child { margin-bottom: 0; }
    .card h2 { font-size: 1rem; margin-bottom: 12px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
    
    .video-container { position: relative; background: #000; border-radius: 8px; overflow: hidden; }
    video { width: 100%; display: block; min-height: 300px; }
    .video-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 10px;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .video-mode {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .video-latency {
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      background: rgba(0,0,0,0.7);
    }
    
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--accent); color: #000; }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
    .btn-danger { background: var(--danger); color: white; }
    .btn-warning { background: var(--warning); color: #000; }
    .btn-secondary { background: var(--border); color: var(--text); }
    .btn-sm { padding: 4px 8px; font-size: 0.8rem; }
    .btn-icon { padding: 8px; font-size: 1.2rem; }
    
    .ptz-container { text-align: center; }
    .ptz-controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      max-width: 180px;
      margin: 0 auto 12px;
    }
    .ptz-btn {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      background: var(--border);
      border: none;
      border-radius: 8px;
      color: var(--text);
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .ptz-btn:hover { background: #475569; }
    .ptz-btn:active, .ptz-btn.active { background: var(--accent); color: #000; transform: scale(0.95); }
    .ptz-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .ptz-zoom {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 8px;
    }
    .ptz-zoom .ptz-btn { aspect-ratio: auto; padding: 8px 16px; font-size: 1rem; }
    .ptz-presets { margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .ptz-status { font-size: 0.8rem; color: var(--muted); margin-top: 8px; }
    
    .stats { display: grid; gap: 6px; }
    .stat { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      padding: 6px 0; 
      border-bottom: 1px solid var(--border); 
      font-size: 0.9rem;
    }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--muted); }
    .stat-value { font-weight: 500; }
    .stat-value.good { color: var(--accent); }
    .stat-value.warning { color: var(--warning); }
    .stat-value.error { color: var(--danger); }
    
    .time-sync { 
      margin-top: 12px; 
      padding-top: 12px; 
      border-top: 1px solid var(--border);
    }
    .time-sync-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }
    .time-sync-status .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .time-sync-status .dot.synced { background: var(--accent); }
    .time-sync-status .dot.warning { background: var(--warning); }
    .time-sync-status .dot.error { background: var(--danger); }
    
    .clips-list { max-height: 250px; overflow-y: auto; }
    .clip-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: 6px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.05);
    }
    .clip-thumb {
      width: 70px;
      height: 40px;
      background: #000;
      border-radius: 4px;
      object-fit: cover;
    }
    .clip-info { flex: 1; min-width: 0; }
    .clip-info div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .clip-time { font-size: 0.75rem; color: var(--muted); }
    
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    
    .alert {
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 0.9rem;
    }
    .alert-warning { background: rgba(245, 158, 11, 0.2); border: 1px solid var(--warning); }
    .alert-error { background: rgba(239, 68, 68, 0.2); border: 1px solid var(--danger); }
    
    /* Modal styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s;
    }
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    .modal {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      transform: scale(0.95);
      transition: transform 0.2s;
    }
    .modal-overlay.active .modal {
      transform: scale(1);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .modal-header h3 {
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--muted);
      padding: 4px;
    }
    .modal-close:hover { color: var(--text); }
    .modal-body {
      padding: 20px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid var(--border);
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    .form-group:last-child { margin-bottom: 0; }
    .form-label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.9rem;
      color: var(--muted);
    }
    .form-input, .form-select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.95rem;
    }
    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: var(--accent);
    }
    .form-hint {
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 4px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .form-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .form-checkbox input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }
    .settings-section {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .settings-section:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .settings-section h4 {
      font-size: 0.9rem;
      color: var(--accent);
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><span>🐦</span> ${config.camera.name}</h1>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="status-badges">
          <span class="status-badge status-live" id="status">● LIVE</span>
          <span class="status-badge" id="mode-badge">-</span>
          <span class="status-badge status-onvif" id="onvif-badge" style="display:none">ONVIF</span>
        </div>
        <button class="btn btn-secondary" onclick="openSettings()" title="Settings">⚙️</button>
      </div>
    </header>
    
    <div id="time-alert" class="alert alert-warning" style="display:none">
      ⚠️ <strong>Camera time out of sync!</strong> ONVIF authentication may fail. 
      <button class="btn btn-sm btn-warning" onclick="syncTime()">Sync Now</button>
    </div>
    
    <div class="grid">
      <div>
        <div class="card video-container">
          <video id="video" controls autoplay muted playsinline></video>
          <div class="video-latency" id="video-latency">--</div>
          <div class="video-mode" id="video-mode">Loading...</div>
          <div class="video-overlay">
            <span id="stream-info">Loading...</span>
            <div>
              <button class="btn btn-icon" onclick="toggleStreamMode()" title="Switch Mode">🔄</button>
              <button class="btn btn-icon" onclick="takeSnapshot()" title="Snapshot">📸</button>
              <button class="btn btn-icon" onclick="toggleRecording()" id="record-btn" title="Record">⏺️</button>
            </div>
          </div>
        </div>
        
        <div class="actions">
          <button class="btn btn-primary" onclick="takeSnapshot()">📸 Snapshot</button>
          <button class="btn btn-danger" onclick="toggleRecording()" id="record-btn-main">⏺️ Record</button>
          <button class="btn btn-secondary" onclick="toggleStreamMode()">🔄 Mode</button>
          <button class="btn btn-secondary" onclick="openSettings()">⚙️ Settings</button>
          <button class="btn btn-secondary" onclick="refreshAll()">🔄 Refresh</button>
        </div>
        
        <div class="card">
          <h2>🎮 PTZ Control</h2>
          <div class="ptz-container">
            <div class="ptz-controls" id="ptz-controls">
              <div></div>
              <button class="ptz-btn" data-pan="0" data-tilt="0.5" data-zoom="0">⬆️</button>
              <div></div>
              <button class="ptz-btn" data-pan="-0.5" data-tilt="0" data-zoom="0">⬅️</button>
              <button class="ptz-btn" onclick="ptzHome()" title="Home">🏠</button>
              <button class="ptz-btn" data-pan="0.5" data-tilt="0" data-zoom="0">➡️</button>
              <div></div>
              <button class="ptz-btn" data-pan="0" data-tilt="-0.5" data-zoom="0">⬇️</button>
              <div></div>
            </div>
            <div class="ptz-zoom">
              <button class="ptz-btn" data-pan="0" data-tilt="0" data-zoom="0.3">🔍+</button>
              <button class="ptz-btn" data-pan="0" data-tilt="0" data-zoom="-0.3">🔍−</button>
            </div>
            <div class="ptz-presets" id="ptz-presets"></div>
            <div class="ptz-status" id="ptz-status">PTZ: Checking...</div>
          </div>
        </div>
      </div>
      
      <div>
        <div class="card">
          <h2>📊 Camera Status</h2>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">Device ID</span>
              <span class="stat-value" style="font-size:0.8rem">${config.deviceId}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Stream Mode</span>
              <span class="stat-value" id="stream-mode-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Resolution</span>
              <span class="stat-value" id="resolution-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Latency</span>
              <span class="stat-value" id="latency-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Connection</span>
              <span class="stat-value" id="connection-status">-</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>🔌 ONVIF Status</h2>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">ONVIF</span>
              <span class="stat-value" id="onvif-status">${config.onvif.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Camera IP</span>
              <span class="stat-value">${config.onvif.host || config.camera.host || 'N/A'}</span>
            </div>
            <div class="stat">
              <span class="stat-label">PTZ Support</span>
              <span class="stat-value" id="ptz-support-status">-</span>
            </div>
          </div>
          <div class="time-sync">
            <div class="time-sync-status">
              <span class="dot" id="time-sync-dot"></span>
              <span id="time-sync-text">Checking time sync...</span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="syncTime()" id="sync-time-btn">
              🔄 Sync Camera Time
            </button>
          </div>
        </div>
        
        <div class="card">
          <h2>📹 Recording</h2>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">Recording</span>
              <span class="stat-value" id="recording-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Motion Detection</span>
              <span class="stat-value" id="motion-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Storage</span>
              <span class="stat-value" id="storage-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Clips</span>
              <span class="stat-value" id="clip-count">-</span>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>🐦 Bird Activity</h2>
          <div class="stats" id="bird-stats">
            <div class="stat">
              <span class="stat-label">Today's Sightings</span>
              <span class="stat-value" id="bird-today">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Species Today</span>
              <span class="stat-value" id="bird-species-today">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Life List</span>
              <span class="stat-value good" id="bird-lifelist">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Most Active</span>
              <span class="stat-value" id="bird-top">-</span>
            </div>
          </div>
          <div id="recent-birds" style="margin-top: 12px; max-height: 150px; overflow-y: auto;">
            <p style="color: var(--muted); text-align: center; font-size: 0.85rem;">No sightings yet</p>
          </div>
          <div style="margin-top: 12px; text-align: center;">
            <button class="btn btn-sm btn-secondary" onclick="openBirdModal()">📊 View Details</button>
          </div>
        </div>
        
        <div class="card">
          <h2>📍 Saved Positions</h2>
          <div id="saved-presets" style="max-height: 200px; overflow-y: auto;">
            <p style="color: var(--muted); text-align: center; font-size: 0.85rem;">No presets saved</p>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="saveCurrentPosition()">💾 Save Position</button>
            <button class="btn btn-sm btn-secondary" id="patrol-btn" onclick="togglePatrol()">🔄 Patrol</button>
          </div>
        </div>
        
        <div class="card">
          <h2>🎬 Recent Clips</h2>
          <div class="clips-list" id="clips-list">
            <p style="color: var(--muted); text-align: center; padding: 20px;">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Bird Details Modal -->
  <div class="modal-overlay" id="bird-modal" onclick="if(event.target===this)closeBirdModal()">
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h3>🐦 Bird Activity</h3>
        <button class="modal-close" onclick="closeBirdModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <h4>📋 Life List (<span id="lifelist-count">0</span> species)</h4>
          <div id="lifelist-content" style="max-height: 200px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 6px;">
          </div>
        </div>
        
        <div class="settings-section">
          <h4>🏆 Top Species</h4>
          <div id="top-species" style="display: grid; gap: 4px;">
          </div>
        </div>
        
        <div class="settings-section">
          <h4>📅 Recent Sightings</h4>
          <div id="all-sightings" style="max-height: 250px; overflow-y: auto;">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="exportBirdData()">📥 Export Data</button>
        <button class="btn btn-primary" onclick="closeBirdModal()">Close</button>
      </div>
    </div>
  </div>
  
  <!-- Save Preset Modal -->
  <div class="modal-overlay" id="preset-modal" onclick="if(event.target===this)closePresetModal()">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <h3>💾 Save Camera Position</h3>
        <button class="modal-close" onclick="closePresetModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Preset Name</label>
          <input type="text" class="form-input" id="preset-name" placeholder="e.g., Bird Feeder">
        </div>
        <div class="form-group">
          <label class="form-label">Description (optional)</label>
          <input type="text" class="form-input" id="preset-desc" placeholder="e.g., Best angle for the feeder">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closePresetModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmSavePreset()">Save</button>
      </div>
    </div>
  </div>

  <!-- Settings Modal -->
  <div class="modal-overlay" id="settings-modal" onclick="if(event.target===this)closeSettings()">
    <div class="modal">
      <div class="modal-header">
        <h3>⚙️ Stream Settings</h3>
        <button class="modal-close" onclick="closeSettings()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <h4>📺 Output Resolution</h4>
          <div class="form-group">
            <label class="form-label">Resolution Preset</label>
            <select class="form-select" id="settings-resolution" onchange="onResolutionChange()">
              <option value="source">Source (no scaling)</option>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="720p">720p (1280×720)</option>
              <option value="480p">480p (854×480)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="form-row" id="custom-resolution" style="display:none">
            <div class="form-group">
              <label class="form-label">Width</label>
              <input type="number" class="form-input" id="settings-width" min="320" max="3840" placeholder="1920">
            </div>
            <div class="form-group">
              <label class="form-label">Height</label>
              <input type="number" class="form-input" id="settings-height" min="240" max="2160" placeholder="1080">
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h4>🎬 Frame Rate & Quality</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">FPS Limit</label>
              <input type="number" class="form-input" id="settings-fps" min="0" max="60" placeholder="0">
              <div class="form-hint">0 = use source FPS</div>
            </div>
            <div class="form-group">
              <label class="form-label">Quality Preset</label>
              <select class="form-select" id="settings-quality">
                <option value="ultrafast">Ultra Fast (lowest CPU)</option>
                <option value="superfast">Super Fast</option>
                <option value="veryfast">Very Fast</option>
                <option value="faster">Faster</option>
                <option value="fast">Fast</option>
                <option value="medium">Medium (best quality)</option>
              </select>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h4>📊 Bitrate</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Video Bitrate</label>
              <select class="form-select" id="settings-bitrate">
                <option value="500k">500 kbps (low)</option>
                <option value="1000k">1 Mbps</option>
                <option value="1500k">1.5 Mbps</option>
                <option value="2000k">2 Mbps (default)</option>
                <option value="2500k">2.5 Mbps</option>
                <option value="3000k">3 Mbps</option>
                <option value="4000k">4 Mbps</option>
                <option value="5000k">5 Mbps (high)</option>
                <option value="8000k">8 Mbps (very high)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Audio Bitrate</label>
              <select class="form-select" id="settings-audio-bitrate">
                <option value="64k">64 kbps</option>
                <option value="96k">96 kbps</option>
                <option value="128k">128 kbps (default)</option>
                <option value="192k">192 kbps</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="settings-audio-enabled" checked>
              <span>Enable Audio</span>
            </label>
          </div>
        </div>
        
        <div class="settings-section">
          <h4>🎥 HLS Settings</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Segment Duration (s)</label>
              <input type="number" class="form-input" id="settings-hls-segment" min="1" max="10" value="2">
              <div class="form-hint">Lower = less latency, more segments</div>
            </div>
            <div class="form-group">
              <label class="form-label">Playlist Size</label>
              <input type="number" class="form-input" id="settings-hls-playlist" min="2" max="20" value="5">
              <div class="form-hint">Number of segments in playlist</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="resetSettings()">Reset Defaults</button>
        <button class="btn btn-secondary" onclick="closeSettings()">Cancel</button>
        <button class="btn btn-warning" onclick="saveSettings()">Save</button>
        <button class="btn btn-primary" onclick="saveAndApplySettings()">Save & Apply</button>
      </div>
    </div>
  </div>

  <script>
    const video = document.getElementById('video');
    let isRecording = false;
    let currentMode = 'loading';
    let peerConnection = null;
    let hlsPlayer = null;
    let webrtcAvailable = false;
    let ptzAvailable = false;
    let streamStartTime = null;
    
    // ==================== WebRTC Player ====================
    
    async function startWebRTC() {
      console.log('[WebRTC] Starting...');
      streamStartTime = Date.now();
      
      try {
        peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        peerConnection.ontrack = (event) => {
          console.log('[WebRTC] Got track:', event.track.kind);
          if (event.streams && event.streams[0]) {
            video.srcObject = event.streams[0];
            updateLatencyDisplay();
          }
        };
        
        peerConnection.onconnectionstatechange = () => {
          console.log('[WebRTC] State:', peerConnection.connectionState);
          updateConnectionStatus(peerConnection.connectionState);
          if (peerConnection.connectionState === 'failed') {
            fallbackToHLS();
          }
        };
        
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await new Promise((resolve) => {
          if (peerConnection.iceGatheringState === 'complete') resolve();
          else {
            peerConnection.onicegatheringstatechange = () => {
              if (peerConnection.iceGatheringState === 'complete') resolve();
            };
            setTimeout(resolve, 3000);
          }
        });
        
        const response = await fetch('/api/webrtc/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(peerConnection.localDescription)
        });
        
        if (!response.ok) throw new Error('WebRTC signaling failed');
        
        const answer = await response.json();
        await peerConnection.setRemoteDescription(answer);
        
        currentMode = 'webrtc';
        updateModeDisplay();
        console.log('[WebRTC] Connected!');
      } catch (err) {
        console.error('[WebRTC] Failed:', err);
        fallbackToHLS();
      }
    }
    
    function stopWebRTC() {
      if (peerConnection) { peerConnection.close(); peerConnection = null; }
      video.srcObject = null;
    }
    
    // ==================== HLS Player ====================
    
    function startHLS() {
      console.log('[HLS] Starting...');
      streamStartTime = Date.now();
      
      if (Hls.isSupported()) {
        hlsPlayer = new Hls({ liveSyncDuration: 3, liveMaxLatencyDuration: 6, enableWorker: true });
        hlsPlayer.loadSource('/stream.m3u8');
        hlsPlayer.attachMedia(video);
        hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            updateConnectionStatus('failed');
          }
        });
        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          currentMode = 'hls';
          updateModeDisplay();
          updateLatencyDisplay();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = '/stream.m3u8';
        currentMode = 'hls';
        updateModeDisplay();
      }
    }
    
    function stopHLS() {
      if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
      video.src = '';
    }
    
    function fallbackToHLS() {
      console.log('[Player] Falling back to HLS');
      stopWebRTC();
      startHLS();
    }
    
    // ==================== UI Updates ====================
    
    function updateModeDisplay() {
      const modeEl = document.getElementById('video-mode');
      const modeBadge = document.getElementById('mode-badge');
      const modeStatus = document.getElementById('stream-mode-status');
      
      if (currentMode === 'webrtc') {
        modeEl.textContent = '⚡ WebRTC';
        modeEl.style.background = 'var(--webrtc)';
        modeEl.style.color = 'white';
        modeBadge.textContent = 'WebRTC';
        modeBadge.className = 'status-badge status-webrtc';
        modeStatus.innerHTML = '<span class="good">WebRTC</span>';
      } else if (currentMode === 'hls') {
        modeEl.textContent = '📺 HLS';
        modeEl.style.background = 'var(--warning)';
        modeEl.style.color = '#000';
        modeBadge.textContent = 'HLS';
        modeBadge.className = 'status-badge status-hls';
        modeStatus.innerHTML = '<span class="warning">HLS</span>';
      } else {
        modeEl.textContent = 'Loading...';
        modeEl.style.background = 'var(--border)';
        modeBadge.textContent = '-';
        modeStatus.textContent = 'Connecting...';
      }
    }
    
    function updateLatencyDisplay() {
      const latencyEl = document.getElementById('video-latency');
      const latencyStatus = document.getElementById('latency-status');
      
      if (currentMode === 'webrtc') {
        latencyEl.textContent = '~200ms';
        latencyStatus.innerHTML = '<span class="good">~200ms</span>';
      } else if (currentMode === 'hls') {
        latencyEl.textContent = '~4-6s';
        latencyStatus.innerHTML = '<span class="warning">~4-6s</span>';
      }
    }
    
    function updateConnectionStatus(state) {
      const el = document.getElementById('connection-status');
      const statusEl = document.getElementById('status');
      
      switch(state) {
        case 'connected':
          el.innerHTML = '<span class="good">Connected</span>';
          statusEl.textContent = '● LIVE';
          statusEl.className = 'status-badge status-live';
          break;
        case 'connecting':
          el.innerHTML = '<span class="warning">Connecting...</span>';
          break;
        case 'failed':
        case 'disconnected':
          el.innerHTML = '<span class="error">Disconnected</span>';
          statusEl.textContent = '● OFFLINE';
          statusEl.className = 'status-badge status-offline';
          break;
        default:
          el.textContent = state || '-';
      }
    }
    
    async function toggleStreamMode() {
      if (currentMode === 'webrtc') {
        stopWebRTC();
        startHLS();
      } else if (currentMode === 'hls' && webrtcAvailable) {
        stopHLS();
        await startWebRTC();
      } else {
        alert('WebRTC is not available.');
      }
    }
    
    // ==================== PTZ Controls ====================
    
    function initPTZ() {
      const controls = document.querySelectorAll('.ptz-btn[data-pan]');
      
      controls.forEach(btn => {
        const pan = parseFloat(btn.dataset.pan);
        const tilt = parseFloat(btn.dataset.tilt);
        const zoom = parseFloat(btn.dataset.zoom);
        
        // Mouse events
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          btn.classList.add('active');
          ptzMove(pan, tilt, zoom);
        });
        btn.addEventListener('mouseup', () => {
          btn.classList.remove('active');
          ptzStop();
        });
        btn.addEventListener('mouseleave', () => {
          btn.classList.remove('active');
          ptzStop();
        });
        
        // Touch events
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          btn.classList.add('active');
          ptzMove(pan, tilt, zoom);
        });
        btn.addEventListener('touchend', () => {
          btn.classList.remove('active');
          ptzStop();
        });
      });
    }
    
    async function ptzMove(pan, tilt, zoom) {
      if (!ptzAvailable) return;
      try {
        await fetch('/api/ptz/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pan, tilt, zoom, type: 'continuous' })
        });
      } catch (err) { console.error('PTZ move failed:', err); }
    }
    
    async function ptzStop() {
      if (!ptzAvailable) return;
      try {
        await fetch('/api/ptz/stop', { method: 'POST' });
      } catch (err) {}
    }
    
    async function ptzHome() {
      if (!ptzAvailable) return;
      try {
        await fetch('/api/ptz/home', { method: 'POST' });
      } catch (err) { alert('Go home failed'); }
    }
    
    async function loadPTZStatus() {
      try {
        const res = await fetch('/api/ptz/status');
        const data = await res.json();
        
        ptzAvailable = data.supported;
        document.getElementById('ptz-status').textContent = 
          ptzAvailable ? 'PTZ: Ready' : 'PTZ: Not supported';
        document.getElementById('ptz-support-status').innerHTML = 
          ptzAvailable ? '<span class="good">Supported</span>' : '<span class="warning">Not available</span>';
        
        // Disable PTZ buttons if not available
        document.querySelectorAll('.ptz-btn').forEach(btn => {
          btn.disabled = !ptzAvailable;
        });
        
        // Load presets
        if (ptzAvailable) {
          const presetsRes = await fetch('/api/ptz/presets');
          const presetsData = await presetsRes.json();
          const container = document.getElementById('ptz-presets');
          
          if (presetsData.presets && presetsData.presets.length > 0) {
            container.innerHTML = presetsData.presets.slice(0, 5).map(p => 
              \`<button class="btn btn-sm btn-secondary" onclick="gotoPreset('\${p.token}')">\${p.name || p.token}</button>\`
            ).join('');
          }
        }
      } catch (err) {
        console.error('PTZ status failed:', err);
        document.getElementById('ptz-status').textContent = 'PTZ: Error';
      }
    }
    
    async function gotoPreset(token) {
      try {
        await fetch(\`/api/ptz/presets/\${token}\`, { method: 'POST' });
      } catch (err) { alert('Preset failed'); }
    }
    
    // ==================== Time Sync ====================
    
    async function checkTimeSync() {
      try {
        const res = await fetch('/api/camera/time');
        if (!res.ok) {
          // ONVIF not configured - this is normal for RTSP-only setups
          document.getElementById('time-sync-text').textContent = 'RTSP mode (no sync)';
          document.getElementById('time-sync-dot').className = 'dot';
          document.getElementById('time-alert').style.display = 'none';
          return;
        }
        
        const data = await res.json();
        const dot = document.getElementById('time-sync-dot');
        const text = document.getElementById('time-sync-text');
        const alert = document.getElementById('time-alert');
        
        if (data.syncStatus) {
          const diff = data.syncStatus.diffSeconds;
          if (data.syncStatus.synced) {
            dot.className = 'dot synced';
            text.textContent = \`Time synced (±\${diff}s)\`;
            alert.style.display = 'none';
          } else if (diff < 600) {
            dot.className = 'dot warning';
            text.textContent = \`Time drift: \${diff}s\`;
            alert.style.display = 'none';
          } else {
            dot.className = 'dot error';
            text.textContent = \`Time out of sync: \${Math.round(diff/60)}min\`;
            alert.style.display = 'block';
          }
        }
      } catch (err) {
        console.error('Time check failed:', err);
      }
    }
    
    async function syncTime() {
      const btn = document.getElementById('sync-time-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Syncing...';
      
      try {
        const res = await fetch('/api/camera/time/sync', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
          alert('✅ Camera time synchronized!');
          checkTimeSync();
        } else {
          alert('❌ Sync failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('❌ Sync failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Sync Camera Time';
      }
    }
    
    // ==================== Status Updates ====================
    
    async function updateStatus() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        
        // Stream stats
        const fps = data.streamStats?.fps || 0;
        const bitrate = data.streamStats?.bitrate || '0kbits/s';
        document.getElementById('stream-info').textContent = \`\${fps} fps | \${bitrate}\`;
        document.getElementById('resolution-status').textContent = data.streamStats?.resolution || '-';
        
        // Recording
        isRecording = data.recording;
        document.getElementById('recording-status').innerHTML = 
          isRecording ? '<span class="error">● Recording</span>' : '<span class="good">Standby</span>';
        updateRecordButton();
        
        // Motion
        document.getElementById('motion-status').innerHTML = 
          data.motionDetection ? '<span class="good">Enabled</span>' : '<span class="warning">Disabled</span>';
        
        // Storage
        document.getElementById('storage-status').textContent = 
          \`\${data.storage.usedMb} / \${data.storage.maxMb} MB\`;
        document.getElementById('clip-count').textContent = data.storage.clipCount;
        
        // WebRTC
        webrtcAvailable = data.webrtc;
        
        // ONVIF badge
        if (data.webrtc || ${config.onvif.enabled}) {
          document.getElementById('onvif-badge').style.display = 'inline';
        }
        
        // Connection status
        if (currentMode !== 'loading') {
          updateConnectionStatus('connected');
        }
      } catch (err) {
        console.error('Status update failed:', err);
        updateConnectionStatus('failed');
      }
    }
    
    function updateRecordButton() {
      document.querySelectorAll('#record-btn, #record-btn-main').forEach(btn => {
        btn.textContent = isRecording ? '⏹️ Stop' : '⏺️ Record';
      });
    }
    
    async function takeSnapshot() {
      try {
        const res = await fetch('/api/snapshot', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('📸 Snapshot saved!');
          refreshClips();
        }
      } catch (err) { alert('Snapshot failed'); }
    }
    
    async function toggleRecording() {
      try {
        await fetch(isRecording ? '/api/recording/stop' : '/api/recording/start', { method: 'POST' });
        isRecording = !isRecording;
        updateRecordButton();
      } catch (err) { alert('Recording toggle failed'); }
    }
    
    async function refreshClips() {
      try {
        const res = await fetch('/api/clips');
        const data = await res.json();
        const list = document.getElementById('clips-list');
        
        if (!data.clips || data.clips.length === 0) {
          list.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">No clips yet</p>';
          return;
        }
        
        list.innerHTML = data.clips.slice(0, 8).map(clip => \`
          <div class="clip-item">
            <img src="/api/clips/\${clip.id}/thumbnail" class="clip-thumb" onerror="this.style.display='none'">
            <div class="clip-info">
              <div>\${clip.id}</div>
              <div class="clip-time">\${new Date(clip.startTime).toLocaleString()}</div>
            </div>
            <a href="/api/clips/\${clip.id}/video" download class="btn btn-sm btn-secondary">⬇️</a>
          </div>
        \`).join('');
      } catch (err) { console.error('Clips refresh failed:', err); }
    }
    
    async function refreshAll() {
      await Promise.all([updateStatus(), refreshClips(), loadPTZStatus(), checkTimeSync()]);
    }
    
    // ==================== Settings ====================
    
    let currentSettings = null;
    
    function openSettings() {
      document.getElementById('settings-modal').classList.add('active');
      loadSettings();
    }
    
    function closeSettings() {
      document.getElementById('settings-modal').classList.remove('active');
    }
    
    function onResolutionChange() {
      const res = document.getElementById('settings-resolution').value;
      document.getElementById('custom-resolution').style.display = 
        res === 'custom' ? 'grid' : 'none';
    }
    
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        currentSettings = data.video;
        
        // Populate form
        document.getElementById('settings-resolution').value = currentSettings.outputResolution || 'source';
        document.getElementById('settings-width').value = currentSettings.customWidth || '';
        document.getElementById('settings-height').value = currentSettings.customHeight || '';
        document.getElementById('settings-fps').value = currentSettings.outputFps || 0;
        document.getElementById('settings-quality').value = currentSettings.qualityPreset || 'ultrafast';
        document.getElementById('settings-bitrate').value = currentSettings.outputBitrate || '2000k';
        document.getElementById('settings-audio-bitrate').value = currentSettings.audioBitrate || '128k';
        document.getElementById('settings-audio-enabled').checked = currentSettings.audioEnabled !== false;
        document.getElementById('settings-hls-segment').value = currentSettings.hlsSegmentDuration || 2;
        document.getElementById('settings-hls-playlist').value = currentSettings.hlsPlaylistSize || 5;
        
        onResolutionChange();
      } catch (err) {
        console.error('Failed to load settings:', err);
        alert('Failed to load settings');
      }
    }
    
    function getSettingsFromForm() {
      return {
        outputResolution: document.getElementById('settings-resolution').value,
        customWidth: parseInt(document.getElementById('settings-width').value) || undefined,
        customHeight: parseInt(document.getElementById('settings-height').value) || undefined,
        outputFps: parseInt(document.getElementById('settings-fps').value) || 0,
        qualityPreset: document.getElementById('settings-quality').value,
        outputBitrate: document.getElementById('settings-bitrate').value,
        audioBitrate: document.getElementById('settings-audio-bitrate').value,
        audioEnabled: document.getElementById('settings-audio-enabled').checked,
        hlsSegmentDuration: parseInt(document.getElementById('settings-hls-segment').value) || 2,
        hlsPlaylistSize: parseInt(document.getElementById('settings-hls-playlist').value) || 5,
      };
    }
    
    async function saveSettings() {
      const settings = getSettingsFromForm();
      
      try {
        const res = await fetch('/api/settings/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        
        const data = await res.json();
        if (data.success) {
          alert('✅ Settings saved!\\nRestart stream to apply changes.');
          closeSettings();
        } else {
          alert('❌ Failed to save: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('❌ Save failed: ' + err.message);
      }
    }
    
    async function saveAndApplySettings() {
      const settings = getSettingsFromForm();
      
      try {
        // Save first
        const saveRes = await fetch('/api/settings/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        
        if (!saveRes.ok) {
          throw new Error('Failed to save settings');
        }
        
        // Apply (restart stream)
        alert('Settings saved! Restarting stream...');
        closeSettings();
        
        const applyRes = await fetch('/api/settings/apply', { method: 'POST' });
        const data = await applyRes.json();
        
        if (data.success) {
          // Reconnect player after a delay
          setTimeout(async () => {
            if (currentMode === 'webrtc') {
              stopWebRTC();
              await startWebRTC();
            } else {
              stopHLS();
              startHLS();
            }
            alert('✅ Stream restarted with new settings!');
          }, 3000);
        }
      } catch (err) {
        alert('❌ Apply failed: ' + err.message);
      }
    }
    
    async function resetSettings() {
      if (!confirm('Reset all settings to defaults?')) return;
      
      try {
        const res = await fetch('/api/settings/reset', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
          alert('✅ Settings reset to defaults');
          loadSettings();
        }
      } catch (err) {
        alert('❌ Reset failed: ' + err.message);
      }
    }
    
    // ==================== Bird Tracking ====================
    
    let patrolActive = false;
    
    async function refreshBirdStats() {
      try {
        const res = await fetch('/api/birds/summary');
        const data = await res.json();
        
        document.getElementById('bird-today').textContent = data.todaySightings || '0';
        document.getElementById('bird-species-today').textContent = data.todaySpecies || '0';
        document.getElementById('bird-lifelist').textContent = data.totalSpecies || '0';
        document.getElementById('bird-top').textContent = data.topToday || '-';
        
        // Recent sightings
        const recentEl = document.getElementById('recent-birds');
        if (data.recentSightings && data.recentSightings.length > 0) {
          recentEl.innerHTML = data.recentSightings.slice(0, 5).map(s => \`
            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
              <span>🐦 \${s.species}</span>
              <span style="color: var(--muted);">\${(s.confidence * 100).toFixed(0)}%</span>
            </div>
          \`).join('');
        } else {
          recentEl.innerHTML = '<p style="color: var(--muted); text-align: center; font-size: 0.85rem;">No sightings yet</p>';
        }
      } catch (err) {
        console.error('Bird stats failed:', err);
      }
    }
    
    function openBirdModal() {
      document.getElementById('bird-modal').classList.add('active');
      loadBirdDetails();
    }
    
    function closeBirdModal() {
      document.getElementById('bird-modal').classList.remove('active');
    }
    
    async function loadBirdDetails() {
      try {
        // Life list
        const lifeRes = await fetch('/api/birds/lifelist');
        const lifeData = await lifeRes.json();
        document.getElementById('lifelist-count').textContent = lifeData.count;
        document.getElementById('lifelist-content').innerHTML = lifeData.species.map(s => 
          \`<span style="background: var(--border); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">\${s}</span>\`
        ).join('');
        
        // Top species
        const topRes = await fetch('/api/birds/top?limit=5');
        const topData = await topRes.json();
        document.getElementById('top-species').innerHTML = topData.species.map((s, i) => \`
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border);">
            <span>\${i + 1}. \${s.species}</span>
            <span style="color: var(--accent); font-weight: 500;">\${s.count}</span>
          </div>
        \`).join('');
        
        // Recent sightings
        const sightRes = await fetch('/api/birds/sightings?limit=20');
        const sightData = await sightRes.json();
        document.getElementById('all-sightings').innerHTML = sightData.sightings.map(s => \`
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
            <div>
              <div>🐦 \${s.species}</div>
              <div style="color: var(--muted); font-size: 0.75rem;">\${new Date(s.timestamp).toLocaleString()}</div>
            </div>
            <span style="color: var(--accent);">\${(s.confidence * 100).toFixed(0)}%</span>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Bird details failed:', err);
      }
    }
    
    async function exportBirdData() {
      try {
        const res = await fetch('/api/birds/export');
        const data = await res.json();
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = \`birdcam-data-\${new Date().toISOString().split('T')[0]}.json\`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Export failed: ' + err.message);
      }
    }
    
    // ==================== Preset Management ====================
    
    async function refreshPresets() {
      try {
        const res = await fetch('/api/presets');
        const data = await res.json();
        
        patrolActive = data.patrolActive;
        updatePatrolButton();
        
        const container = document.getElementById('saved-presets');
        if (!data.presets || data.presets.length === 0) {
          container.innerHTML = '<p style="color: var(--muted); text-align: center; font-size: 0.85rem;">No presets saved</p>';
          return;
        }
        
        container.innerHTML = data.presets.map(p => \`
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.05); border-radius: 6px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500;">\${p.name}</div>
              \${p.description ? \`<div style="font-size: 0.75rem; color: var(--muted);">\${p.description}</div>\` : ''}
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-sm btn-primary" onclick="gotoPreset('\${p.id}')">Go</button>
              <button class="btn btn-sm btn-danger" onclick="deletePreset('\${p.id}')">×</button>
            </div>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Presets failed:', err);
      }
    }
    
    function saveCurrentPosition() {
      document.getElementById('preset-modal').classList.add('active');
      document.getElementById('preset-name').value = '';
      document.getElementById('preset-desc').value = '';
    }
    
    function closePresetModal() {
      document.getElementById('preset-modal').classList.remove('active');
    }
    
    async function confirmSavePreset() {
      const name = document.getElementById('preset-name').value.trim();
      if (!name) {
        alert('Please enter a preset name');
        return;
      }
      
      try {
        const res = await fetch('/api/presets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            createFromCurrent: true,
            name,
            description: document.getElementById('preset-desc').value.trim(),
          }),
        });
        
        const data = await res.json();
        if (data.success) {
          closePresetModal();
          refreshPresets();
          alert('✅ Position saved!');
        } else {
          alert('Failed to save preset');
        }
      } catch (err) {
        alert('Save failed: ' + err.message);
      }
    }
    
    async function gotoPreset(id) {
      try {
        await fetch(\`/api/presets/\${id}/goto\`, { method: 'POST' });
      } catch (err) {
        alert('Go to preset failed');
      }
    }
    
    async function deletePreset(id) {
      if (!confirm('Delete this preset?')) return;
      
      try {
        await fetch(\`/api/presets/\${id}\`, { method: 'DELETE' });
        refreshPresets();
      } catch (err) {
        alert('Delete failed');
      }
    }
    
    async function togglePatrol() {
      try {
        if (patrolActive) {
          await fetch('/api/patrol/stop', { method: 'POST' });
        } else {
          await fetch('/api/patrol/start', { method: 'POST' });
        }
        patrolActive = !patrolActive;
        updatePatrolButton();
      } catch (err) {
        alert('Patrol toggle failed');
      }
    }
    
    function updatePatrolButton() {
      const btn = document.getElementById('patrol-btn');
      btn.textContent = patrolActive ? '⏹️ Stop Patrol' : '🔄 Patrol';
      btn.className = patrolActive ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-secondary';
    }
    
    // ==================== Initialize ====================
    
    async function initPlayer() {
      updateConnectionStatus('connecting');
      try {
        const res = await fetch('/api/webrtc/status');
        const data = await res.json();
        webrtcAvailable = data.available;
        
        if (webrtcAvailable && (data.streamMode === 'webrtc' || data.streamMode === 'auto')) {
          await startWebRTC();
        } else {
          startHLS();
        }
      } catch (err) {
        console.error('[Player] Init error:', err);
        startHLS();
      }
    }
    
    // Initialize everything
    initPTZ();
    initPlayer();
    updateStatus();
    refreshClips();
    loadPTZStatus();
    checkTimeSync();
    refreshBirdStats();
    refreshPresets();
    
    // Periodic updates
    setInterval(updateStatus, 5000);
    setInterval(checkTimeSync, 60000);
    setInterval(refreshBirdStats, 30000);  // Update bird stats every 30s
  </script>
</body>
</html>`;
}

export function startServer(): Promise<string> {
  return new Promise((resolve) => {
    app.listen(config.hls.port, '0.0.0.0', () => {
      const url = `http://localhost:${config.hls.port}`;
      console.log(`[Server] Dashboard running at ${url}`);
      resolve(url);
    });
  });
}

export { app };
