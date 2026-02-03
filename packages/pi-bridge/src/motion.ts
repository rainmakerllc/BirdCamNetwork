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
  debug?: boolean;          // Enable debug logging
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

    // Use FFmpeg with scdet filter for reliable scene change detection
    // The scdet filter detects scene changes and outputs to stderr
    // t = threshold (0-1, lower = more sensitive), s = print scene score
    const sensitivity = this.config.sensitivity / 100;
    // Map sensitivity 0-100 to threshold 0.5-0.05 (higher sensitivity = lower threshold)
    const sceneThreshold = Math.max(0.05, 0.5 - (sensitivity * 0.45));

    console.log(`[Motion] Using scdet threshold: ${sceneThreshold.toFixed(3)} (sensitivity: ${this.config.sensitivity})`);

    // Use scdet filter which reliably outputs scene change events
    // The filter outputs: [Parsed_scdet_0 @ ...] lavfi.scd.mafd=X lavfi.scd.score=X lavfi.scd.time=X
    this.ffmpegProcess = spawn(config.ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-vf', `scdet=t=${sceneThreshold.toFixed(3)}:s=1`,
      '-fps_mode', 'vfr',  // Variable framerate - only output on scene changes
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
      // scdet filter outputs scene detection info to stderr
      if (output.includes('lavfi.scd.score=') || output.includes('scd.score')) {
        this.processScdetOutput(output);
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
        console.log('[Motion] Auto-restarting in 5 seconds...');
        setTimeout(() => this.start(rtspUrl), 5000);
      }
    });
  }

  private processOutput(output: string): void {
    // Parse metadata output for scene detection (legacy support)
    if (output.includes('lavfi.scene_score')) {
      const match = output.match(/lavfi\.scene_score=(\d+\.?\d*)/);
      if (match) {
        const score = parseFloat(match[1]);
        this.handleMotionScore(score);
      }
    }
  }

  private processScdetOutput(output: string): void {
    // scdet filter outputs lines like:
    // [Parsed_scdet_0 @ 0x...] lavfi.scd.mafd=0.123 lavfi.scd.score=0.456 lavfi.scd.time=1.234
    // The score is 0-1, higher means more scene change
    const scoreMatch = output.match(/lavfi\.scd\.score=(\d+\.?\d*)/);
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      if (this.config.debug || config.debug) {
        console.log(`[Motion] Scene change detected, score: ${score.toFixed(3)}`);
      }
      // scdet only triggers when threshold is exceeded, so any detection is significant
      this.handleMotionScore(score);
    }
  }

  private processSceneChange(output: string): void {
    // Legacy fallback for select filter scene output
    const match = output.match(/scene:(\d+\.?\d*)/);
    if (match) {
      const score = parseFloat(match[1]);
      this.handleMotionScore(score);
    }
  }

  private handleMotionScore(score: number): void {
    const now = Date.now();
    
    // scdet filter already applies threshold, so any detection is significant
    // But we still use threshold for confidence filtering
    const minScore = this.config.threshold / 100;
    
    if (score >= minScore) {
      if (!this.isInMotion) {
        this.motionStartTime = now;
        this.isInMotion = true;
      }

      // Check if motion persists long enough (or skip if minDurationMs is 0)
      if (this.config.minDurationMs === 0 || now - this.motionStartTime >= this.config.minDurationMs) {
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
