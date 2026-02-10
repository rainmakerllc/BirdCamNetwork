'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { LiveCameraView, SightingData } from '@/components/stream/LiveCameraView';
import { StreamConfig, DEFAULT_CONFIG } from '@/components/stream/StreamSettings';

export default function MLTestPage() {
  const [sightings, setSightings] = useState<SightingData[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const handleSighting = useCallback((sighting: SightingData) => {
    setSightings(prev => [sighting, ...prev].slice(0, 20));
    addLog(`🐦 BIRD: ${sighting.species} (${(sighting.confidence * 100).toFixed(1)}%)`);
  }, [addLog]);

  useEffect(() => {
    addLog('ML Test page loaded');
    addLog('Connecting to Florida Bird Cam stream via go2rtc...');
  }, [addLog]);

  const config: Partial<StreamConfig> = {
    mode: 'auto',
    gatewayUrl: 'http://192.168.86.34:1984',
    streamPath: 'florida-birdcam',
    mlEnabled: true,
    detectionThreshold: 0.25,
    classificationThreshold: 0.4,
    showDebugOverlay: true,
    developerMode: true,
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">🧪 ML Bird Detection Test</h1>
      <p className="text-gray-400 mb-4">Testing on: FL Birds Live Cam (YouTube → go2rtc → WebRTC/HLS → ML)</p>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stream + ML */}
        <div className="lg:col-span-2">
          <LiveCameraView
            config={config}
            onSighting={handleSighting}
            className="w-full"
          />
        </div>

        {/* Log + Sightings */}
        <div className="space-y-4">
          {/* Sightings */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">🐦 Sightings ({sightings.length})</h2>
            {sightings.length === 0 ? (
              <p className="text-gray-500 text-sm">Waiting for bird detections...</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sightings.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-700 rounded p-2">
                    {s.snapshot && (
                      <img src={s.snapshot} alt={s.species} className="w-12 h-12 rounded object-cover" />
                    )}
                    <div>
                      <div className="font-medium">{s.species}</div>
                      <div className="text-xs text-gray-400">
                        {(s.confidence * 100).toFixed(1)}% • {s.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Log */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">📋 Log</h2>
            <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
              {log.map((msg, i) => (
                <div key={i} className={msg.includes('BIRD') ? 'text-green-400' : 'text-gray-400'}>
                  {msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
