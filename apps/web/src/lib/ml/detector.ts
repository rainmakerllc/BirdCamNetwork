/**
 * Bird Detection using YOLOv8n ONNX model
 * 
 * Uses COCO-trained YOLOv8n and filters for bird class (class 14).
 * Input: 640x640 RGB image
 * Output: Bounding boxes with confidence scores
 */

import * as ort from 'onnxruntime-web';
import { BBox } from './tracker';

// COCO class index for "bird"
const BIRD_CLASS_ID = 14;

/**
 * Convert Float16 (Uint16Array) to Float32Array
 * IEEE 754 half-precision decoding
 */
function float16ToFloat32(float16: Uint16Array): Float32Array {
  const float32 = new Float32Array(float16.length);
  for (let i = 0; i < float16.length; i++) {
    const h = float16[i];
    const sign = (h >> 15) & 0x1;
    const exponent = (h >> 10) & 0x1f;
    const mantissa = h & 0x3ff;

    let f: number;
    if (exponent === 0) {
      // Subnormal or zero
      f = (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
    } else if (exponent === 31) {
      // Infinity or NaN
      f = mantissa === 0 ? (sign ? -Infinity : Infinity) : NaN;
    } else {
      // Normalized
      f = (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    }
    float32[i] = f;
  }
  return float32;
}

/**
 * Convert Float32Array to Float16 (stored as Uint16Array)
 * IEEE 754 half-precision encoding
 */
function float32ToFloat16(float32: Float32Array): Uint16Array {
  const float16 = new Uint16Array(float32.length);
  const f32 = new Float32Array(1);
  const i32 = new Int32Array(f32.buffer);
  
  for (let i = 0; i < float32.length; i++) {
    f32[0] = float32[i];
    const x = i32[0];
    
    let bits = (x >> 16) & 0x8000; // sign
    const e = (x >> 23) & 0xff;     // exponent
    const m = (x >> 12) & 0x07ff;   // mantissa
    
    if (e >= 143) {
      // Overflow → Inf (or NaN)
      bits |= 0x7c00;
      bits |= (e === 255 ? 0 : 1) && (x & 0x007fffff);
    } else if (e >= 113) {
      // Normal range
      bits |= ((e - 112) << 10) | (m >> 1);
      bits += m & 1; // round to nearest even
    } else if (e >= 103) {
      // Subnormal
      const shifted = m | 0x0800;
      bits |= (shifted >> (114 - e)) + ((shifted >> (113 - e)) & 1);
    }
    // else: too small → stays 0 (with sign)
    
    float16[i] = bits;
  }
  return float16;
}

// Model configuration
// YOLOv5n default input size is 640, but we can use smaller for speed
const INPUT_SIZE = 640;
const CONFIDENCE_THRESHOLD = 0.25;
const NMS_THRESHOLD = 0.45;
const OBJ_THRESHOLD = 0.25; // For YOLOv5 objectness score

export interface DetectorResult {
  bbox: BBox;
  confidence: number;
  classId: number;
}

export class BirdDetector {
  private session: ort.InferenceSession | null = null;
  private inputName: string = '';
  private outputName: string = '';
  private inputType: 'float32' | 'float16' = 'float32';
  private _loggedOutput = false;

  async load(modelUrl: string, onProgress?: (p: number) => void): Promise<void> {
    try {
      // Fetch model with progress tracking
      const response = await fetch(modelUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch model: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      let modelBuffer: ArrayBuffer;

      if (total && onProgress && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          onProgress(loaded / total);
        }

        const combined = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        modelBuffer = combined.buffer;
      } else {
        modelBuffer = await response.arrayBuffer();
        onProgress?.(1);
      }

      // Create inference session
      this.session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['webgpu', 'wasm'],
      });

      this.inputName = this.session.inputNames[0];
      this.outputName = this.session.outputNames[0];

      // Detect expected input type with a small test inference
      await this.detectInputType();

      console.log('[BirdDetector] Model loaded successfully');
      console.log('[BirdDetector] Input:', this.inputName, 'Output:', this.outputName, 'Type:', this.inputType);
    } catch (error) {
      console.error('[BirdDetector] Failed to load model:', error);
      throw error;
    }
  }

  /**
   * Detect whether model expects float32 or float16 input
   */
  private async detectInputType(): Promise<void> {
    if (!this.session) return;
    
    const testSize = 3 * INPUT_SIZE * INPUT_SIZE;
    const testData = new Float32Array(testSize); // zeros

    try {
      const tensor = new ort.Tensor('float32', testData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      await this.session.run({ [this.inputName]: tensor });
      this.inputType = 'float32';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('float16')) {
        this.inputType = 'float16';
        console.log('[BirdDetector] Model requires float16 input, will convert');
        // Verify float16 works
        try {
          const fp16Data = float32ToFloat16(testData);
          const tensor = new ort.Tensor('float16', fp16Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          await this.session.run({ [this.inputName]: tensor });
        } catch (e2) {
          console.warn('[BirdDetector] float16 test also failed:', e2);
          this.inputType = 'float32'; // fallback
        }
      } else {
        // Some other error during test inference - assume float32
        console.warn('[BirdDetector] Type detection error (assuming float32):', msg);
      }
    }
  }

  isLoaded(): boolean {
    return this.session !== null;
  }

  /**
   * Preprocess image for YOLO model
   * - Resize to 640x640
   * - Normalize to 0-1
   * - Convert to CHW format
   */
  private preprocess(
    imageData: ImageData,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ): Float32Array {
    // Resize image to model input size
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    
    // Draw with letterboxing to maintain aspect ratio
    const scale = Math.min(INPUT_SIZE / imageData.width, INPUT_SIZE / imageData.height);
    const scaledW = imageData.width * scale;
    const scaledH = imageData.height * scale;
    const offsetX = (INPUT_SIZE - scaledW) / 2;
    const offsetY = (INPUT_SIZE - scaledH) / 2;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    
    // Create temp canvas for the source image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    
    ctx.drawImage(tempCanvas, offsetX, offsetY, scaledW, scaledH);

    const resizedData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const pixels = resizedData.data;

    // Convert to CHW format and normalize
    const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const channelSize = INPUT_SIZE * INPUT_SIZE;

    for (let i = 0; i < channelSize; i++) {
      const pixelOffset = i * 4;
      float32Data[i] = pixels[pixelOffset] / 255.0;                    // R
      float32Data[channelSize + i] = pixels[pixelOffset + 1] / 255.0;  // G
      float32Data[2 * channelSize + i] = pixels[pixelOffset + 2] / 255.0; // B
    }

    return float32Data;
  }

  /**
   * Run detection on an image
   */
  async detect(
    imageData: ImageData,
    confidenceThreshold: number = CONFIDENCE_THRESHOLD
  ): Promise<DetectorResult[]> {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    // Create canvas for preprocessing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Preprocess
    const inputTensor = this.preprocess(imageData, canvas, ctx);

    // Create ONNX tensor with correct type
    let tensor: ort.Tensor;
    if (this.inputType === 'float16') {
      const fp16Data = float32ToFloat16(inputTensor);
      tensor = new ort.Tensor('float16', fp16Data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    } else {
      tensor = new ort.Tensor('float32', inputTensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    }

    // Run inference
    const results = await this.session.run({ [this.inputName]: tensor });
    const output = results[this.outputName];

    // Download data from GPU to CPU (WebGPU keeps tensors on GPU; .data returns zeros)
    const rawData = await output.getData();

    // Convert output data to Float32Array (model may output float16)
    let outputData: Float32Array;
    if (output.type === 'float16') {
      outputData = float16ToFloat32(rawData as Uint16Array);
    } else {
      outputData = rawData as Float32Array;
    }

    // One-time debug: log output stats
    if (!this._loggedOutput) {
      this._loggedOutput = true;
      const max = Math.max(...Array.from(outputData.slice(0, 1000)));
      const min = Math.min(...Array.from(outputData.slice(0, 1000)));
      console.log(`[BirdDetector] Output type=${output.type} dims=${JSON.stringify(output.dims)} range=[${min.toFixed(4)}, ${max.toFixed(4)}] len=${outputData.length}`);
    }

    // Parse YOLO output
    const detections = this.parseYoloOutput(
      outputData,
      output.dims as number[],
      imageData.width,
      imageData.height,
      confidenceThreshold
    );

    // Apply NMS
    const nmsResults = this.nms(detections, NMS_THRESHOLD);

    // Filter for birds only
    return nmsResults.filter(d => d.classId === BIRD_CLASS_ID);
  }

  /**
   * Parse YOLO output format
   * YOLOv5: [1, 25200, 85] - 85 = 4 bbox + 1 objectness + 80 classes
   * YOLOv8: [1, 84, 8400] - 84 = 4 bbox + 80 classes (no objectness)
   */
  private parseYoloOutput(
    data: Float32Array,
    dims: number[],
    originalWidth: number,
    originalHeight: number,
    threshold: number
  ): DetectorResult[] {
    const results: DetectorResult[] = [];
    const numClasses = 80;
    
    // Calculate scale factors for converting back to original image size
    const scale = Math.min(INPUT_SIZE / originalWidth, INPUT_SIZE / originalHeight);
    const offsetX = (INPUT_SIZE - originalWidth * scale) / 2;
    const offsetY = (INPUT_SIZE - originalHeight * scale) / 2;

    // Detect model format based on dimensions
    // YOLOv5: [1, 25200, 85] or similar
    // YOLOv8: [1, 84, 8400] or [1, 8400, 84]
    const isYolov5 = dims[2] === 85 || dims[1] > 1000;
    
    if (isYolov5) {
      // YOLOv5 format: [1, numBoxes, 85]
      const numBoxes = dims[1];
      const stride = dims[2]; // 85
      
      for (let i = 0; i < numBoxes; i++) {
        const offset = i * stride;
        const cx = data[offset];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];
        const objectness = data[offset + 4];
        
        if (objectness < threshold) continue;
        
        // Find best class
        let bestClassId = 0;
        let bestClassScore = 0;
        for (let c = 0; c < numClasses; c++) {
          const score = data[offset + 5 + c];
          if (score > bestClassScore) {
            bestClassScore = score;
            bestClassId = c;
          }
        }
        
        const confidence = objectness * bestClassScore;
        if (confidence < threshold) continue;
        
        // Convert to normalized coordinates
        const x1 = ((cx - w / 2) - offsetX) / (originalWidth * scale);
        const y1 = ((cy - h / 2) - offsetY) / (originalHeight * scale);
        const bw = w / (originalWidth * scale);
        const bh = h / (originalHeight * scale);
        
        const bbox: BBox = {
          x: Math.max(0, Math.min(1, x1)),
          y: Math.max(0, Math.min(1, y1)),
          w: Math.max(0, Math.min(1 - x1, bw)),
          h: Math.max(0, Math.min(1 - y1, bh)),
        };
        
        results.push({ bbox, confidence, classId: bestClassId });
      }
    } else {
      // YOLOv8 format: [1, 84, 8400] or [1, 8400, 84]
      const numDetections = dims[2] || dims[1];
      const featuresPerDetection = dims[1] || dims[2];
      
      for (let i = 0; i < numDetections; i++) {
        let cx: number, cy: number, w: number, h: number;
        
        if (featuresPerDetection === 84) {
          cx = data[i];
          cy = data[numDetections + i];
          w = data[2 * numDetections + i];
          h = data[3 * numDetections + i];
        } else {
          const offset = i * featuresPerDetection;
          cx = data[offset];
          cy = data[offset + 1];
          w = data[offset + 2];
          h = data[offset + 3];
        }
        
        let bestClassId = 0;
        let bestScore = 0;
        for (let c = 0; c < numClasses; c++) {
          let score: number;
          if (featuresPerDetection === 84) {
            score = data[(4 + c) * numDetections + i];
          } else {
            score = data[i * featuresPerDetection + 4 + c];
          }
          if (score > bestScore) {
            bestScore = score;
            bestClassId = c;
          }
        }
        
        if (bestScore < threshold) continue;
        
        const x1 = ((cx - w / 2) - offsetX) / (originalWidth * scale);
        const y1 = ((cy - h / 2) - offsetY) / (originalHeight * scale);
        const bw = w / (originalWidth * scale);
        const bh = h / (originalHeight * scale);
        
        const bbox: BBox = {
          x: Math.max(0, Math.min(1, x1)),
          y: Math.max(0, Math.min(1, y1)),
          w: Math.max(0, Math.min(1 - x1, bw)),
          h: Math.max(0, Math.min(1 - y1, bh)),
        };
        
        results.push({ bbox, confidence: bestScore, classId: bestClassId });
      }
    }

    return results;
  }

  /**
   * Non-maximum suppression to remove overlapping boxes
   */
  private nms(detections: DetectorResult[], threshold: number): DetectorResult[] {
    if (detections.length === 0) return [];

    // Sort by confidence
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const selected: DetectorResult[] = [];

    while (sorted.length > 0) {
      const best = sorted.shift()!;
      selected.push(best);

      // Remove overlapping boxes
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (this.iou(best.bbox, sorted[i].bbox) > threshold) {
          sorted.splice(i, 1);
        }
      }
    }

    return selected;
  }

  private iou(a: BBox, b: BBox): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);

    if (x2 <= x1 || y2 <= y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    
    return intersection / (areaA + areaB - intersection);
  }

  dispose(): void {
    this.session = null;
  }
}
