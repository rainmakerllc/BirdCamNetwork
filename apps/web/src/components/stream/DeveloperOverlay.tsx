'use client';

import { useEffect, useRef, useState } from 'react';

interface DeveloperOverlayProps {
  videoElement: HTMLVideoElement | null;
  isActive: boolean;
  modelStatus: 'idle' | 'loading' | 'running' | 'error' | 'ready';
  inferenceData?: {
    fps?: number;
    inferenceMs?: number;
    detectionCount?: number;
    trackCount?: number;
    engine?: string;
    inputTensorShape?: number[];
    outputTensorShape?: number[];
    preprocessMs?: number;
    postprocessMs?: number;
    detectorOutput?: number[];
    classifierOutput?: { label: string; score: number }[];
    rawBoxes?: Array<{ x: number; y: number; w: number; h: number; conf: number }>;
  };
}

export function DeveloperOverlay({
  videoElement,
  isActive,
  modelStatus,
  inferenceData,
}: DeveloperOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [showTensorViz, setShowTensorViz] = useState(true);

  // Draw input tensor visualization
  useEffect(() => {
    if (!isActive || !videoElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas to video size
    canvas.width = 416; // Model input size
    canvas.height = 416;

    const drawFrame = () => {
      if (!videoElement || videoElement.paused) return;

      // Draw downscaled video (what model sees)
      ctx.drawImage(videoElement, 0, 0, 416, 416);

      // Draw grid overlay
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      
      // 13x13 grid (YOLOv8 detection grid)
      const gridSize = 416 / 13;
      for (let i = 0; i <= 13; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, 416);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(416, i * gridSize);
        ctx.stroke();
      }

      // Draw raw detection boxes if available
      if (inferenceData?.rawBoxes) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 2;
        for (const box of inferenceData.rawBoxes) {
          const x = box.x * 416;
          const y = box.y * 416;
          const w = box.w * 416;
          const h = box.h * 416;
          ctx.strokeRect(x, y, w, h);
          
          // Confidence
          ctx.fillStyle = 'yellow';
          ctx.font = '10px monospace';
          ctx.fillText(`${(box.conf * 100).toFixed(0)}%`, x, y - 2);
        }
      }

      setFrameCount(f => f + 1);
    };

    const interval = setInterval(drawFrame, 200); // 5 FPS for dev view
    return () => clearInterval(interval);
  }, [isActive, videoElement, inferenceData]);

  if (!isActive) return null;

  return (
    <div className="absolute top-0 right-0 w-80 bg-gray-900/95 text-white p-3 m-2 rounded-lg font-mono text-xs overflow-hidden max-h-[90%] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-purple-400 font-bold">🔬 Developer Mode</span>
        <span className={`px-2 py-0.5 rounded ${
          modelStatus === 'running' ? 'bg-green-600' :
          modelStatus === 'loading' ? 'bg-yellow-600' :
          modelStatus === 'error' ? 'bg-red-600' :
          'bg-gray-600'
        }`}>
          {modelStatus}
        </span>
      </div>

      {/* Model Input Visualization */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-400">Model Input (416×416)</span>
          <button
            onClick={() => setShowTensorViz(!showTensorViz)}
            className="text-purple-400 hover:text-purple-300"
          >
            {showTensorViz ? 'Hide' : 'Show'}
          </button>
        </div>
        {showTensorViz && (
          <canvas
            ref={canvasRef}
            width={416}
            height={416}
            className="w-full rounded border border-gray-700"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
      </div>

      {/* Quick Stats */}
      {inferenceData && (
        <div className="mb-3 p-2 bg-gray-800 rounded">
          <div className="text-gray-400 mb-1">Live Stats</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {inferenceData.fps !== undefined && (
              <div>
                <span className="text-gray-500">FPS:</span>{' '}
                <span className="text-green-400">{inferenceData.fps}</span>
              </div>
            )}
            {inferenceData.inferenceMs !== undefined && (
              <div>
                <span className="text-gray-500">Inference:</span>{' '}
                <span className="text-yellow-400">{inferenceData.inferenceMs}ms</span>
              </div>
            )}
            {inferenceData.detectionCount !== undefined && (
              <div>
                <span className="text-gray-500">Detections:</span>{' '}
                <span className="text-cyan-400">{inferenceData.detectionCount}</span>
              </div>
            )}
            {inferenceData.trackCount !== undefined && (
              <div>
                <span className="text-gray-500">Tracks:</span>{' '}
                <span className="text-purple-400">{inferenceData.trackCount}</span>
              </div>
            )}
            {inferenceData.engine && (
              <div className="col-span-2">
                <span className="text-gray-500">Engine:</span>{' '}
                <span className="text-emerald-400">{inferenceData.engine}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Timing Stats */}
      {(inferenceData?.preprocessMs !== undefined || inferenceData?.postprocessMs !== undefined) && (
        <div className="mb-3 p-2 bg-gray-800 rounded">
          <div className="text-gray-400 mb-1">Pipeline Timing</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-green-400">{inferenceData?.preprocessMs?.toFixed(1) || '—'}ms</div>
              <div className="text-gray-500 text-[10px]">Preprocess</div>
            </div>
            <div>
              <div className="text-yellow-400">{inferenceData?.inferenceMs?.toFixed(1) || '—'}ms</div>
              <div className="text-gray-500 text-[10px]">Inference</div>
            </div>
            <div>
              <div className="text-blue-400">{inferenceData?.postprocessMs?.toFixed(1) || '—'}ms</div>
              <div className="text-gray-500 text-[10px]">Postprocess</div>
            </div>
          </div>
        </div>
      )}

      {/* Tensor Shapes */}
      <div className="mb-3 p-2 bg-gray-800 rounded">
        <div className="text-gray-400 mb-1">Tensor Shapes</div>
        <div className="text-[10px] space-y-1">
          <div>
            <span className="text-gray-500">Input:</span>{' '}
            <span className="text-cyan-400">
              [{inferenceData?.inputTensorShape?.join(', ') || '1, 3, 416, 416'}]
            </span>
          </div>
          <div>
            <span className="text-gray-500">Output:</span>{' '}
            <span className="text-cyan-400">
              [{inferenceData?.outputTensorShape?.join(', ') || '1, 84, 3549'}]
            </span>
          </div>
        </div>
      </div>

      {/* Raw Detections */}
      {inferenceData?.rawBoxes && inferenceData.rawBoxes.length > 0 && (
        <div className="mb-3 p-2 bg-gray-800 rounded">
          <div className="text-gray-400 mb-1">
            Raw Detections ({inferenceData.rawBoxes.length})
          </div>
          <div className="max-h-24 overflow-y-auto text-[10px] space-y-1">
            {inferenceData.rawBoxes.map((box, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500">Box {i}:</span>
                <span>
                  [{box.x.toFixed(2)}, {box.y.toFixed(2)}, {box.w.toFixed(2)}, {box.h.toFixed(2)}]
                </span>
                <span className="text-yellow-400">{(box.conf * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Classifier Output */}
      {inferenceData?.classifierOutput && inferenceData.classifierOutput.length > 0 && (
        <div className="mb-3 p-2 bg-gray-800 rounded">
          <div className="text-gray-400 mb-1">Species Classification</div>
          <div className="space-y-1">
            {inferenceData.classifierOutput.slice(0, 5).map((pred, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${pred.score * 100}%` }}
                  />
                </div>
                <span className="w-24 truncate text-[10px]">{pred.label}</span>
                <span className="text-emerald-400 w-10 text-right">
                  {(pred.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frame Counter */}
      <div className="text-gray-500 text-[10px] text-right">
        Frame: {frameCount}
      </div>
    </div>
  );
}
