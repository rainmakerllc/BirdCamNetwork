/**
 * Browser-side Clip Recorder
 * 
 * Uses MediaRecorder API to capture short video clips from a live stream
 * when a bird detection event occurs. Saves clips to Firebase Storage.
 * 
 * Strategy:
 * - Maintains a rolling buffer of the last N seconds (pre-buffer)
 * - On detection event, captures pre-buffer + post-buffer seconds
 * - Outputs WebM (VP8/VP9) since that's what MediaRecorder supports
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

export interface ClipRecorderConfig {
  preBufferSeconds: number;     // Seconds of video before detection (default 3)
  postBufferSeconds: number;    // Seconds of video after detection (default 5)
  maxConcurrentClips: number;   // Max clips recording at once (default 1)
  cooldownMs: number;           // Min ms between clip starts (default 15000)
  mimeType?: string;            // Preferred MIME type
  videoBitsPerSecond?: number;  // Bitrate (default 1500000 = 1.5Mbps)
}

export interface ClipMetadata {
  id: string;
  cameraId: string;
  userId: string;
  species: string;
  confidence: number;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  storagePath: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  source: 'browser_ml';
  bbox: { x: number; y: number; w: number; h: number };
}

const DEFAULT_CONFIG: ClipRecorderConfig = {
  preBufferSeconds: 3,
  postBufferSeconds: 5,
  maxConcurrentClips: 1,
  cooldownMs: 15000,
  videoBitsPerSecond: 1_500_000,
};

// Get the best supported MIME type for recording
function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];

  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

export class ClipRecorder {
  private config: ClipRecorderConfig;
  private video: HTMLVideoElement | null = null;
  private preBuffer: Blob[] = [];
  private preBufferRecorder: MediaRecorder | null = null;
  private isCapturing = false;
  private activeClips = 0;
  private lastClipTime = 0;
  private mimeType: string;

  constructor(config: Partial<ClipRecorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mimeType = this.config.mimeType || getSupportedMimeType();
  }

  /**
   * Check if MediaRecorder is available
   */
  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined';
  }

  /**
   * Attach to a video element and start pre-buffering
   */
  attach(video: HTMLVideoElement): void {
    this.video = video;
    this.startPreBuffer();
  }

  /**
   * Detach and stop all recording
   */
  detach(): void {
    this.stopPreBuffer();
    this.video = null;
  }

  /**
   * Start the rolling pre-buffer recording
   */
  private startPreBuffer(): void {
    if (!this.video || !ClipRecorder.isSupported()) return;

    // We need a MediaStream from the video
    const stream = this.getVideoStream();
    if (!stream) {
      console.warn('[ClipRecorder] Cannot get stream from video element');
      return;
    }

    try {
      this.preBufferRecorder = new MediaRecorder(stream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: this.config.videoBitsPerSecond,
      });

      this.preBuffer = [];

      this.preBufferRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.preBuffer.push(event.data);
          // Keep only preBufferSeconds worth of chunks
          // Each timeslice is 1 second, so limit array length
          const maxChunks = this.config.preBufferSeconds + 2; // +2 for safety
          while (this.preBuffer.length > maxChunks) {
            this.preBuffer.shift();
          }
        }
      };

      // Record in 1-second chunks for the rolling buffer
      this.preBufferRecorder.start(1000);
      console.log('[ClipRecorder] Pre-buffer started, MIME:', this.mimeType);
    } catch (e) {
      console.error('[ClipRecorder] Failed to start pre-buffer:', e);
    }
  }

  private stopPreBuffer(): void {
    if (this.preBufferRecorder && this.preBufferRecorder.state !== 'inactive') {
      this.preBufferRecorder.stop();
    }
    this.preBufferRecorder = null;
    this.preBuffer = [];
  }

  /**
   * Get a capturable stream from the video element
   */
  private getVideoStream(): MediaStream | null {
    if (!this.video) return null;

    // If video has srcObject (WebRTC), use it directly
    if (this.video.srcObject instanceof MediaStream) {
      return this.video.srcObject;
    }

    // For HLS/media source, use canvas capture
    // Create an offscreen canvas that mirrors the video
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth || 1280;
    canvas.height = this.video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;

    // Draw video to canvas at ~15fps
    const drawFrame = () => {
      if (this.video && this.video.readyState >= 2) {
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      }
      if (this.preBufferRecorder?.state === 'recording' || this.isCapturing) {
        requestAnimationFrame(drawFrame);
      }
    };
    requestAnimationFrame(drawFrame);

    return canvas.captureStream(15);
  }

  /**
   * Capture a clip triggered by a detection event
   */
  async captureClip(params: {
    cameraId: string;
    userId: string;
    species: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    snapshot?: string;
  }): Promise<ClipMetadata | null> {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastClipTime < this.config.cooldownMs) {
      console.log('[ClipRecorder] Cooldown active, skipping clip');
      return null;
    }

    if (this.activeClips >= this.config.maxConcurrentClips) {
      console.log('[ClipRecorder] Max concurrent clips reached');
      return null;
    }

    if (!this.video || !ClipRecorder.isSupported()) {
      console.log('[ClipRecorder] Not ready or unsupported');
      return null;
    }

    this.lastClipTime = now;
    this.activeClips++;
    this.isCapturing = true;

    const startedAt = new Date(now - this.config.preBufferSeconds * 1000);

    try {
      // Grab the pre-buffer chunks
      const preChunks = [...this.preBuffer];

      // Record post-buffer
      const postChunks = await this.recordPostBuffer();

      // Combine pre + post into a single blob
      const allChunks = [...preChunks, ...postChunks];
      if (allChunks.length === 0) {
        console.warn('[ClipRecorder] No data recorded');
        return null;
      }

      const blob = new Blob(allChunks, { type: this.mimeType });
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();

      console.log(`[ClipRecorder] Clip captured: ${(blob.size / 1024).toFixed(0)}KB, ${(durationMs / 1000).toFixed(1)}s`);

      // Upload to Firebase Storage
      const filename = `${params.cameraId}/${now}_${params.species.replace(/\s+/g, '_')}.webm`;
      const storageRef = ref(storage, `clips/${filename}`);

      await uploadBytes(storageRef, blob, {
        contentType: this.mimeType,
        customMetadata: {
          species: params.species,
          confidence: params.confidence.toString(),
          source: 'browser_ml',
        },
      });

      const downloadUrl = await getDownloadURL(storageRef);

      // Save metadata to Firestore
      const clipDoc = {
        cameraId: params.cameraId,
        userId: params.userId,
        startedAt: Timestamp.fromDate(startedAt),
        endedAt: Timestamp.fromDate(endedAt),
        durationMs,
        storagePath: `clips/${filename}`,
        downloadUrl,
        species: params.species,
        confidence: params.confidence,
        bbox: params.bbox,
        source: 'browser_ml',
        mimeType: this.mimeType,
        sizeBytes: blob.size,
        isFavorite: false,
        shareVisibility: 'private',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'clips'), clipDoc);

      console.log(`[ClipRecorder] Clip saved: ${docRef.id}`);

      return {
        id: docRef.id,
        cameraId: params.cameraId,
        userId: params.userId,
        species: params.species,
        confidence: params.confidence,
        startedAt,
        endedAt,
        durationMs,
        storagePath: `clips/${filename}`,
        downloadUrl,
        source: 'browser_ml',
        bbox: params.bbox,
      };
    } catch (error) {
      console.error('[ClipRecorder] Failed to capture clip:', error);
      return null;
    } finally {
      this.activeClips--;
      this.isCapturing = false;
    }
  }

  /**
   * Record the post-detection buffer
   */
  private recordPostBuffer(): Promise<Blob[]> {
    return new Promise((resolve) => {
      const stream = this.getVideoStream();
      if (!stream) {
        resolve([]);
        return;
      }

      const chunks: Blob[] = [];

      try {
        const recorder = new MediaRecorder(stream, {
          mimeType: this.mimeType,
          videoBitsPerSecond: this.config.videoBitsPerSecond,
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          resolve(chunks);
        };

        recorder.onerror = () => {
          resolve(chunks);
        };

        recorder.start(1000);

        // Stop after post-buffer duration
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, this.config.postBufferSeconds * 1000);
      } catch (e) {
        console.error('[ClipRecorder] Post-buffer error:', e);
        resolve([]);
      }
    });
  }

  /**
   * Get recording status
   */
  getStatus(): { 
    supported: boolean; 
    preBuffering: boolean;
    capturing: boolean;
    mimeType: string;
    preBufferChunks: number;
  } {
    return {
      supported: ClipRecorder.isSupported(),
      preBuffering: this.preBufferRecorder?.state === 'recording',
      capturing: this.isCapturing,
      mimeType: this.mimeType,
      preBufferChunks: this.preBuffer.length,
    };
  }

  dispose(): void {
    this.detach();
  }
}
