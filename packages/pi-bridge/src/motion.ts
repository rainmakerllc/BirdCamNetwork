/**
 * Motion Detection Module
 * 
 * Analyzes video frames for motion and triggers events.
 * Uses frame differencing with configurable sensitivity.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { mkdirSync, existsSync } from 'fs';
import { config } from './config.js';

export interface MotionEvent {
  timestamp: Date;
  confidence: number;
  region?: { x: number; y: number; width: number; height: number };
  snapshotPath?: string;
}

export interface MotionConfig {
  enabled: boolean;
  sensitivity: number;      // 0-100, higher = more sensitive
  threshold: number;        // Minimum % of pixels changed to trigger
  cooldownMs: number;       // Minimum time between events
  minDurationMs: number;    // Motion must persist for this long
  regions?: Array<{         // Detection regions (empty = full frame)
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

const DEFAULT_CONFIG: MotionConfig = {
  enabled: true,
  sensitivity: 50,
  threshold: 5,
  cooldownMs: 5000,
  minDurationMs: 500,
};

class MotionDetector extends EventEmitter {
  private config: MotionConfig;
  private ffmpegProcess: ChildProcess | null = null;
  private lastMotionTime: number = 0;
  private motionStartTime: number = 0;
  private isInMotion: boolean = false;
  private running: boolean = false;

  constructor(motionConfig?: Partial<MotionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...motionConfig };
  }

  updateConfig(newConfig: Partial<MotionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[Motion] Config updated:', this.config);
  }

  async start(rtspUrl: string): Promise<void> {
    if (this.running) return;
    if (!this.config.enabled) {
      console.log('[Motion] Detection disabled');
      return;
    }

    this.running = true;
    console.log('[Motion] Starting detection...');

    // Use FFmpeg to extract frames and analyze for motion
    // We use the 'select' filter to detect scene changes
    const sensitivity = this.config.sensitivity / 100;
    const sceneThreshold = 1 - (sensitivity * 0.5); // Map 0-100 to scene detection threshold

    // Note: In Node spawn, we don't need shell quoting. The comma in the filter expression
    // must be escaped with \ because FFmpeg uses commas as filter separators.
    this.ffmpegProcess = spawn(config.ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-vf', `select=gt(scene\\,${sceneThreshold.toFixed(2)}),metadata=print:file=-`,
      '-fps_mode', 'vfr',  // Use -fps_mode instead of deprecated -vsync
      '-f', 'null',
      '-'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.ffmpegProcess.stdout?.on('data', (data: Buffer) => {
      this.processOutput(data.toString());
    });

    this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      // FFmpeg outputs progress to stderr
      if (output.includes('scene:')) {
        this.processSceneChange(output);
      }
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('[Motion] FFmpeg error:', err.message);
      this.running = false;
    });

    this.ffmpegProcess.on('exit', (code) => {
      console.log('[Motion] FFmpeg exited with code:', code);
      this.running = false;
      
      // Auto-restart if unexpected exit
      if (code !== 0 && this.config.enabled) {
        setTimeout(() => this.start(rtspUrl), 5000);
      }
    });
  }

  private processOutput(output: string): void {
    // Parse metadata output for scene detection
    if (output.includes('lavfi.scene_score')) {
      const match = output.match(/lavfi\.scene_score=(\d+\.?\d*)/);
      if (match) {
        const score = parseFloat(match[1]);
        this.handleMotionScore(score);
      }
    }
  }

  private processSceneChange(output: string): void {
    const match = output.match(/scene:(\d+\.?\d*)/);
    if (match) {
      const score = parseFloat(match[1]);
      this.handleMotionScore(score);
    }
  }

  private handleMotionScore(score: number): void {
    const now = Date.now();
    const threshold = this.config.threshold / 100;

    if (score > threshold) {
      if (!this.isInMotion) {
        this.motionStartTime = now;
        this.isInMotion = true;
      }

      // Check if motion persists long enough
      if (now - this.motionStartTime >= this.config.minDurationMs) {
        // Check cooldown
        if (now - this.lastMotionTime >= this.config.cooldownMs) {
          this.lastMotionTime = now;
          
          const event: MotionEvent = {
            timestamp: new Date(),
            confidence: Math.min(score * 100, 100),
          };

          console.log(`[Motion] Detected! Confidence: ${event.confidence.toFixed(1)}%`);
          this.emit('motion', event);
        }
      }
    } else {
      if (this.isInMotion) {
        this.isInMotion = false;
        this.emit('motionEnd', { timestamp: new Date() });
      }
    }
  }

  stop(): void {
    this.running = false;
    this.config.enabled = false;
    
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    
    console.log('[Motion] Detection stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): MotionConfig {
    return { ...this.config };
  }
}

// Singleton instance
let detector: MotionDetector | null = null;

export function getMotionDetector(config?: Partial<MotionConfig>): MotionDetector {
  if (!detector) {
    detector = new MotionDetector(config);
  }
  return detector;
}

export function stopMotionDetection(): void {
  if (detector) {
    detector.stop();
    detector = null;
  }
}
