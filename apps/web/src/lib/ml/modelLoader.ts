// ONNX model loader with caching

import * as ort from 'onnxruntime-web';
import { getOrtExecutionProviders } from './engineDetect';

// Model URLs - these will be hosted on CDN or Firebase Storage
const MODEL_URLS = {
  detector: '/models/bird-detector.onnx',
  classifier: '/models/bird-classifier.onnx',
};

// Cached sessions
const sessionCache = new Map<string, ort.InferenceSession>();

export interface ModelInfo {
  name: string;
  inputShape: number[];
  outputNames: string[];
}

export async function loadModel(
  modelName: 'detector' | 'classifier',
  onProgress?: (progress: number) => void
): Promise<ort.InferenceSession> {
  // Check cache
  const cached = sessionCache.get(modelName);
  if (cached) return cached;

  const url = MODEL_URLS[modelName];
  
  try {
    // Configure execution providers
    const providers = getOrtExecutionProviders();
    
    // Fetch model with progress
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    if (total && onProgress) {
      const reader = response.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          onProgress(loaded / total);
        }

        const modelBuffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          modelBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        const session = await ort.InferenceSession.create(modelBuffer.buffer, {
          executionProviders: providers,
        });
        
        sessionCache.set(modelName, session);
        return session;
      }
    }

    // Fallback: load without progress
    const buffer = await response.arrayBuffer();
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: providers,
    });

    sessionCache.set(modelName, session);
    return session;

  } catch (error) {
    console.error(`Failed to load model ${modelName}:`, error);
    throw error;
  }
}

export function getModelInfo(session: ort.InferenceSession): ModelInfo {
  const inputNames = session.inputNames;
  const outputNames = session.outputNames;
  
  return {
    name: inputNames[0] || 'unknown',
    inputShape: [], // Would need model metadata
    outputNames: [...outputNames],
  };
}

export function clearModelCache() {
  sessionCache.forEach((session) => {
    // Sessions are automatically disposed by GC
  });
  sessionCache.clear();
}
