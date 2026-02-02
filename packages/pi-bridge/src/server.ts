/**
 * Web Server Module
 * 
 * Serves HLS stream, provides REST API, and hosts a web dashboard
 * for camera management, PTZ control, recording, and monitoring.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { join } from 'path';
import { existsSync, statSync, createReadStream, readFileSync } from 'fs';
import { config } from './config.js';
import { getStreamStats, isStreaming, probeStream } from './streamer.js';
import { getRecorder, type ClipInfo, type SnapshotInfo } from './recorder.js';
import { getMotionDetector, type MotionConfig } from './motion.js';
import { PtzController, createPtzController, type PtzCapabilities, type PtzPreset } from './ptz.js';

const app = express();
app.use(cors());
app.use(express.json());

// Global PTZ controller (set when camera connects)
let ptzController: PtzController | null = null;

export function setPtzController(controller: PtzController): void {
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
      host: config.onvif.host || 'N/A',
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
    .status-badge { 
      padding: 4px 12px; 
      border-radius: 20px; 
      font-size: 0.8rem;
      font-weight: 500;
    }
    .status-live { background: var(--accent); color: #000; }
    .status-offline { background: var(--danger); }
    
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .card h2 { font-size: 1rem; margin-bottom: 12px; color: var(--muted); }
    
    .video-container { position: relative; background: #000; border-radius: 8px; overflow: hidden; }
    video { width: 100%; display: block; }
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
    
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--accent); color: #000; }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-danger { background: var(--danger); color: white; }
    .btn-secondary { background: var(--border); color: var(--text); }
    .btn-icon { padding: 8px; font-size: 1.2rem; }
    
    .ptz-controls {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      max-width: 200px;
      margin: 0 auto;
    }
    .ptz-btn {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      background: var(--border);
      border: none;
      border-radius: 8px;
      color: var(--text);
      cursor: pointer;
    }
    .ptz-btn:hover { background: #475569; }
    .ptz-btn:active { background: var(--accent); color: #000; }
    
    .stats { display: grid; gap: 8px; }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--muted); }
    
    .clips-list { max-height: 300px; overflow-y: auto; }
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
      width: 80px;
      height: 45px;
      background: #000;
      border-radius: 4px;
      object-fit: cover;
    }
    .clip-info { flex: 1; }
    .clip-time { font-size: 0.8rem; color: var(--muted); }
    
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><span>🐦</span> ${config.camera.name}</h1>
      <span class="status-badge status-live" id="status">● LIVE</span>
    </header>
    
    <div class="grid">
      <div>
        <div class="card video-container">
          <video id="video" controls autoplay muted playsinline></video>
          <div class="video-overlay">
            <span id="stream-info">Loading...</span>
            <div>
              <button class="btn btn-icon" onclick="takeSnapshot()" title="Snapshot">📸</button>
              <button class="btn btn-icon" onclick="toggleRecording()" id="record-btn" title="Record">⏺️</button>
            </div>
          </div>
        </div>
        
        <div class="actions">
          <button class="btn btn-primary" onclick="takeSnapshot()">📸 Snapshot</button>
          <button class="btn btn-danger" onclick="toggleRecording()" id="record-btn-main">⏺️ Record</button>
          <button class="btn btn-secondary" onclick="refreshClips()">🔄 Refresh</button>
        </div>
      </div>
      
      <div>
        <div class="card">
          <h2>🎮 PTZ Control</h2>
          <div class="ptz-controls">
            <div></div>
            <button class="ptz-btn" onmousedown="ptzMove(0,0.5,0)" onmouseup="ptzStop()">⬆️</button>
            <div></div>
            <button class="ptz-btn" onmousedown="ptzMove(-0.5,0,0)" onmouseup="ptzStop()">⬅️</button>
            <button class="ptz-btn" onclick="ptzHome()">🏠</button>
            <button class="ptz-btn" onmousedown="ptzMove(0.5,0,0)" onmouseup="ptzStop()">➡️</button>
            <button class="ptz-btn" onmousedown="ptzMove(0,0,0.5)" onmouseup="ptzStop()">🔍+</button>
            <button class="ptz-btn" onmousedown="ptzMove(0,-0.5,0)" onmouseup="ptzStop()">⬇️</button>
            <button class="ptz-btn" onmousedown="ptzMove(0,0,-0.5)" onmouseup="ptzStop()">🔍-</button>
          </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
          <h2>📊 Status</h2>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">Device ID</span>
              <span id="device-id">${config.deviceId}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Stream</span>
              <span id="stream-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Motion Detection</span>
              <span id="motion-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Storage Used</span>
              <span id="storage-status">-</span>
            </div>
            <div class="stat">
              <span class="stat-label">Clips</span>
              <span id="clip-count">-</span>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
          <h2>🎬 Recent Clips</h2>
          <div class="clips-list" id="clips-list">
            <p style="color: var(--muted); text-align: center; padding: 20px;">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const video = document.getElementById('video');
    let isRecording = false;
    
    // Initialize HLS player
    if (Hls.isSupported()) {
      const hls = new Hls({ 
        liveSyncDuration: 3, 
        liveMaxLatencyDuration: 6,
        enableWorker: true,
      });
      hls.loadSource('/stream.m3u8');
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          document.getElementById('status').textContent = '● OFFLINE';
          document.getElementById('status').className = 'status-badge status-offline';
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = '/stream.m3u8';
    }
    
    // Update status periodically
    async function updateStatus() {
      try {
        const res = await fetch('/health');
        const data = await res.json();
        
        document.getElementById('stream-status').textContent = data.streaming ? 'Active' : 'Inactive';
        document.getElementById('motion-status').textContent = data.motionDetection ? 'Enabled' : 'Disabled';
        document.getElementById('storage-status').textContent = data.storage.usedMb + ' MB / ' + data.storage.maxMb + ' MB';
        document.getElementById('clip-count').textContent = data.storage.clipCount;
        document.getElementById('stream-info').textContent = 
          data.streamStats.fps + ' fps | ' + data.streamStats.bitrate;
        
        isRecording = data.recording;
        updateRecordButton();
      } catch (err) {
        console.error('Status update failed:', err);
      }
    }
    
    function updateRecordButton() {
      const btns = document.querySelectorAll('#record-btn, #record-btn-main');
      btns.forEach(btn => {
        btn.textContent = isRecording ? '⏹️ Stop' : '⏺️ Record';
        btn.className = isRecording ? 'btn btn-danger' : 'btn btn-danger';
      });
    }
    
    async function takeSnapshot() {
      try {
        const res = await fetch('/api/snapshot', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('Snapshot saved!');
          refreshClips();
        }
      } catch (err) {
        alert('Snapshot failed');
      }
    }
    
    async function toggleRecording() {
      try {
        const endpoint = isRecording ? '/api/recording/stop' : '/api/recording/start';
        await fetch(endpoint, { method: 'POST' });
        isRecording = !isRecording;
        updateRecordButton();
      } catch (err) {
        alert('Recording toggle failed');
      }
    }
    
    async function ptzMove(pan, tilt, zoom) {
      try {
        await fetch('/api/ptz/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pan, tilt, zoom, type: 'continuous' })
        });
      } catch (err) {}
    }
    
    async function ptzStop() {
      try {
        await fetch('/api/ptz/stop', { method: 'POST' });
      } catch (err) {}
    }
    
    async function ptzHome() {
      try {
        await fetch('/api/ptz/home', { method: 'POST' });
      } catch (err) {}
    }
    
    async function refreshClips() {
      try {
        const res = await fetch('/api/clips');
        const data = await res.json();
        
        const list = document.getElementById('clips-list');
        if (data.clips.length === 0) {
          list.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">No clips yet</p>';
          return;
        }
        
        list.innerHTML = data.clips.slice(0, 10).map(clip => \`
          <div class="clip-item">
            <img src="/api/clips/\${clip.id}/thumbnail" class="clip-thumb" onerror="this.style.display='none'">
            <div class="clip-info">
              <div>\${clip.id}</div>
              <div class="clip-time">\${new Date(clip.startTime).toLocaleString()}</div>
            </div>
            <a href="/api/clips/\${clip.id}/video" download class="btn btn-secondary">⬇️</a>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Clips refresh failed:', err);
      }
    }
    
    // Initial load and periodic updates
    updateStatus();
    refreshClips();
    setInterval(updateStatus, 5000);
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
