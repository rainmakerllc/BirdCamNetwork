/**
 * Bird Detection Pipeline
 * 
 * Orchestrates video frame capture, detection, classification, and tracking.
 * Runs inference at configurable FPS without blocking UI.
 */

import { BirdDetector, DetectorResult } from './detector';
import { BirdClassifier, ClassifierResult, SimpleClassifier } from './classifier';
import { BirdTracker, Track, BBox } from './tracker';
import { detectEngine, MLEngine } from './engineDetect';

// Model URLs
// YOLOv5n from SourceForge mirror (4MB) - trained on COCO, detects "bird" class (id 14)
// MobileNetV2 from ONNX Model Zoo (14MB) - ImageNet 1000 classes including ~60 bird species
const MODEL_URLS = {
  detector: 'https://sourceforge.net/projects/yolov5.mirror/files/v7.0/yolov5n.onnx/download',
  classifier: 'https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx',
  labels: 'https://raw.githubusercontent.com/anishathalye/imagenet-simple-labels/master/imagenet-simple-labels.json',
};

// Local models - prefer local to avoid network latency
const LOCAL_MODEL_URLS = {
  detector: '/models/yolov5n.onnx',
  classifier: '/models/mobilenetv2.onnx',
  labels: '/models/imagenet_labels.txt',
};

export interface Detection {
  id: string;
  bbox: BBox;
  species: string;
  confidence: number;
  trackDuration: number;
}

export interface PipelineConfig {
  targetFps: number;           // Target inference FPS (default 5)
  detectionThreshold: number;  // Min confidence for detection (default 0.35)
  classificationThreshold: number; // Min confidence for species (default 0.55)
  enableClassification: boolean;   // Run species classifier (default true)
}

export interface PipelineStatus {
  state: 'idle' | 'loading' | 'running' | 'error';
  engine: MLEngine;
  detectorLoaded: boolean;
  classifierLoaded: boolean;
  fps: number;
  inferenceMs: number;
  trackCount: number;
  error?: string;
}

export interface SightingEvent {
  timestamp: Date;
  species: string;
  confidence: number;
  bbox: BBox;
  trackId: string;
  trackDuration: number;
  snapshot?: string;
}

const DEFAULT_CONFIG: PipelineConfig = {
  targetFps: 5,
  detectionThreshold: 0.35,
  classificationThreshold: 0.55,
  enableClassification: true,
};

export class DetectionPipeline {
  private detector: BirdDetector | null = null;
  private classifier: BirdClassifier | SimpleClassifier | null = null;
  private tracker: BirdTracker;
  private config: PipelineConfig;
  
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  private running = false;
  private inferenceRunning = false;
  private frameId: number | null = null;
  private lastInferenceTime = 0;
  private inferenceMs = 0;
  private frameCount = 0;
  private fpsStartTime = 0;
  private currentFps = 0;
  
  private status: PipelineStatus = {
    state: 'idle',
    engine: 'none',
    detectorLoaded: false,
    classifierLoaded: false,
    fps: 0,
    inferenceMs: 0,
    trackCount: 0,
  };

  private onDetection?: (detections: Detection[]) => void;
  private onSighting?: (sighting: SightingEvent) => void;
  private onStatusChange?: (status: PipelineStatus) => void;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = new BirdTracker({
      minConfidence: this.config.classificationThreshold,
    });
    
