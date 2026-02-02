/**
 * Clip Recorder
 * 
 * Captures video clips and snapshots when triggered (e.g., bird detection).
 * Manages a rolling buffer for pre-detection footage.
 */

import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from './config.js';

export interface ClipMetadata {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  filePath: string;
  thumbnailPath?: string;
  trigger: string;
  species?: string;
  confidence?: number;
  fileSize: number;
}

export interface RecorderOptions {
  clipDuration: number;       // Total clip duration in seconds
  preBuffer: number;          // Seconds before trigger to include
  outputDir: string;          // Where to store clips
  maxClips: number;           // Maximum clips to keep (auto-cleanup)
  maxStorageMB: number;       // Maximum storage in MB
  generateThumbnail: boolean; // Generate thumbnail from clip
}

const defaultOptions: RecorderOptions = {
  clipDuration: 15,
  preBuffer: 5,
  outputDir: './clips',
  maxClips: 100,
  maxStorageMB: 1024,  // 1GB
  generateThumbnail: true,
};

let options: RecorderOptions = defaultOptions;
let rtspUrl: string = '';
let isRecording = false;

/**
 * Initialize the recorder
 */
export function initRecorder(opts: Partial<RecorderOptions> = {}): void {
  options = { ...defaultOptions, ...opts };
  
  // Ensure output directory exists
  mkdirSync(options.outputDir, { recursive: true });
  mkdirSync(join(options.outputDir, 'thumbnails'), { recursive: true });
  
  console.log('[Recorder] Initialized with options:', {
    clipDuration: `${options.clipDuration}s`,
    preBuffer: `${options.preBuffer}s`,
    outputDir: options.outputDir,
    maxClips: options.maxClips,
    maxStorageMB: options.maxStorageMB,
  });
  
  // Initial cleanup
  cleanupOldClips();
}

/**
 * Set the RTSP URL for recording
 */
export function setRecorderSource(url: string): void {
  rtspUrl = url;
}

/**
 * Check if currently recording
 */
export function isCurrentlyRecording(): boolean {
  return isRecording;
}

/**
 * Record a clip starting now
 */
