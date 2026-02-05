'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ClipRecorder, ClipRecorderConfig, ClipMetadata } from '@/lib/ml/clipRecorder';

interface UseClipRecorderOptions extends Partial<ClipRecorderConfig> {
  enabled?: boolean;
}

interface UseClipRecorderReturn {
  attach: (video: HTMLVideoElement) => void;
  detach: () => void;
  captureClip: (params: {
    cameraId: string;
    userId: string;
    species: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    snapshot?: string;
  }) => Promise<ClipMetadata | null>;
  isCapturing: boolean;
  isSupported: boolean;
  lastClip: ClipMetadata | null;
  clipCount: number;
}

export function useClipRecorder(
  options: UseClipRecorderOptions = {}
): UseClipRecorderReturn {
  const { enabled = true, ...config } = options;
  
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastClip, setLastClip] = useState<ClipMetadata | null>(null);
  const [clipCount, setClipCount] = useState(0);

  // Initialize recorder
  useEffect(() => {
    if (enabled && ClipRecorder.isSupported()) {
      recorderRef.current = new ClipRecorder(config);
    }
    return () => {
      recorderRef.current?.dispose();
      recorderRef.current = null;
    };
  }, [enabled]);

  const attach = useCallback((video: HTMLVideoElement) => {
    recorderRef.current?.attach(video);
  }, []);

  const detach = useCallback(() => {
    recorderRef.current?.detach();
  }, []);

  const captureClip = useCallback(async (params: {
    cameraId: string;
    userId: string;
    species: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    snapshot?: string;
  }): Promise<ClipMetadata | null> => {
    if (!recorderRef.current) return null;
    
    setIsCapturing(true);
    try {
      const clip = await recorderRef.current.captureClip(params);
      if (clip) {
        setLastClip(clip);
        setClipCount(prev => prev + 1);
      }
      return clip;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return {
    attach,
    detach,
    captureClip,
    isCapturing,
    isSupported: ClipRecorder.isSupported(),
    lastClip,
    clipCount,
  };
}
