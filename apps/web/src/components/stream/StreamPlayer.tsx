'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';

export type StreamMode = 'hls' | 'webrtc' | 'auto';

interface StreamPlayerProps {
  hlsUrl?: string;
  webrtcUrl?: string;
  mode?: StreamMode;
  autoPlay?: boolean;
  muted?: boolean;
  onVideoReady?: (video: HTMLVideoElement) => void;
  onError?: (error: string) => void;
  onModeChange?: (mode: 'hls' | 'webrtc') => void;
  className?: string;
}

export function StreamPlayer({
  hlsUrl,
  webrtcUrl,
  mode = 'auto',
  autoPlay = true,
  muted = true,
  onVideoReady,
  onError,
  onModeChange,
  className = '',
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  
  const [activeMode, setActiveMode] = useState<'hls' | 'webrtc' | null>(null);
  const [status, setStatus] = useState<'connecting' | 'playing' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  // HLS playback
  const startHls = useCallback(async () => {
    if (!hlsUrl || !videoRef.current) return false;

    try {
      // Check if native HLS is supported (Safari)
      if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        await videoRef.current.play();
        setActiveMode('hls');
        setStatus('playing');
        onModeChange?.('hls');
        onVideoReady?.(videoRef.current);
        return true;
      }

      // Use HLS.js for other browsers
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        
        hlsRef.current = hls;
        
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            const msg = `HLS error: ${data.type}`;
            setErrorMsg(msg);
            setStatus('error');
            onError?.(msg);
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, async () => {
          try {
            await videoRef.current?.play();
            setActiveMode('hls');
            setStatus('playing');
            onModeChange?.('hls');
            if (videoRef.current) onVideoReady?.(videoRef.current);
          } catch (e) {
            console.error('HLS play error:', e);
          }
        });

        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);
        return true;
      }

      return false;
    } catch (e) {
      console.error('HLS start error:', e);
      return false;
    }
  }, [hlsUrl, onError, onModeChange, onVideoReady]);

  // WebRTC playback
  const startWebRTC = useCallback(async () => {
    if (!webrtcUrl || !videoRef.current) return false;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().then(() => {
            setActiveMode('webrtc');
            setStatus('playing');
            onModeChange?.('webrtc');
            if (videoRef.current) onVideoReady?.(videoRef.current);
          }).catch(console.error);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          const msg = 'WebRTC connection failed';
          setErrorMsg(msg);
          setStatus('error');
          onError?.(msg);
        }
      };

      // Add transceiver for receiving video
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Create and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') resolve();
          };
        }
      });

      // Send offer to WHEP endpoint
      const response = await fetch(webrtcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp,
      });

      if (!response.ok) throw new Error('WHEP request failed');

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      return true;
    } catch (e) {
      console.error('WebRTC start error:', e);
      return false;
    }
  }, [webrtcUrl, onError, onModeChange, onVideoReady]);

  // Main connection logic
  useEffect(() => {
    const connect = async () => {
      cleanup();
      setStatus('connecting');
      setErrorMsg(null);

      if (mode === 'webrtc' && webrtcUrl) {
        const success = await startWebRTC();
        if (!success && hlsUrl) {
          console.log('WebRTC failed, falling back to HLS');
          await startHls();
        } else if (!success) {
          setStatus('error');
          setErrorMsg('WebRTC not available');
        }
      } else if (mode === 'hls' && hlsUrl) {
        const success = await startHls();
        if (!success) {
          setStatus('error');
          setErrorMsg('HLS not available');
        }
      } else if (mode === 'auto') {
        // Try WebRTC first, then HLS
        if (webrtcUrl) {
          const success = await startWebRTC();
          if (success) return;
        }
        if (hlsUrl) {
          const success = await startHls();
          if (success) return;
        }
        setStatus('error');
        setErrorMsg('No stream available');
      }
    };

    if (hlsUrl || webrtcUrl) {
      connect();
    }

    return cleanup;
  }, [hlsUrl, webrtcUrl, mode, cleanup, startHls, startWebRTC]);

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        className="w-full h-full object-contain"
      />
      
      {/* Status overlay */}
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mx-auto mb-2"></div>
            <p className="text-sm">Connecting...</p>
          </div>
        </div>
      )}
      
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <div className="text-3xl mb-2">❌</div>
            <p className="text-sm">{errorMsg || 'Stream error'}</p>
          </div>
        </div>
      )}

      {/* Mode indicator */}
      {activeMode && status === 'playing' && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
          {activeMode.toUpperCase()}
        </div>
      )}
    </div>
  );
}
