/**
 * BirdNET Integration for Bird Detection
 * 
 * Uses BirdNET-Analyzer to identify birds from audio stream.
 * When a bird is detected with high confidence, triggers clip recording.
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { config } from './config.js';

export interface BirdDetection {
  species: string;
  scientificName: string;
  confidence: number;
  startTime: number;
  endTime: number;
  timestamp: Date;
}

export interface DetectorOptions {
  minConfidence: number;      // Minimum confidence threshold (0-1)
  analysisInterval: number;   // Seconds between analyses
  sampleDuration: number;     // Seconds of audio per sample
  latitude?: number;
  longitude?: number;
  locale?: string;            // BirdNET locale for common names
}

const defaultOptions: DetectorOptions = {
  minConfidence: 0.7,
  analysisInterval: 3,
  sampleDuration: 3,
  locale: 'en',
};

type DetectionCallback = (detection: BirdDetection) => void | Promise<void>;

let isRunning = false;
let audioCapture: ffmpeg.FfmpegCommand | null = null;
let analysisTimer: NodeJS.Timeout | null = null;
let options: DetectorOptions = defaultOptions;
let onDetection: DetectionCallback | null = null;
let rtspUrl: string = '';

// Directories
const AUDIO_DIR = join(process.cwd(), 'temp', 'audio');
const RESULTS_DIR = join(process.cwd(), 'temp', 'results');

/**
 * Initialize the bird detector
 */
export function initDetector(opts: Partial<DetectorOptions> = {}): void {
  options = { ...defaultOptions, ...opts };
  
  // Ensure temp directories exist
  mkdirSync(AUDIO_DIR, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });
  
  console.log('[Detector] Initialized with options:', {
    minConfidence: options.minConfidence,
    analysisInterval: `${options.analysisInterval}s`,
    sampleDuration: `${options.sampleDuration}s`,
  });
}

/**
 * Set the RTSP URL for audio extraction
 */
export function setDetectorSource(url: string): void {
  rtspUrl = url;
}

/**
 * Register callback for bird detections
 */
export function onBirdDetected(callback: DetectionCallback): void {
  onDetection = callback;
}

/**
 * Start continuous bird detection
 */
export async function startDetection(): Promise<void> {
  if (isRunning) {
    console.log('[Detector] Already running');
    return;
  }
  
  if (!rtspUrl) {
    throw new Error('No RTSP URL set - call setDetectorSource first');
  }
  
  // Check if BirdNET-Analyzer is available
  const birdnetAvailable = await checkBirdNET();
  if (!birdnetAvailable) {
    console.warn('[Detector] BirdNET-Analyzer not found - detection disabled');
    console.warn('[Detector] Install: pip install birdnetlib');
    return;
  }
  
  isRunning = true;
  console.log('[Detector] Starting bird detection...');
  
  // Start analysis loop
  runAnalysisCycle();
}

/**
 * Stop bird detection
 */
export function stopDetection(): void {
  isRunning = false;
  
  if (audioCapture) {
    audioCapture.kill('SIGTERM');
    audioCapture = null;
  }
  
  if (analysisTimer) {
    clearTimeout(analysisTimer);
    analysisTimer = null;
  }
  
  console.log('[Detector] Stopped');
}

/**
 * Get detection status
 */
export function isDetecting(): boolean {
  return isRunning;
}

/**
 * Run a single analysis cycle
 */
async function runAnalysisCycle(): Promise<void> {
  if (!isRunning) return;
  
  try {
    // 1. Capture audio sample
    const audioFile = await captureAudio();
    
    // 2. Analyze with BirdNET
    const detections = await analyzeBirdNET(audioFile);
    
    // 3. Process detections
    for (const detection of detections) {
      if (detection.confidence >= options.minConfidence) {
        console.log(`[Detector] 🐦 ${detection.species} (${(detection.confidence * 100).toFixed(1)}%)`);
        
        if (onDetection) {
          try {
            await onDetection(detection);
          } catch (err) {
            console.error('[Detector] Callback error:', (err as Error).message);
          }
        }
      }
    }
    
    // 4. Cleanup audio file
    try {
      unlinkSync(audioFile);
    } catch (e) {
      // Ignore cleanup errors
    }
    
  } catch (err) {
    if (config.debug) {
      console.error('[Detector] Analysis cycle error:', (err as Error).message);
    }
  }
  
  // Schedule next cycle
  if (isRunning) {
    analysisTimer = setTimeout(runAnalysisCycle, options.analysisInterval * 1000);
  }
}

/**
 * Capture audio sample from RTSP stream
 */
