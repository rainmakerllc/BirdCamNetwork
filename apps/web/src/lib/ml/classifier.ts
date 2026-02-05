/**
 * Bird Species Classifier using MobileNetV2
 * 
 * Uses ImageNet-trained MobileNetV2 and filters for bird classes.
 * ImageNet has ~59 bird classes (indices roughly 7-24 and 80-100+)
 */

import * as ort from 'onnxruntime-web';
import { BBox } from './tracker';

// ImageNet bird class indices and their common names
// These are the bird-related classes from ImageNet-1K
// Names are formatted for friendly display in the dashboard
const IMAGENET_BIRD_CLASSES: { [key: number]: string } = {
  7: 'Rooster',
  8: 'Hen',
  9: 'Ostrich',
  10: 'Brambling',
  11: 'European Goldfinch',
  12: 'House Finch',
  13: 'Dark-eyed Junco',
  14: 'Indigo Bunting',
  15: 'American Robin',
  16: 'Bulbul',
  17: 'Blue Jay',
  18: 'Black-billed Magpie',
  19: 'Black-capped Chickadee',
  20: 'American Dipper',
  21: 'Kite',
  22: 'Bald Eagle',
  23: 'Turkey Vulture',
  24: 'Great Grey Owl',
  80: 'Black Grouse',
  81: 'Ptarmigan',
  82: 'Ruffed Grouse',
  83: 'Prairie Chicken',
  84: 'Indian Peafowl',
  85: 'Northern Bobwhite',
  86: 'Grey Partridge',
  87: 'African Grey Parrot',
  88: 'Scarlet Macaw',
  89: 'Sulphur-crested Cockatoo',
  90: 'Rainbow Lorikeet',
  91: 'Coucal',
  92: 'Bee-eater',
  93: 'Great Hornbill',
  94: 'Ruby-throated Hummingbird',
  95: 'Rufous-tailed Jacamar',
  96: 'Toco Toucan',
  97: 'Mallard',
  98: 'Red-breasted Merganser',
  99: 'Canada Goose',
  100: 'Black Swan',
  127: 'White Stork',
  128: 'Black Stork',
  129: 'Roseate Spoonbill',
  130: 'American Flamingo',
  131: 'Little Blue Heron',
  132: 'Great Egret',
  133: 'American Bittern',
  134: 'Sandhill Crane',
  135: 'Limpkin',
  136: 'Common Gallinule',
  137: 'American Coot',
  138: 'Great Bustard',
  139: 'Ruddy Turnstone',
  140: 'Dunlin',
  141: 'Common Redshank',
  142: 'Dowitcher',
  143: 'American Oystercatcher',
  144: 'Brown Pelican',
  145: 'King Penguin',
  146: 'Laysan Albatross',
};

// Emoji icons for bird families (for dashboard display)
export const BIRD_FAMILY_EMOJI: { [key: string]: string } = {
  'robin': '🐦',
  'jay': '💙',
  'eagle': '🦅',
  'owl': '🦉',
  'duck': '🦆',
  'goose': '🦢',
  'swan': '🦢',
  'flamingo': '🦩',
  'parrot': '🦜',
  'penguin': '🐧',
  'hummingbird': '💚',
  'cardinal': '❤️',
  'default': '🐦',
};

/**
 * Get an emoji icon for a bird species
 */
export function getBirdEmoji(species: string): string {
  const lower = species.toLowerCase();
  for (const [keyword, emoji] of Object.entries(BIRD_FAMILY_EMOJI)) {
    if (lower.includes(keyword)) return emoji;
  }
  return BIRD_FAMILY_EMOJI.default;
}

// All bird class indices for quick lookup
const BIRD_CLASS_IDS = new Set(Object.keys(IMAGENET_BIRD_CLASSES).map(Number));

// Input size for MobileNetV2
const INPUT_SIZE = 224;

// ImageNet normalization values
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface ClassifierResult {
  species: string;
  confidence: number;
  topK: Array<{ species: string; confidence: number; classId: number }>;
  isBird: boolean;
}

export class BirdClassifier {
  private session: ort.InferenceSession | null = null;
  private inputName: string = '';
  private outputName: string = '';
  private allLabels: string[] = [];

  async load(
    modelUrl: string, 
    labelsUrl?: string,
    onProgress?: (p: number) => void
  ): Promise<void> {
    try {
      // Load labels if provided
      if (labelsUrl) {
        try {
          const labelsResponse = await fetch(labelsUrl);
          if (labelsResponse.ok) {
            const data = await labelsResponse.json();
            if (Array.isArray(data)) {
              this.allLabels = data;
            }
          }
        } catch (e) {
          console.warn('[BirdClassifier] Could not load labels:', e);
        }
      }

      // Fetch model
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

      // Create session
      this.session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['webgpu', 'wasm'],
      });

      this.inputName = this.session.inputNames[0];
      this.outputName = this.session.outputNames[0];

