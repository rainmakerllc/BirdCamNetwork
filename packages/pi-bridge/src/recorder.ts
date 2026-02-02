/**
 * Recording Module
 * 
 * Handles video clip recording and snapshot capture.
 * Supports triggered recording (motion events) and manual capture.
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { config } from './config.js';

export interface RecordingConfig {
  clipsDir: string;
  snapshotsDir: string;
  preBufferSeconds: number;    // Seconds to include before trigger
  postBufferSeconds: number;   // Seconds to record after trigger
  maxClipDurationSeconds: number;
  retentionDays: number;       // Auto-delete clips older than this
  maxStorageMb: number;        // Max storage before cleanup
}

export interface ClipInfo {
  id: string;
  path: string;
  startTime: Date;
  duration: number;
  trigger: 'motion' | 'manual' | 'scheduled';
  size: number;
  thumbnail?: string;
}

export interface SnapshotInfo {
  id: string;
  path: string;
  timestamp: Date;
  size: number;
}

const DEFAULT_CONFIG: RecordingConfig = {
  clipsDir: '/var/birdcam/clips',
  snapshotsDir: '/var/birdcam/snapshots',
  preBufferSeconds: 5,
  postBufferSeconds: 10,
  maxClipDurationSeconds: 60,
  retentionDays: 7,
  maxStorageMb: 10000, // 10GB
};

class Recorder {
  private config: RecordingConfig;
  private rtspUrl: string = '';
  private activeRecording: ChildProcess | null = null;
  private recordingStartTime: Date | null = null;
  private recordingId: string | null = null;

  constructor(recordingConfig?: Partial<RecordingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...recordingConfig };
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.config.clipsDir)) {
      mkdirSync(this.config.clipsDir, { recursive: true });
    }
    if (!existsSync(this.config.snapshotsDir)) {
      mkdirSync(this.config.snapshotsDir, { recursive: true });
    }
  }

  setRtspUrl(url: string): void {
    this.rtspUrl = url;
  }

  /**
   * Capture a snapshot from the stream
   */
  async captureSnapshot(reason: string = 'manual'): Promise<SnapshotInfo | null> {
    if (!this.rtspUrl) {
      console.error('[Recorder] No RTSP URL configured');
      return null;
    }

    const id = `snap_${Date.now()}`;
    const filename = `${id}.jpg`;
    const filepath = join(this.config.snapshotsDir, filename);

    console.log(`[Recorder] Capturing snapshot: ${reason}`);

    return new Promise((resolve) => {
      const ffmpeg = spawn(config.ffmpegPath, [
        '-rtsp_transport', 'tcp',
        '-i', this.rtspUrl,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        filepath
      ]);

      let error = '';

      ffmpeg.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && existsSync(filepath)) {
          const stats = statSync(filepath);
          const snapshot: SnapshotInfo = {
            id,
            path: filepath,
            timestamp: new Date(),
            size: stats.size,
          };
          console.log(`[Recorder] Snapshot saved: ${filepath}`);
          resolve(snapshot);
        } else {
          console.error(`[Recorder] Snapshot failed: ${error}`);
          resolve(null);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        ffmpeg.kill('SIGTERM');
      }, 10000);
    });
  }

  /**
   * Start recording a clip
   */
  async startRecording(trigger: 'motion' | 'manual' | 'scheduled' = 'manual'): Promise<string | null> {
    if (!this.rtspUrl) {
      console.error('[Recorder] No RTSP URL configured');
      return null;
    }

    if (this.activeRecording) {
      console.log('[Recorder] Recording already in progress');
      return this.recordingId;
    }

    const id = `clip_${Date.now()}`;
    const filename = `${id}.mp4`;
    const filepath = join(this.config.clipsDir, filename);
    const thumbnailPath = join(this.config.clipsDir, `${id}_thumb.jpg`);

    console.log(`[Recorder] Starting recording: ${trigger}`);

    this.recordingId = id;
    this.recordingStartTime = new Date();

    // Record with copy codec (no transcoding) for efficiency
    this.activeRecording = spawn(config.ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', this.rtspUrl,
      '-c', 'copy',
      '-t', String(this.config.maxClipDurationSeconds),
      '-movflags', '+faststart',
      '-y',
      filepath
    ]);

    this.activeRecording.on('close', async (code) => {
      if (code === 0 && existsSync(filepath)) {
        // Generate thumbnail
        await this.generateThumbnail(filepath, thumbnailPath);
        
        const stats = statSync(filepath);
        console.log(`[Recorder] Clip saved: ${filepath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      } else {
        console.error(`[Recorder] Recording failed with code: ${code}`);
      }
      
      this.activeRecording = null;
      this.recordingStartTime = null;
      this.recordingId = null;
    });

    // Auto-cleanup old files
    this.cleanupOldFiles();

    return id;
  }

  /**
   * Stop the current recording
   */
  stopRecording(): void {
    if (this.activeRecording) {
      console.log('[Recorder] Stopping recording...');
      this.activeRecording.kill('SIGINT'); // Graceful stop to finalize file
    }
  }

  /**
   * Generate a thumbnail from a video file
   */
  private async generateThumbnail(videoPath: string, thumbnailPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn(config.ffmpegPath, [
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        '-q:v', '5',
        '-y',
        thumbnailPath
      ]);

      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });

      setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        resolve(false);
      }, 5000);
    });
  }

  /**
   * List all recorded clips
   */
  listClips(): ClipInfo[] {
    const clips: ClipInfo[] = [];
    
    if (!existsSync(this.config.clipsDir)) return clips;

    const files = readdirSync(this.config.clipsDir)
      .filter(f => f.endsWith('.mp4'))
      .sort()
      .reverse(); // Newest first

    for (const file of files) {
      const filepath = join(this.config.clipsDir, file);
      const stats = statSync(filepath);
      const id = file.replace('.mp4', '');
      const thumbnailPath = join(this.config.clipsDir, `${id}_thumb.jpg`);

      clips.push({
        id,
        path: filepath,
        startTime: stats.birthtime,
        duration: 0, // Would need ffprobe to get actual duration
        trigger: 'manual',
        size: stats.size,
        thumbnail: existsSync(thumbnailPath) ? thumbnailPath : undefined,
      });
    }

    return clips;
  }

  /**
   * List all snapshots
   */
  listSnapshots(): SnapshotInfo[] {
    const snapshots: SnapshotInfo[] = [];
    
    if (!existsSync(this.config.snapshotsDir)) return snapshots;

    const files = readdirSync(this.config.snapshotsDir)
      .filter(f => f.endsWith('.jpg'))
      .sort()
      .reverse();

    for (const file of files) {
      const filepath = join(this.config.snapshotsDir, file);
      const stats = statSync(filepath);
      
      snapshots.push({
        id: file.replace('.jpg', ''),
        path: filepath,
        timestamp: stats.birthtime,
        size: stats.size,
      });
    }

    return snapshots;
  }

  /**
   * Delete a clip by ID
   */
  deleteClip(id: string): boolean {
    const filepath = join(this.config.clipsDir, `${id}.mp4`);
    const thumbnailPath = join(this.config.clipsDir, `${id}_thumb.jpg`);

    if (existsSync(filepath)) {
      unlinkSync(filepath);
      if (existsSync(thumbnailPath)) {
        unlinkSync(thumbnailPath);
      }
      console.log(`[Recorder] Deleted clip: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Cleanup old files based on retention policy
   */
  cleanupOldFiles(): void {
    const now = Date.now();
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    let totalSize = 0;
    const files: Array<{ path: string; time: number; size: number }> = [];

    // Gather all files with their sizes and times
    for (const dir of [this.config.clipsDir, this.config.snapshotsDir]) {
      if (!existsSync(dir)) continue;
      
      for (const file of readdirSync(dir)) {
        const filepath = join(dir, file);
        const stats = statSync(filepath);
        totalSize += stats.size;
        files.push({
          path: filepath,
          time: stats.mtimeMs,
          size: stats.size,
        });
      }
    }

    // Sort by age (oldest first)
    files.sort((a, b) => a.time - b.time);

    // Delete files that are too old
    for (const file of files) {
      if (now - file.time > maxAge) {
        unlinkSync(file.path);
        totalSize -= file.size;
        console.log(`[Recorder] Deleted old file: ${basename(file.path)}`);
      }
    }

    // Delete files if over storage limit (oldest first)
    const maxBytes = this.config.maxStorageMb * 1024 * 1024;
    for (const file of files) {
      if (totalSize <= maxBytes) break;
      if (!existsSync(file.path)) continue;
      
      unlinkSync(file.path);
      totalSize -= file.size;
      console.log(`[Recorder] Deleted for space: ${basename(file.path)}`);
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): { usedMb: number; maxMb: number; clipCount: number; snapshotCount: number } {
    let totalSize = 0;
    let clipCount = 0;
    let snapshotCount = 0;

    if (existsSync(this.config.clipsDir)) {
      for (const file of readdirSync(this.config.clipsDir)) {
        if (file.endsWith('.mp4')) {
          clipCount++;
          totalSize += statSync(join(this.config.clipsDir, file)).size;
        }
      }
    }

    if (existsSync(this.config.snapshotsDir)) {
      for (const file of readdirSync(this.config.snapshotsDir)) {
        if (file.endsWith('.jpg')) {
          snapshotCount++;
          totalSize += statSync(join(this.config.snapshotsDir, file)).size;
        }
      }
    }

    return {
      usedMb: Math.round(totalSize / 1024 / 1024),
      maxMb: this.config.maxStorageMb,
      clipCount,
      snapshotCount,
    };
  }

  isRecording(): boolean {
    return this.activeRecording !== null;
  }

  getConfig(): RecordingConfig {
    return { ...this.config };
  }
}

// Singleton instance
let recorder: Recorder | null = null;

export function getRecorder(config?: Partial<RecordingConfig>): Recorder {
  if (!recorder) {
    recorder = new Recorder(config);
  }
  return recorder;
}