    // Create offscreen canvas
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Load ML models
   */
  async loadModels(onProgress?: (stage: string, progress: number) => void): Promise<void> {
    this.updateStatus({ state: 'loading' });

    try {
      // Detect ML engine
      const capabilities = await detectEngine();
      this.updateStatus({ engine: capabilities.engine });
      console.log('[Pipeline] ML engine:', capabilities.engine);

      // Load detector
      onProgress?.('detector', 0);
      this.detector = new BirdDetector();
      
      // Try local first (faster), then remote fallback
      let loaded = false;
      const urls = [LOCAL_MODEL_URLS.detector, MODEL_URLS.detector].filter(Boolean) as string[];
      
      for (const url of urls) {
        try {
          console.log('[Pipeline] Loading detector from:', url);
          await this.detector.load(url, (p) => onProgress?.('detector', p));
          loaded = true;
          break;
        } catch (e) {
          console.warn('[Pipeline] Failed to load from', url, ':', e);
        }
      }
      
      if (!loaded) {
        throw new Error('Failed to load detector model from any source');
      }
      
      this.updateStatus({ detectorLoaded: true });

      // Load classifier
      if (this.config.enableClassification) {
        onProgress?.('classifier', 0);
        try {
          this.classifier = new BirdClassifier();
          
          // Try local first, then remote
          const classifierUrls = [LOCAL_MODEL_URLS.classifier, MODEL_URLS.classifier].filter(Boolean) as string[];
          const labelsUrl = LOCAL_MODEL_URLS.labels || MODEL_URLS.labels;
          
          let classifierLoaded = false;
          for (const url of classifierUrls) {
            try {
              console.log('[Pipeline] Loading classifier from:', url);
              await (this.classifier as BirdClassifier).load(
                url,
                labelsUrl,
                (p) => onProgress?.('classifier', p)
              );
              classifierLoaded = true;
              break;
            } catch (e) {
              console.warn('[Pipeline] Failed to load classifier from', url);
            }
          }
          
          if (!classifierLoaded) {
            throw new Error('Failed to load classifier from any source');
          }
          
          this.updateStatus({ classifierLoaded: true });
        } catch (e) {
          console.warn('[Pipeline] Classifier failed to load, using simple fallback:', e);
          this.classifier = new SimpleClassifier();
        }
      } else {
        // Use simple classifier - just returns "Bird" with detection confidence
        this.classifier = new SimpleClassifier();
      }

      this.updateStatus({ state: 'idle' });
      console.log('[Pipeline] Models loaded successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus({ state: 'error', error: errorMsg });
      throw error;
    }
  }

  /**
   * Start detection on video element
   */
  start(
    video: HTMLVideoElement,
    onDetection?: (detections: Detection[]) => void,
    onSighting?: (sighting: SightingEvent) => void
  ): void {
    if (!this.detector?.isLoaded()) {
      throw new Error('Models not loaded');
    }

    this.video = video;
    this.onDetection = onDetection;
    this.onSighting = onSighting;
    this.running = true;
    this.fpsStartTime = performance.now();
    this.frameCount = 0;

    this.updateStatus({ state: 'running' });
    this.runLoop();
  }

  /**
   * Stop detection
   */
  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.updateStatus({ state: 'idle' });
  }

  /**
   * Main inference loop
   */
  private runLoop(): void {
    if (!this.running) return;

    const now = performance.now();
    const elapsed = now - this.lastInferenceTime;
    const targetInterval = 1000 / this.config.targetFps;

    if (elapsed >= targetInterval && !this.inferenceRunning) {
      this.inferenceRunning = true;
      this.runInference()
        .catch(console.error)
        .finally(() => { this.inferenceRunning = false; });
      this.lastInferenceTime = now;
    }

    this.frameId = requestAnimationFrame(() => this.runLoop());
  }