function captureAudio(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const outputFile = join(AUDIO_DIR, `sample_${timestamp}.wav`);
    
    audioCapture = ffmpeg(rtspUrl)
      .inputOptions([
        '-rtsp_transport tcp',
        '-t', options.sampleDuration.toString(),
      ])
      .outputOptions([
        '-vn',              // No video
        '-acodec pcm_s16le', // 16-bit PCM
        '-ar 48000',        // 48kHz sample rate (BirdNET expects this)
        '-ac 1',            // Mono
      ])
      .output(outputFile)
      .on('end', () => {
        audioCapture = null;
        resolve(outputFile);
      })
      .on('error', (err) => {
        audioCapture = null;
        reject(err);
      });
    
    audioCapture.run();
  });
}

/**
 * Analyze audio file with BirdNET
 */
async function analyzeBirdNET(audioFile: string): Promise<BirdDetection[]> {
  const resultsFile = join(RESULTS_DIR, `result_${Date.now()}.csv`);
  
  // Build command arguments
  const args = [
    '-m', 'birdnetlib.analyze',
    '--i', audioFile,
    '--o', resultsFile,
    '--min_conf', options.minConfidence.toString(),
  ];
  
  if (options.latitude !== undefined && options.longitude !== undefined) {
    args.push('--lat', options.latitude.toString());
    args.push('--lon', options.longitude.toString());
  }
  
  if (options.locale) {
    args.push('--locale', options.locale);
  }
  
  return new Promise((resolve, reject) => {
    const proc = spawn('python', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        // Try alternative command format
        analyzeBirdNETAlternative(audioFile)
          .then(resolve)
          .catch(() => reject(new Error(`BirdNET failed: ${stderr}`)));
        return;
      }
      
      // Parse results CSV
      const detections = parseResultsCSV(resultsFile);
      
      // Cleanup
      try {
        unlinkSync(resultsFile);
      } catch (e) {
        // Ignore
      }
      
      resolve(detections);
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Alternative BirdNET analysis using the analyzer script directly
 */
async function analyzeBirdNETAlternative(audioFile: string): Promise<BirdDetection[]> {
  return new Promise((resolve, reject) => {
    // Try using BirdNET-Analyzer directly
    const args = [
      '--i', audioFile,
      '--o', RESULTS_DIR,
      '--min_conf', options.minConfidence.toString(),
      '--rtype', 'csv',
    ];
    
    if (options.latitude !== undefined && options.longitude !== undefined) {
      args.push('--lat', options.latitude.toString());
      args.push('--lon', options.longitude.toString());
    }
    
    const proc = spawn('python', ['-m', 'birdnet_analyzer.analyze', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`BirdNET alternative failed: ${stderr}`));
        return;
      }
      
      // Find the results file
      const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith('.csv'));
      if (files.length === 0) {
        resolve([]);
        return;
      }
      
      const resultsFile = join(RESULTS_DIR, files[files.length - 1]);
      const detections = parseResultsCSV(resultsFile);
      
      // Cleanup
      try {
        unlinkSync(resultsFile);
      } catch (e) {
        // Ignore
      }
      
      resolve(detections);
    });
    
    proc.on('error', reject);
  });
}

/**
 * Parse BirdNET CSV results
 */
function parseResultsCSV(filePath: string): BirdDetection[] {
  if (!existsSync(filePath)) {
    return [];
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  if (lines.length < 2) {
    return [];
  }
  
  const detections: BirdDetection[] = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    
    // Expected format: Start (s),End (s),Scientific name,Common name,Confidence
    if (cols.length >= 5) {
      const [startStr, endStr, scientificName, commonName, confidenceStr] = cols;
      
      detections.push({
        species: commonName.trim(),
        scientificName: scientificName.trim(),
        confidence: parseFloat(confidenceStr),
        startTime: parseFloat(startStr),
        endTime: parseFloat(endStr),
        timestamp: new Date(),
      });
    }
  }
  
  return detections;
}

/**
 * Check if BirdNET is available
 */
async function checkBirdNET(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', 'import birdnetlib; print("ok")'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    
    proc.on('error', () => {
      resolve(false);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Manually trigger analysis on current audio
 */
export async function analyzeNow(): Promise<BirdDetection[]> {
  if (!rtspUrl) {
    throw new Error('No RTSP URL set');
  }
  
  const audioFile = await captureAudio();
  const detections = await analyzeBirdNET(audioFile);
  
  try {
    unlinkSync(audioFile);
  } catch (e) {
    // Ignore
  }
  
  return detections;
}
