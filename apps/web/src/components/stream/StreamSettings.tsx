'use client';

import { useState, useEffect } from 'react';
import { StreamMode } from './StreamPlayer';

export interface StreamConfig {
  mode: StreamMode;
  gatewayUrl: string;
  streamPath: string;
  mlEnabled: boolean;
  detectionThreshold: number;
  classificationThreshold: number;
  showDebugOverlay: boolean;
  developerMode: boolean;
}

interface StreamSettingsProps {
  config: StreamConfig;
  onSave: (config: StreamConfig) => Promise<void>;
  className?: string;
}

const DEFAULT_CONFIG: StreamConfig = {
  mode: 'hls',
  gatewayUrl: 'http://localhost:8888',
  streamPath: 'cam1',
  mlEnabled: true,  // ML enabled by default
  detectionThreshold: 0.35,
  classificationThreshold: 0.55,
  showDebugOverlay: false,
  developerMode: false,
};

export function StreamSettings({ config: initialConfig, onSave, className = '' }: StreamSettingsProps) {
  const [config, setConfig] = useState<StreamConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig({ ...DEFAULT_CONFIG, ...initialConfig });
  }, [initialConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getHlsUrl = () => `${config.gatewayUrl}/${config.streamPath}/index.m3u8`;
  const getWebrtcUrl = () => `${config.gatewayUrl.replace(':8888', ':8889')}/${config.streamPath}/whep`;

  return (
    <div className={`bg-white rounded-xl p-6 ${className}`}>
      <h3 className="font-semibold text-lg mb-4">Stream Settings</h3>

      {/* Streaming Mode */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Streaming Mode
        </label>
        <div className="flex gap-2">
          {(['hls', 'webrtc', 'auto'] as StreamMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setConfig({ ...config, mode })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                config.mode === mode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {config.mode === 'hls' && 'HTTP streaming, 2-8s latency, most compatible'}
          {config.mode === 'webrtc' && 'Real-time streaming, <1s latency, requires STUN'}
          {config.mode === 'auto' && 'Try WebRTC first, fallback to HLS'}
        </p>
      </div>

      {/* Gateway URL */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gateway URL
        </label>
        <input
          type="text"
          value={config.gatewayUrl}
          onChange={(e) => setConfig({ ...config, gatewayUrl: e.target.value })}
          placeholder="http://192.168.1.100:8888"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
        />
      </div>

      {/* Stream Path */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Stream Path
        </label>
        <input
          type="text"
          value={config.streamPath}
          onChange={(e) => setConfig({ ...config, streamPath: e.target.value })}
          placeholder="cam1"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          HLS: {getHlsUrl()}
        </p>
      </div>

      <hr className="my-6" />

      {/* ML Settings */}
      <h4 className="font-medium mb-4">Bird Detection (ML)</h4>

      {/* Enable ML */}
      <div className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.mlEnabled}
            onChange={(e) => setConfig({ ...config, mlEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable bird detection
          </span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-8">
          Runs in your browser - no cloud costs
        </p>
      </div>

      {config.mlEnabled && (
        <>
          {/* Detection Threshold */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Detection Threshold: {(config.detectionThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={config.detectionThreshold}
              onChange={(e) => setConfig({ ...config, detectionThreshold: parseFloat(e.target.value) })}
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Lower = more detections (may include false positives)
            </p>
          </div>

          {/* Classification Threshold */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Species Confidence: {(config.classificationThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.3"
              max="0.95"
              step="0.05"
              value={config.classificationThreshold}
              onChange={(e) => setConfig({ ...config, classificationThreshold: parseFloat(e.target.value) })}
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Minimum confidence to record a sighting
            </p>
          </div>

          {/* Debug Overlay */}
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showDebugOverlay}
                onChange={(e) => setConfig({ ...config, showDebugOverlay: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Show debug overlay
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-8">
              FPS, inference time, track count
            </p>
          </div>

          {/* Developer Mode */}
          <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.developerMode}
                onChange={(e) => setConfig({ ...config, developerMode: e.target.checked })}
                className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-purple-700">
                🔬 Developer Mode
              </span>
            </label>
            <p className="text-xs text-purple-600 mt-1 ml-8">
              Shows model inference visualization, tensor data, and detection heatmaps
            </p>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && (
          <span className="text-emerald-600 text-sm">✓ Saved</span>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_CONFIG };
