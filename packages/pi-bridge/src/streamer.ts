import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { config } from './config.js';
import type { FfmpegCommand } from 'fluent-ffmpeg';

let ffmpegProcess: FfmpegCommand | null = null;
let isRunning = false;
let dynamicRtspUrl: string | null = null;

// Allow setting RTSP URL dynamically (e.g., from ONVIF discovery)
export function setRtspUrl(url: string): void {
  dynamicRtspUrl = url;
}

function getRtspUrl(): string {
  return dynamicRtspUrl || config.camera.rtspUrl;
}

export interface StreamStats {
  fps: number;
  bitrate: string;
  frames: number;
  time: string;
}

let currentStats: StreamStats = {
  fps: 0,
  bitrate: '0kbits/s',
  frames: 0,
  time: '00:00:00.00',
};

export function getStreamStats(): StreamStats {
  return { ...currentStats };
}

export function isStreaming(): boolean {
  return isRunning;
}

export async function startStreaming(): Promise<void> {
  if (isRunning) {
    console.log('[Streamer] Already running');
    return;
  }

  // Ensure output directory exists
  if (existsSync(config.hls.outputDir)) {
    rmSync(config.hls.outputDir, { recursive: true });
  }
  mkdirSync(config.hls.outputDir, { recursive: true });

  const rtspUrl = getRtspUrl();
  
  console.log(`[Streamer] Starting RTSP → HLS transcoding`);
  console.log(`[Streamer] Input: ${rtspUrl.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`[Streamer] Output: ${config.hls.outputDir}/stream.m3u8`);

  const outputPath = `${config.hls.outputDir}/stream.m3u8`;

  ffmpegProcess = ffmpeg(rtspUrl)
    .inputOptions([
      '-rtsp_transport tcp',  // More reliable than UDP
      '-stimeout 5000000',    // Socket timeout (microseconds)
    ])
    .outputOptions([
      // Video encoding
      '-c:v libx264',
      '-preset ultrafast',
      '-tune zerolatency',
      `-b:v ${config.transcode.bitrate}`,
      '-maxrate ' + config.transcode.bitrate,
      '-bufsize ' + (parseInt(config.transcode.bitrate) * 2) + 'k',
      
      // Resolution (if specified)
      ...(config.transcode.resolution ? [`-s ${config.transcode.resolution}`] : []),
      
      // Audio encoding
      '-c:a aac',
      '-b:a 128k',
      '-ar 44100',
      
      // HLS options
      '-f hls',
      `-hls_time ${config.hls.segmentDuration}`,
      `-hls_list_size ${config.hls.playlistSize}`,
      '-hls_flags delete_segments+append_list',
      '-hls_segment_filename', `${config.hls.outputDir}/segment%03d.ts`,
    ])
    .output(outputPath);

  // Progress tracking
  ffmpegProcess.on('progress', (progress) => {
    currentStats = {
      fps: progress.currentFps || 0,
      bitrate: progress.currentKbps ? `${progress.currentKbps}kbits/s` : '0kbits/s',
      frames: progress.frames || 0,
      time: progress.timemark || '00:00:00.00',
    };
    
    if (config.debug) {
      console.log(`[Streamer] ${currentStats.time} | ${currentStats.fps} fps | ${currentStats.bitrate}`);
    }
  });

  // Error handling
  ffmpegProcess.on('error', (err) => {
    console.error('[Streamer] FFmpeg error:', err.message);
    isRunning = false;
    
    // Auto-restart after delay
    setTimeout(() => {
      console.log('[Streamer] Attempting restart...');
      startStreaming().catch(console.error);
    }, 5000);
  });

  ffmpegProcess.on('end', () => {
    console.log('[Streamer] FFmpeg process ended');
    isRunning = false;
  });

  // Start
  return new Promise((resolve, reject) => {
    ffmpegProcess!.on('start', (cmd) => {
      if (config.debug) {
        console.log('[Streamer] FFmpeg command:', cmd);
      }
      isRunning = true;
      resolve();
    });

    ffmpegProcess!.on('error', (err) => {
      if (!isRunning) {
        reject(err);
      }
    });

    ffmpegProcess!.run();
  });
}

export function stopStreaming(): void {
  if (ffmpegProcess) {
    console.log('[Streamer] Stopping FFmpeg...');
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
    isRunning = false;
  }
}

// Probe the RTSP stream for info
export async function probeStream(): Promise<{
  codec: string;
  resolution: string;
  fps: number;
} | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(getRtspUrl(), (err, metadata) => {
      if (err) {
        console.error('[Streamer] Probe failed:', err.message);
        resolve(null);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        resolve(null);
        return;
      }

      resolve({
        codec: videoStream.codec_name || 'unknown',
        resolution: `${videoStream.width}x${videoStream.height}`,
        fps: Math.round(eval(videoStream.r_frame_rate || '0') || 0),
      });
    });
  });
}