      console.log('[BirdClassifier] Model loaded, input:', this.inputName);
    } catch (error) {
      console.error('[BirdClassifier] Failed to load:', error);
      throw error;
    }
  }

  isLoaded(): boolean {
    return this.session !== null;
  }

  /**
   * Classify a cropped bird image
   */
  async classify(
    imageData: ImageData,
    bbox: BBox,
    topK: number = 5
  ): Promise<ClassifierResult> {
    if (!this.session) {
      throw new Error('Model not loaded');
    }

    // Crop the bird region
    const cropped = this.cropRegion(imageData, bbox);

    // Preprocess for MobileNetV2
    const inputTensor = this.preprocess(cropped);

    // Run inference
    const tensor = new ort.Tensor('float32', inputTensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const results = await this.session.run({ [this.inputName]: tensor });
    const output = results[this.outputName].data as Float32Array;

    // Get top-K predictions, prioritizing bird classes
    return this.getTopKBirds(output, topK);
  }

  /**
   * Crop bird region from full image
   */
  private cropRegion(imageData: ImageData, bbox: BBox): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Calculate pixel coordinates with padding
    const pad = Math.max(10, Math.min(bbox.w, bbox.h) * imageData.width * 0.1);
    const x = Math.max(0, Math.floor(bbox.x * imageData.width) - pad);
    const y = Math.max(0, Math.floor(bbox.y * imageData.height) - pad);
    const w = Math.min(imageData.width - x, Math.floor(bbox.w * imageData.width) + 2 * pad);
    const h = Math.min(imageData.height - y, Math.floor(bbox.h * imageData.height) + 2 * pad);

    // Create temp canvas with original image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    // Crop and resize to model input size with aspect ratio preservation
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    
    // Center crop maintaining aspect ratio
    const scale = Math.max(INPUT_SIZE / w, INPUT_SIZE / h);
    const scaledW = w * scale;
    const scaledH = h * scale;
    const offsetX = (INPUT_SIZE - scaledW) / 2;
    const offsetY = (INPUT_SIZE - scaledH) / 2;
    
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(tempCanvas, x, y, w, h, offsetX, offsetY, scaledW, scaledH);

    return ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  }

  /**
   * Preprocess image for MobileNetV2
   */
  private preprocess(imageData: ImageData): Float32Array {
    const pixels = imageData.data;
    const float32Data = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const channelSize = INPUT_SIZE * INPUT_SIZE;

    for (let i = 0; i < channelSize; i++) {
      const pixelOffset = i * 4;
      const r = pixels[pixelOffset] / 255.0;
      const g = pixels[pixelOffset + 1] / 255.0;
      const b = pixels[pixelOffset + 2] / 255.0;

      // ImageNet normalization
      float32Data[i] = (r - MEAN[0]) / STD[0];
      float32Data[channelSize + i] = (g - MEAN[1]) / STD[1];
      float32Data[2 * channelSize + i] = (b - MEAN[2]) / STD[2];
    }

    return float32Data;
  }

  /**
   * Get top-K predictions, prioritizing bird classes
   */
  private getTopKBirds(output: Float32Array, k: number): ClassifierResult {
    // Apply softmax
    const max = Math.max(...output);
    const exp = output.map(v => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    const probs = exp.map(v => v / sum);

    // Separate bird and non-bird predictions
    const birdPreds: Array<{ classId: number; prob: number }> = [];
    const allPreds: Array<{ classId: number; prob: number }> = [];

    for (let i = 0; i < probs.length; i++) {
      const pred = { classId: i, prob: probs[i] };
      allPreds.push(pred);
      if (BIRD_CLASS_IDS.has(i)) {
        birdPreds.push(pred);
      }
    }

    // Sort by probability
    birdPreds.sort((a, b) => b.prob - a.prob);
    allPreds.sort((a, b) => b.prob - a.prob);

    // Get best bird prediction
    const bestBird = birdPreds[0];
    const bestOverall = allPreds[0];

    // Determine if this is likely a bird
    // Use bird prediction if confidence is reasonable, or if top overall is a bird
    const isBird = bestBird && (bestBird.prob > 0.1 || BIRD_CLASS_IDS.has(bestOverall.classId));
    
    // Build top-K results, prioritizing birds
    const topKResults: Array<{ species: string; confidence: number; classId: number }> = [];
    
    // Add top bird predictions first
    for (const pred of birdPreds.slice(0, Math.min(k, 3))) {
      if (pred.prob > 0.01) {
        topKResults.push({
          species: this.getLabel(pred.classId),
          confidence: pred.prob,
          classId: pred.classId,
        });
      }
    }

    // Fill remaining slots with top overall predictions
    for (const pred of allPreds) {
      if (topKResults.length >= k) break;
      if (!topKResults.some(r => r.classId === pred.classId) && pred.prob > 0.01) {
        topKResults.push({
          species: this.getLabel(pred.classId),
          confidence: pred.prob,
          classId: pred.classId,
        });
      }
    }

    // Use bird-specific label if available, otherwise best overall
    const bestResult = isBird && bestBird.prob > 0.05 ? bestBird : bestOverall;

    return {
      species: this.getLabel(bestResult.classId),
      confidence: bestResult.prob,
      topK: topKResults,
      isBird,
    };
  }

  /**
   * Get human-readable label for class ID
   */
  private getLabel(classId: number): string {
    // Prefer bird-specific names
    if (IMAGENET_BIRD_CLASSES[classId]) {
      return IMAGENET_BIRD_CLASSES[classId];
    }
    // Fall back to full label list
    if (this.allLabels[classId]) {
      return this.allLabels[classId];
    }
    return `Class ${classId}`;
  }

  dispose(): void {
    this.session = null;
  }
}

/**
 * Simplified classifier that uses detection confidence only
 * Used when no classifier model is available
 */
export class SimpleClassifier {
  async classify(confidence: number): Promise<ClassifierResult> {
    return {
      species: 'Bird',
      confidence,
      topK: [{ species: 'Bird', confidence, classId: -1 }],
      isBird: true,
    };
  }
}
