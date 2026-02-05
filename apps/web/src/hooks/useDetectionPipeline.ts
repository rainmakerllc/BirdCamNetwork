'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  DetectionPipeline, 
  Detection, 
  PipelineConfig, 
  PipelineStatus,
  SightingEvent 
} from '@/lib/ml';

interface UseDetectionPipelineOptions extends Partial<PipelineConfig> {
  autoLoad?: boolean;
  onSighting?: (sighting: SightingEvent) => void;
}

interface UseDetectionPipelineReturn {
  status: PipelineStatus;
  detections: Detection[];
  loadModels: () => Promise<void>;
  start: (video: HTMLVideoElement) => void;
  stop: () => void;
  setConfig: (config: Partial<PipelineConfig>) => void;
  isLoading: boolean;
  isRunning: boolean;
  error: string | null;
}

export function useDetectionPipeline(
  options: UseDetectionPipelineOptions = {}
): UseDetectionPipelineReturn {
  const { autoLoad = false, onSighting, ...config } = options;
  
  const pipelineRef = useRef<DetectionPipeline | null>(null);
  const onSightingRef = useRef(onSighting);
  
  const [status, setStatus] = useState<PipelineStatus>({
    state: 'idle',
    engine: 'none',
    detectorLoaded: false,
    classifierLoaded: false,
    fps: 0,
    inferenceMs: 0,
    trackCount: 0,
  });
  
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    onSightingRef.current = onSighting;
  }, [onSighting]);

  // Initialize pipeline
  useEffect(() => {
    const pipeline = new DetectionPipeline(config);
    pipelineRef.current = pipeline;
    
    pipeline.onStatus(setStatus);
    
    return () => {
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, []); // Only create once

  // Auto-load models
  useEffect(() => {
    if (autoLoad && pipelineRef.current) {
      loadModels();
    }
  }, [autoLoad]);

  const loadModels = useCallback(async () => {
    if (!pipelineRef.current) return;
    
    setLoadError(null);
    try {
      await pipelineRef.current.loadModels((stage, progress) => {
        console.log(`[ML] Loading ${stage}: ${Math.round(progress * 100)}%`);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load models';
      setLoadError(msg);
      throw error;
    }
  }, []);

  const start = useCallback((video: HTMLVideoElement) => {
    if (!pipelineRef.current) return;
    
    pipelineRef.current.start(
      video,
      (dets) => setDetections(dets),
      (sighting) => onSightingRef.current?.(sighting)
    );
  }, []);

  const stop = useCallback(() => {
    pipelineRef.current?.stop();
    setDetections([]);
  }, []);

  const setConfig = useCallback((newConfig: Partial<PipelineConfig>) => {
    pipelineRef.current?.setConfig(newConfig);
  }, []);

  return {
    status,
    detections,
    loadModels,
    start,
    stop,
    setConfig,
    isLoading: status.state === 'loading',
    isRunning: status.state === 'running',
    error: loadError || status.error || null,
  };
}
