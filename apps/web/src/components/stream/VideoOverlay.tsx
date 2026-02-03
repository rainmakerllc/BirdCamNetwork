'use client';

import { useRef, useEffect, useCallback } from 'react';

export interface Detection {
  id: string;
  bbox: { x: number; y: number; w: number; h: number }; // normalized 0-1
  species: string;
  confidence: number;
}

interface VideoOverlayProps {
  videoElement: HTMLVideoElement | null;
  detections: Detection[];
  showDebug?: boolean;
  debugInfo?: {
    fps: number;
    engine: string;
    trackCount: number;
    inferenceMs: number;
  };
}

export function VideoOverlay({
  videoElement,
  detections,
  showDebug = false,
  debugInfo,
}: VideoOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoElement;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video display size
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Calculate video display area (handle letterboxing)
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoAspect > canvasAspect) {
      // Video is wider - letterbox top/bottom
      displayWidth = canvas.width;
      displayHeight = canvas.width / videoAspect;
      offsetX = 0;
      offsetY = (canvas.height - displayHeight) / 2;
    } else {
      // Video is taller - letterbox left/right
      displayHeight = canvas.height;
      displayWidth = canvas.height * videoAspect;
      offsetX = (canvas.width - displayWidth) / 2;
      offsetY = 0;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw detections
    detections.forEach((det) => {
      // Convert normalized coords to canvas coords
      const x = offsetX + det.bbox.x * displayWidth;
      const y = offsetY + det.bbox.y * displayHeight;
      const w = det.bbox.w * displayWidth;
      const h = det.bbox.h * displayHeight;

      // Box color based on confidence
      const hue = det.confidence > 0.7 ? 120 : det.confidence > 0.5 ? 60 : 0;
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Label background
      const label = `${det.species} ${Math.round(det.confidence * 100)}%`;
      ctx.font = '14px sans-serif';
      const textMetrics = ctx.measureText(label);
      const labelHeight = 20;
      const labelY = y > labelHeight ? y - labelHeight : y + h;
      
      ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
      ctx.fillRect(x, labelY, textMetrics.width + 8, labelHeight);

      // Label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 4, labelY + 15);
    });

    // Debug overlay
    if (showDebug && debugInfo) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(8, 8, 150, 80);
      
      ctx.fillStyle = '#0f0';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${debugInfo.fps.toFixed(1)}`, 16, 26);
      ctx.fillText(`Engine: ${debugInfo.engine}`, 16, 42);
      ctx.fillText(`Tracks: ${debugInfo.trackCount}`, 16, 58);
      ctx.fillText(`Inference: ${debugInfo.inferenceMs.toFixed(0)}ms`, 16, 74);
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [videoElement, detections, showDebug, debugInfo]);

  useEffect(() => {
    if (videoElement) {
      animationRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [videoElement, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