  /**
   * Run single inference frame
   */
  private async runInference(): Promise<void> {
    if (!this.video || !this.detector) return;

    // Skip if video not ready
    if (this.video.readyState < 2 || this.video.videoWidth === 0) return;

    const startTime = performance.now();

    try {
      // Capture frame
      const imageData = this.captureFrame();

      // Run detection
      const detections = await this.detector.detect(imageData, this.config.detectionThreshold);

      // Classify each detection
      const classifiedDetections = await this.classifyDetections(imageData, detections);

      // Update tracker
      const { tracks, toEmit } = this.tracker.update(
        classifiedDetections.map(d => ({
          bbox: d.bbox,
          species: d.species,
          confidence: d.confidence,
        }))
      );

      // Calculate FPS
      this.frameCount++;
      const fpsElapsed = performance.now() - this.fpsStartTime;
      if (fpsElapsed >= 1000) {
        this.currentFps = Math.round(this.frameCount * 1000 / fpsElapsed);
        this.frameCount = 0;
        this.fpsStartTime = performance.now();
      }

      // Update inference time
      this.inferenceMs = Math.round(performance.now() - startTime);

      // Convert tracks to detections
      const outputDetections: Detection[] = tracks.map(t => ({
        id: t.id,
        bbox: t.bbox,
        species: t.bestSpecies,
        confidence: t.bestConfidence,
        trackDuration: Date.now() - t.firstSeen,
      }));

      // Emit detections
      this.onDetection?.(outputDetections);

      // Emit sightings
      for (const track of toEmit) {
        const snapshot = this.captureSnapshot(imageData, track.bbox);
        this.onSighting?.({
          timestamp: new Date(),
          species: track.bestSpecies,
          confidence: track.bestConfidence,
          bbox: track.bbox,
          trackId: track.id,
          trackDuration: Date.now() - track.firstSeen,
          snapshot,
        });
      }

      // Update status
      this.updateStatus({
        fps: this.currentFps,
        inferenceMs: this.inferenceMs,
        trackCount: tracks.length,
      });

    } catch (error) {
      console.error('[Pipeline] Inference error:', error);
    }
  }

  /**
   * Capture frame from video
   */
  private captureFrame(): ImageData {
    const video = this.video!;
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    this.ctx.drawImage(video, 0, 0);
    return this.ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
  }

  /**
   * Classify detected birds
   */
  private async classifyDetections(
    imageData: ImageData,
    detections: DetectorResult[]
  ): Promise<Array<DetectorResult & { species: string }>> {
    const results: Array<DetectorResult & { species: string }> = [];

    for (const det of detections) {
      let species = 'Bird';
      let confidence = det.confidence;

      if (this.classifier && this.classifier instanceof BirdClassifier) {
        try {
          const result = await this.classifier.classify(
            imageData, 
            det.bbox,
            3
          );
          // Use classifier result if it's confident it's a bird
          if (result.isBird && result.confidence >= this.config.classificationThreshold) {
            species = result.species;
            // Combine detection and classification confidence
            confidence = Math.sqrt(det.confidence * result.confidence);
          } else if (result.isBird) {
            // Lower confidence bird - still use the species but with detection confidence
            species = result.species;
          }
        } catch (e) {
          console.warn('[Pipeline] Classification error:', e);
          // Classification failed, use generic label
        }
      }

      results.push({ ...det, species, confidence });
    }

    return results;
  }

  /**
   * Capture snapshot of detected bird
   */
  private captureSnapshot(imageData: ImageData, bbox: BBox): string {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;

    // Calculate crop region with padding
    const pad = 20;
    const x = Math.max(0, Math.floor(bbox.x * imageData.width) - pad);
    const y = Math.max(0, Math.floor(bbox.y * imageData.height) - pad);
    const w = Math.min(imageData.width - x, Math.floor(bbox.w * imageData.width) + 2 * pad);
    const h = Math.min(imageData.height - y, Math.floor(bbox.h * imageData.height) + 2 * pad);

    tempCanvas.width = w;
    tempCanvas.height = h;

    // Draw full image
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = imageData.width;
    fullCanvas.height = imageData.height;
    const fullCtx = fullCanvas.getContext('2d')!;
    fullCtx.putImageData(imageData, 0, 0);

    // Crop region
    tempCtx.drawImage(fullCanvas, x, y, w, h, 0, 0, w, h);

    return tempCanvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Update config at runtime
   */
  setConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    this.tracker.setConfig({
      minConfidence: this.config.classificationThreshold,
    });
  }

  /**
   * Get current status
   */
  getStatus(): PipelineStatus {
    return { ...this.status };
  }

  /**
   * Set status change callback
   */
  onStatus(callback: (status: PipelineStatus) => void): void {
    this.onStatusChange = callback;
    callback(this.status);
  }

  private updateStatus(updates: Partial<PipelineStatus>): void {
    this.status = { ...this.status, ...updates };
    this.onStatusChange?.(this.status);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.detector?.dispose();
    if (this.classifier && 'dispose' in this.classifier) {
      this.classifier.dispose();
    }
    this.detector = null;
    this.classifier = null;
  }
}
