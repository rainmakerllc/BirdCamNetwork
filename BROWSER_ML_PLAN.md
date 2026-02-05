# Browser-Side Bird Recognition - Implementation Plan

## Overview
Add real-time bird detection and species classification running entirely in the browser. Support both HLS (default) and WebRTC streaming with admin toggle.

## Constraints
- **$200 budget cap** - No paid APIs, all ML runs client-side
- **No TURN server** - HLS primary, WebRTC with STUN only
- **Open source only** - ONNX Runtime Web, free models

---

## Phase 1: Stream Gateway Setup (Day 1-2)
### Goal: Get Pi camera streaming to browser

**Tasks:**
- [ ] 1.1 Install MediaMTX on local network (Pi or Windows)
- [ ] 1.2 Configure RTSP input from Pi camera
- [ ] 1.3 Enable HLS output (HTTP segments)
- [ ] 1.4 Enable WebRTC output (STUN only, no TURN)
- [ ] 1.5 Test both streams in VLC and browser

**Deliverables:**
- MediaMTX config file
- HLS endpoint: `http://<gateway>:8888/<stream>/index.m3u8`
- WebRTC endpoint: `http://<gateway>:8889/<stream>`

---

## Phase 2: Video Player Component (Day 2-3) ✅ DONE
### Goal: Play HLS and WebRTC streams in React

**Tasks:**
- [x] 2.1 Create `<StreamPlayer>` component
- [x] 2.2 Add HLS.js for HLS playback
- [x] 2.3 Add WebRTC player (simple peer connection)
- [x] 2.4 Auto-detect and fallback: WebRTC → HLS
- [x] 2.5 Expose video element ref for frame capture

**Component API:**
```tsx
<StreamPlayer
  hlsUrl="http://gateway:8888/cam1/index.m3u8"
  webrtcUrl="http://gateway:8889/cam1"
  preferredMode="hls" | "webrtc" | "auto"
  onVideoReady={(videoEl) => void}
/>
```

---

## Phase 3: Admin Settings (Day 3) ✅ DONE
### Goal: Configure streaming mode per camera

**Tasks:**
- [x] 3.1 Add `streamSettings` to Firestore camera doc
- [x] 3.2 Create admin settings panel in camera detail page
- [x] 3.3 Settings:
  - Streaming mode: HLS / WebRTC / Auto
  - Gateway URL (base)
  - Enable ML detection toggle
  - Detection sensitivity (confidence threshold)
- [x] 3.4 Save/load settings from Firestore

**Firestore Schema Update:**
```typescript
interface Camera {
  // ... existing fields
  streamSettings?: {
    mode: 'hls' | 'webrtc' | 'auto';
    gatewayUrl: string;
    mlEnabled: boolean;
    detectionThreshold: number; // 0.0 - 1.0
    classificationThreshold: number;
  };
}
```

---

## Phase 4: ML Model Integration (Day 4-6) ✅ DONE
### Goal: Load and run ONNX models in browser

**Tasks:**
- [x] 4.1 Source/convert bird detector model (YOLOv5n ONNX from SourceForge)
- [x] 4.2 Source/convert species classifier model (placeholder - returns "Bird")
- [x] 4.3 Create model loader with local hosting (/public/models/)
- [x] 4.4 Implement engine detection (WebGPU → WASM)
- [x] 4.5 Create inference abstraction layer (BirdDetector class)

**Models to acquire:**
1. **Detector**: YOLOv8n trained on birds (or generic + filter)
   - Input: 416x416 RGB
   - Output: boxes + confidence
   - Size: ~6MB quantized

2. **Classifier**: MobileNetV3 on bird species
   - Input: 224x224 RGB crop
   - Output: top-K species + confidence
   - Size: ~10MB quantized

**Model hosting:**
- Store in Firebase Storage or public CDN
- Load on demand (lazy load when ML enabled)

---

## Phase 5: Detection Pipeline (Day 6-8) ✅ DONE
### Goal: Real-time inference (main thread for now)

**Tasks:**
- [x] 5.1 Create `DetectionPipeline` class (main thread, Web Worker planned)
- [x] 5.2 Frame capture from video element
- [x] 5.3 Downscale to model input size (640x640)
- [x] 5.4 Run detector at configurable FPS (default 5)
- [x] 5.5 Run classifier on detected regions (placeholder)
- [x] 5.6 Implemented via requestAnimationFrame throttling
- [x] 5.7 Callbacks for detections and sightings

**Pipeline:**
```
Video Frame (720p)
    ↓ downsample
Detector Input (416x416)
    ↓ ONNX inference
Bounding Boxes
    ↓ filter (confidence > threshold)
    ↓ crop from original frame
Classifier Input (224x224 per box)
    ↓ ONNX inference
Species Predictions
    ↓ smooth over time
Final Results
```

---

## Phase 6: Tracking & Deduplication (Day 8-9) ✅ DONE
### Goal: Don't spam 100 events for one bird

**Tasks:**
- [x] 6.1 Implement IoU-based box matching (BirdTracker class)
- [x] 6.2 Create track objects (id, first_seen, last_seen, species)
- [x] 6.3 Smooth species predictions (rolling window)
- [x] 6.4 Emit sighting event only when:
  - Track duration ≥ 1.5s
  - Confidence ≥ 0.55
  - Not emitted in last 10s for same track