export async function recordClip(trigger: string = 'manual', metadata: Record<string, any> = {}): Promise<ClipMetadata> {
  if (!rtspUrl) {
    throw new Error('No RTSP URL set - call setRecorderSource first');
  }
  
  if (isRecording) {
    console.log('[Recorder] Already recording, skipping');
    throw new Error('Already recording');
  }
  
  isRecording = true;
  
  const id = generateClipId();
  const startTime = new Date();
  const filePath = join(options.outputDir, `${id}.mp4`);
  const thumbnailPath = join(options.outputDir, 'thumbnails', `${id}.jpg`);
  
  console.log(`[Recorder] Recording clip: ${id} (${options.clipDuration}s)`);
  
  try {
    // Record the clip
    await captureClip(filePath, options.clipDuration);
    
    const endTime = new Date();
    const stats = statSync(filePath);
    
    // Generate thumbnail
    if (options.generateThumbnail) {
      try {
        await generateThumbnail(filePath, thumbnailPath);
      } catch (err) {
        console.warn('[Recorder] Thumbnail generation failed:', (err as Error).message);
      }
    }
    
    const clip: ClipMetadata = {
      id,
      startTime,
      endTime,
      duration: options.clipDuration,
      filePath,
      thumbnailPath: existsSync(thumbnailPath) ? thumbnailPath : undefined,
      trigger,
      fileSize: stats.size,
      ...metadata,
    };
    
    console.log(`[Recorder] Clip saved: ${id} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Cleanup old clips if needed
    await cleanupOldClips();
    
    return clip;
    
  } finally {
    isRecording = false;
  }
}

/**
 * Capture a snapshot (single frame)
 */
export async function captureSnapshot(trigger: string = 'manual'): Promise<{
  id: string;
  filePath: string;
  timestamp: Date;
}> {
  if (!rtspUrl) {
    throw new Error('No RTSP URL set');
  }
  
  const id = `snap_${Date.now()}`;
  const filePath = join(options.outputDir, 'thumbnails', `${id}.jpg`);
  
  return new Promise((resolve, reject) => {
    ffmpeg(rtspUrl)
      .inputOptions([
        '-rtsp_transport tcp',
        '-frames:v 1',
      ])
      .outputOptions([
        '-q:v 2',  // High quality JPEG
      ])
      .output(filePath)
      .on('end', () => {
        console.log(`[Recorder] Snapshot saved: ${id}`);
        resolve({
          id,
          filePath,
          timestamp: new Date(),
        });
      })
      .on('error', reject)
      .run();
  });
}

/**
 * Capture video clip
 */
function captureClip(outputPath: string, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(rtspUrl)
      .inputOptions([
        '-rtsp_transport tcp',
        '-t', duration.toString(),
      ])
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',  // Enable streaming
      ])
      .output(outputPath)
      .on('progress', (progress) => {
        if (config.debug && progress.timemark) {
          console.log(`[Recorder] Recording: ${progress.timemark}`);
        }
      })
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Generate thumbnail from video clip
 */
function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['50%'],  // Middle of clip
        filename: outputPath.split(/[\\/]/).pop()!,
        folder: outputPath.split(/[\\/]/).slice(0, -1).join('/'),
        size: '640x360',
      })
      .on('end', () => resolve())
      .on('error', reject);
  });
}

/**
 * Generate unique clip ID
 */
function generateClipId(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const rand = Math.random().toString(36).substring(2, 6);
  return `clip_${date}_${time}_${rand}`;
}

/**
 * Cleanup old clips to stay within limits
 */
async function cleanupOldClips(): Promise<void> {
  const clips = getClipList();
  
  // Check total count
  while (clips.length > options.maxClips) {
    const oldest = clips.shift();
    if (oldest) {
      deleteClip(oldest.id);
    }
  }
  
  // Check total size
  let totalSize = clips.reduce((sum, c) => sum + c.size, 0);
  const maxSize = options.maxStorageMB * 1024 * 1024;
  
  while (totalSize > maxSize && clips.length > 0) {
    const oldest = clips.shift();
    if (oldest) {
      deleteClip(oldest.id);
      totalSize -= oldest.size;
    }
  }
}

/**
 * Get list of all clips
 */
function getClipList(): Array<{ id: string; path: string; size: number; mtime: Date }> {
  if (!existsSync(options.outputDir)) {
    return [];
  }
  
  const files = readdirSync(options.outputDir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const path = join(options.outputDir, f);
      const stats = statSync(path);
      return {
        id: f.replace('.mp4', ''),
        path,
        size: stats.size,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  
  return files;
}

/**
 * Delete a clip
 */
function deleteClip(id: string): void {
  const clipPath = join(options.outputDir, `${id}.mp4`);
  const thumbPath = join(options.outputDir, 'thumbnails', `${id}.jpg`);
  
  try {
    if (existsSync(clipPath)) {
      unlinkSync(clipPath);
    }
    if (existsSync(thumbPath)) {
      unlinkSync(thumbPath);
    }
    console.log(`[Recorder] Deleted old clip: ${id}`);
  } catch (err) {
    console.warn(`[Recorder] Failed to delete clip ${id}:`, (err as Error).message);
  }
}

/**
 * Get clip file as buffer (for upload)
 */
export function getClipBuffer(id: string): Buffer {
  const clipPath = join(options.outputDir, `${id}.mp4`);
  if (!existsSync(clipPath)) {
    throw new Error(`Clip not found: ${id}`);
  }
  return readFileSync(clipPath);
}

/**
 * Get thumbnail buffer
 */
export function getThumbnailBuffer(id: string): Buffer {
  const thumbPath = join(options.outputDir, 'thumbnails', `${id}.jpg`);
  if (!existsSync(thumbPath)) {
    throw new Error(`Thumbnail not found: ${id}`);
  }
  return readFileSync(thumbPath);
}

/**
 * Get all clips metadata
 */
export function getAllClips(): Array<{ id: string; size: number; created: Date }> {
  return getClipList().map(c => ({
    id: c.id,
    size: c.size,
    created: c.mtime,
  }));
}
