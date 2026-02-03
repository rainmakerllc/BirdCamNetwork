'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamPlayer, StreamMode } from './StreamPlayer';
import { VideoOverlay, Detection } from './VideoOverlay';
import { StreamConfig, DEFAULT_CONFIG } from './StreamSettings';
import { DeveloperOverlay } from './DeveloperOverlay';

interface LiveCameraViewProps {
  config: Partial<StreamConfig>;
  onSighting?: (sighting: SightingData) => void;
  className?: string;
}

export interface SightingData {
  timestamp: Date;
  species: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  snapshot?: string; // base64 jpeg
}

export function LiveCameraView({ config: partialConfig, onSighting, className = '' }: LiveCameraViewProps) {
  const config: StreamConfig = { ...DEFAULT_CONFIG, ...partialConfig };
  
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [debugInfo, setDebugInfo] = useState({
    fps: 0,
    engine: 'none',
    trackCount: 0,
    inferenceMs: 0,
  });
  const [activeMode, setActiveMode] = useState<'hls' | 'webrtc' | null>(null);
  const [mlStatus, setMlStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Build stream URLs from config
  const hlsUrl = config.gatewayUrl 
    ? `${config.gatewayUrl}/${config.streamPath}/index.m3u8`
    : undefined;
  
  const webrtcUrl = config.gatewayUrl
    ? `${config.gatewayUrl.replace(':8888', ':8889')}/${config.streamPath}/whep`
    : undefined;

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setVideoElement(video);
    
    // Create offscreen canvas for snapshots
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
  }, []);

  const handleModeChange = useCallback((mode: 'hls' | 'webrtc') => {
    setActiveMode(mode);
  }, []);

  // Capture snapshot from video
  const captureSnapshot = useCallback((): string | undefined => {
    if (!videoElement || !canvasRef.current) return undefined;
    
    const canvas = canvasRef.current;
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    
    ctx.drawImage(videoElement, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [videoElement]);

  // TODO: Initialize ML detection when mlEnabled and video is ready
  useEffect(() => {
    if (!config.mlEnabled || !videoElement) {
      setDetections([]);
      setMlStatus('idle');
      return;
    }

    // ML initialization would happen here
    setMlStatus('loading');
    
    // Placeholder: ML models not yet loaded
    // When models are ready, this would start the detection loop
    console.log('ML detection enabled - models not yet integrated');
    setMlStatus('idle'); // Will change to 'running' when models work
    
  }, [config.mlEnabled, videoElement]);

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${className}`}>
      {/* Video player */}
      <StreamPlayer
        hlsUrl={hlsUrl}
        webrtcUrl={webrtcUrl}
        mode={config.mode}
        onVideoReady={handleVideoReady}
        onModeChange={handleModeChange}
        className="aspect-video"
      />

      {/* Detection overlay */}
      {videoElement && (
        <VideoOverlay
          videoElement={videoElement}
          detections={detections}
          showDebug={config.showDebugOverlay}
          debugInfo={debugInfo}
        />
      )}

      {/* Developer Overlay */}
      {config.developerMode && (
        <DeveloperOverlay
          videoElement={videoElement}
          isActive={config.developerMode}
          modelStatus={mlStatus}
          inferenceData={undefined} // Will be populated when ML runs
        />
      )}

      {/* Status indicators */}
      <div className="absolute bottom-2 left-2 flex gap-2">
        {activeMode && (
          <span className="px-2 py-1 bg-black/60 rounded text-xs text-white">
            {activeMode.toUpperCase()}
          </span>
        )}
        {config.mlEnabled && (
          <span className={`px-2 py-1 rounded text-xs ${
            mlStatus === 'running' ? 'bg-emerald-600 text-white' :
            mlStatus === 'loading' ? 'bg-yellow-600 text-white' :
            mlStatus === 'error' ? 'bg-red-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            ML: {mlStatus}
          </span>
        )}
        {config.developerMode && (
          <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs">
            🔬 DEV
          </span>
        )}
      </div>
    </div>
  );
}