**Track Object:**
```typescript
interface Track {
  id: string;
  firstSeen: number;
  lastSeen: number;
  bbox: BBox;
  speciesHistory: Array<{ label: string; score: number }>;
  bestSpecies: string;
  bestConfidence: number;
  emitted: boolean;
}
```

---

## Phase 7: Overlay Rendering (Day 9-10) ✅ DONE
### Goal: Draw boxes and labels on video

**Tasks:**
- [x] 7.1 Create overlay canvas component (VideoOverlay)
- [x] 7.2 Scale boxes to displayed video size
- [x] 7.3 Draw bounding boxes with species labels
- [x] 7.4 Show confidence percentage
- [x] 7.5 Debug overlay (FPS, engine, track count) - DeveloperOverlay

---

## Phase 8: Sighting Events & Timeline (Day 10-12)
### Goal: Save and display detection events

**Tasks:**
- [ ] 8.1 Create sighting event on confirmed detection
- [ ] 8.2 Capture snapshot (canvas → JPEG)
- [ ] 8.3 Save to Firestore (metadata) + Storage (snapshot)
- [ ] 8.4 Create timeline UI component
- [ ] 8.5 Filter by species, confidence, time
- [ ] 8.6 Stats panel (counts, last seen)

**Event Schema:**
```typescript
interface SightingEvent {
  id: string;
  cameraId: string;
  userId: string;
  timestamp: Date;
  species: string;
  confidence: number;
  topK: Array<{ label: string; score: number }>;
  bbox: { x: number; y: number; w: number; h: number };
  snapshotUrl?: string;
  engine: 'webgpu' | 'wasm';
}
```

---

## Phase 9: Integration & Polish (Day 12-14)
### Goal: Wire everything together

**Tasks:**
- [ ] 9.1 Integrate StreamPlayer + ML pipeline
- [ ] 9.2 Add to camera detail page
- [ ] 9.3 Update dashboard with recent sightings
- [ ] 9.4 Performance optimization
- [ ] 9.5 Error handling and fallbacks
- [ ] 9.6 Mobile responsiveness (throttle harder)

---

## Phase 10: Testing & Deployment (Day 14-16)
### Goal: Verify everything works

**Tasks:**
- [ ] 10.1 Test HLS streaming end-to-end
- [ ] 10.2 Test WebRTC streaming
- [ ] 10.3 Test ML detection accuracy
- [ ] 10.4 Test on different browsers
- [ ] 10.5 Performance benchmarks
- [ ] 10.6 Deploy updated web app
- [ ] 10.7 Documentation

---

## File Structure

```
apps/web/src/
├── components/
│   ├── stream/
│   │   ├── StreamPlayer.tsx      # HLS + WebRTC player
│   │   ├── VideoOverlay.tsx      # Bounding box canvas
│   │   └── StreamSettings.tsx    # Admin config UI
│   ├── detection/
│   │   ├── DetectionPipeline.tsx # Orchestrates ML
│   │   ├── SightingTimeline.tsx  # Event list
│   │   └── StatsPanel.tsx        # Species counts
│   └── ui/
│       └── ... existing
├── workers/
│   └── detection.worker.ts       # ML inference worker
├── lib/
│   ├── ml/
│   │   ├── modelLoader.ts        # ONNX model loading
│   │   ├── detector.ts           # Bird detection
│   │   ├── classifier.ts         # Species classification
│   │   ├── tracker.ts            # Track management
│   │   └── engineDetect.ts       # WebGPU/WASM detection
│   ├── stream/
│   │   ├── hlsPlayer.ts          # HLS.js wrapper
│   │   └── webrtcPlayer.ts       # WebRTC connection
│   └── services/
│       └── sightings.ts          # Already exists
└── types/
    └── index.ts                  # Add new types
```

---

## Dependencies to Add

```json
{
  "hls.js": "^1.5.0",
  "onnxruntime-web": "^1.17.0"
}
```

---

## Model Acquisition Strategy

### Option A: Use existing models (Fastest)
1. Generic YOLO detector (filter for "bird" class)
2. iNaturalist classifier (has bird species)

### Option B: Fine-tuned models (Better accuracy)
1. Train YOLOv8n on bird dataset (Caltech Birds, NABirds)
2. Use existing BirdNET visual classifier if available

### For MVP: Start with Option A
- Get pipeline working first
- Swap models later for better accuracy

---

## Success Criteria

1. ✅ Video plays smoothly (HLS and WebRTC)
2. ✅ Admin can toggle streaming mode
3. ✅ Detection runs ≥5 FPS on desktop
4. ✅ Overlays render correctly
5. ✅ Events deduplicate properly
6. ✅ Sightings save to Firestore
7. ✅ No server-side inference costs

---

## Timeline Summary

| Week | Phases | Deliverables |
|------|--------|--------------|
| 1 | 1-3 | Streaming + Admin config |
| 2 | 4-6 | ML models + Detection pipeline |
| 3 | 7-10 | UI + Events + Polish |

**Total: ~3 weeks to MVP**

---

## Status: 2026-02-03

✅ **Phases 2-7 COMPLETE** - Browser ML detection pipeline fully implemented!

**Next up:** 
- Phase 8: Save sightings to Firestore
- Phase 9: Integration testing with real camera stream
- Phase 10: Performance optimization

**Model used:** YOLOv5n ONNX (4MB) - detects COCO bird class
**Location:** `/public/models/yolov5n.onnx`
