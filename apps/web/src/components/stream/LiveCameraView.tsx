'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamPlayer, StreamMode } from './StreamPlayer';
import { VideoOverlay, Detection } from './VideoOverlay';
import { StreamConfig, DEFAULT_CONFIG } from './StreamSettings';
import { DeveloperOverlay } from './DeveloperOverlay';
import { useDetectionPipeline } from '@/hooks/useDetectionPipeline';
import { useClipRecorder } from '@/hooks/useClipRecorder';

interface LiveCameraViewProps {
  config: Partial<StreamConfig>;
  cameraId?: string;
  userId?: string;
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

export function LiveCameraView({ config: partialConfig, cameraId, userId, onSighting, className = '' }: LiveCameraViewProps) {
  const config: StreamConfig = { ...DEFAULT_CONFIG, ...partialConfig };
  
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [activeMode, setActiveMode] = useState<'hls' | 'webrtc' | null>(null);
  
  // Clip recorder hook
  const {
    attach: attachRecorder,
    captureClip,
    isCapturing: isRecordingClip,
    clipCount,
    isSupported: clipRecorderSupported,
  } = useClipRecorder({ enabled: config.mlEnabled });

  // Detection pipeline hook
  const {
    status: pipelineStatus,
    detections: rawDetections,
    loadModels,
    start: startDetection,
    stop: stopDetection,
    isLoading,
    isRunning,
    error: pipelineError,
  } = useDetectionPipeline({
    targetFps: 5,
    detectionThreshold: config.detectionThreshold,
    classificationThreshold: config.classificationThreshold,
    enableClassification: true,
    onSighting: (sighting) => {
      onSighting?.({
        timestamp: sighting.timestamp,
        species: sighting.species,
        confidence: sighting.confidence,
        bbox: sighting.bbox,
        snapshot: sighting.snapshot,
      });
      
      // Trigger clip recording if we have camera/user context
      if (cameraId && userId && clipRecorderSupported) {
        captureClip({
          cameraId,
          userId,
          species: sighting.species,
          confidence: sighting.confidence,
          bbox: sighting.bbox,
          snapshot: sighting.snapshot,
        }).catch(err => console.error('[LiveCameraView] Clip capture error:', err));
      }
    },
  });

  // Convert raw detections to overlay format
  const detections: Detection[] = rawDetections.map(d => ({
    id: d.id,
    bbox: d.bbox,
    label: d.species,
    confidence: d.confidence,
  }));

  // Debug info
  const debugInfo = {
    fps: pipelineStatus.fps,
    engine: pipelineStatus.engine,
    trackCount: pipelineStatus.trackCount,
    inferenceMs: pipelineStatus.inferenceMs,
  };

  // Build stream URLs from config
  // Support multiple URL patterns:
  // 1. MediaMTX style: ${gatewayUrl}/${streamPath}/index.m3u8
  // 2. Pi-bridge style: ${gatewayUrl}/stream.m3u8
  // 3. go2rtc style: ${gatewayUrl}/api/stream.m3u8?src=${streamPath}
  // 4. Direct HLS URL if gatewayUrl ends with .m3u8
  const addApiKey = (url: string) => {
    if (!config.apiKey) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}api_key=${encodeURIComponent(config.apiKey)}`;
  };

  // Detect go2rtc style (port 1984 or explicit go2rtc in URL)
  const isGo2rtc = config.gatewayUrl?.includes(':1984') || config.gatewayUrl?.includes('go2rtc');
  const streamName = config.streamPath || 'birdcam';

  const buildHlsUrl = () => {
    if (!config.gatewayUrl) return undefined;
    
    let url: string;
    // If URL already ends with .m3u8, use directly
    if (config.gatewayUrl.endsWith('.m3u8')) {
      url = config.gatewayUrl;
    } else if (isGo2rtc) {
      // go2rtc style: /api/stream.m3u8?src=streamname
      const base = config.gatewayUrl.replace(/\/$/, '');
      url = `${base}/api/stream.m3u8?src=${streamName}`;
    } else {
      // Try pi-bridge style (single camera) or MediaMTX style (multi-camera)
      url = config.streamPath 
        ? `${config.gatewayUrl}/${config.streamPath}/index.m3u8`
        : `${config.gatewayUrl}/stream.m3u8`;
    }
    
    return addApiKey(url);
  };
  
  const hlsUrl = buildHlsUrl();
  
  const buildWebrtcUrl = () => {
    if (!config.gatewayUrl) return undefined;
    
    if (isGo2rtc) {
      // go2rtc WHEP endpoint
      const base = config.gatewayUrl.replace(/\/$/, '');
      return addApiKey(`${base}/api/webrtc?src=${streamName}`);
    } else {
      // Pi-bridge style (convert 8080 to 1984)
      return addApiKey(`${config.gatewayUrl.replace(':8080', ':1984')}/api/webrtc?src=birdcam`);
    }
  };
  
  const webrtcUrl = buildWebrtcUrl();

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setVideoElement(video);
  }, []);

  const handleModeChange = useCallback((mode: 'hls' | 'webrtc') => {
    setActiveMode(mode);
  }, []);

  // Attach clip recorder when video element is ready
  useEffect(() => {
    if (videoElement && config.mlEnabled) {
      attachRecorder(videoElement);
    }
  }, [videoElement, config.mlEnabled, attachRecorder]);

  // Load ML models when mlEnabled and not already loaded
  useEffect(() => {
    if (config.mlEnabled && !pipelineStatus.detectorLoaded && !isLoading && pipelineStatus.state !== 'error') {
      loadModels().catch(console.error);
    }
  }, [config.mlEnabled, pipelineStatus.detectorLoaded, isLoading, pipelineStatus.state, loadModels]);

  // Start/stop detection when video is ready and ML is enabled
  useEffect(() => {
    if (config.mlEnabled && videoElement && pipelineStatus.detectorLoaded && !isRunning) {
      console.log('[LiveCameraView] Starting detection pipeline');
      startDetection(videoElement);
    } else if (!config.mlEnabled && isRunning) {
      console.log('[LiveCameraView] Stopping detection pipeline');
      stopDetection();
    }
    
    return () => {
      if (isRunning) {
        stopDetection();
      }
    };
  }, [config.mlEnabled, videoElement, pipelineStatus.detectorLoaded, isRunning, startDetection, stopDetection]);

  // Determine ML status for display
  const mlStatus = isLoading ? 'loading' : 
                   pipelineError ? 'error' : 
                   isRunning ? 'running' : 
                   pipelineStatus.detectorLoaded ? 'ready' : 'idle';

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
          inferenceData={isRunning ? {
            fps: pipelineStatus.fps,
            inferenceMs: pipelineStatus.inferenceMs,
            detectionCount: detections.length,
            trackCount: pipelineStatus.trackCount,
            engine: pipelineStatus.engine,
          } : undefined}
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
            mlStatus === 'loading' ? 'bg-yellow-600 text-white animate-pulse' :
            mlStatus === 'error' ? 'bg-red-600 text-white' :
            mlStatus === 'ready' ? 'bg-blue-600 text-white' :
            'bg-gray-600 text-white'
          }`}>
            ML: {mlStatus}
            {mlStatus === 'running' && ` (${pipelineStatus.fps} fps)`}
          </span>
        )}
        {isRecordingClip && (
          <span className="px-2 py-1 bg-red-600 text-white rounded text-xs animate-pulse">
            ⏺ REC
          </span>
        )}
        {clipCount > 0 && !isRecordingClip && (
          <span className="px-2 py-1 bg-gray-600 text-white rounded text-xs">
            🎬 {clipCount} clip{clipCount !== 1 ? 's' : ''}
          </span>
        )}
        {config.developerMode && (
          <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs">
            🔬 DEV
          </span>
        )}
      </div>

      {/* Model loading progress */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mx-auto mb-3"></div>
            <p className="text-sm">Loading ML models...</p>
            <p className="text-xs text-gray-400 mt-1">First load may take a moment</p>
          </div>
        </div>
      )}

      {/* Error display */}
      {pipelineError && (
        <div className="absolute top-2 left-2 right-2 bg-red-500/90 text-white text-xs p-2 rounded">
          ML Error: {pipelineError}
        </div>
      )}
    </div>
  );
}
