import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { existsSync, statSync, createReadStream } from 'fs';
import { config } from './config.js';
import { getStreamStats, isStreaming } from './streamer.js';

const app = express();
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    deviceId: config.deviceId,
    streaming: isStreaming(),
    stats: getStreamStats(),
  });
});

// HLS manifest
app.get('/stream.m3u8', (req, res) => {
  const filePath = join(config.hls.outputDir, 'stream.m3u8');
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Stream not ready' });
    return;
  }
  
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache');
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

// Device info
app.get('/info', (req, res) => {
  res.json({
    deviceId: config.deviceId,
    name: config.camera.name,
    location: config.camera.location,
    streaming: isStreaming(),
    stats: getStreamStats(),
    endpoints: {
      health: '/health',
      stream: '/stream.m3u8',
      info: '/info',
    },
  });
});

// Simple player page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>${config.camera.name} - BirdCam</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    video { max-width: 100%; max-height: 100vh; }
    .info { position: fixed; bottom: 10px; left: 10px; color: #fff; font-family: monospace; font-size: 12px; background: rgba(0,0,0,0.7); padding: 5px 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <video id="video" controls autoplay muted></video>
  <div class="info">${config.camera.name} | ${config.deviceId}</div>
  <script>
    const video = document.getElementById('video');
    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDuration: 3, liveMaxLatencyDuration: 6 });
      hls.loadSource('/stream.m3u8');
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = '/stream.m3u8';
    }
  </script>
</body>
</html>
  `);
});

export function startServer(): Promise<string> {
  return new Promise((resolve) => {
    app.listen(config.hls.port, '0.0.0.0', () => {
      const url = `http://localhost:${config.hls.port}`;
      console.log(`[Server] HLS server running at ${url}`);
      resolve(url);
    });
  });
}
