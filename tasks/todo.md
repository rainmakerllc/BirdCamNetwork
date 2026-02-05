# BirdCam Network - Development Session (2026-02-05)

## Plan

### 1. Fix Pi-Bridge STREAM_MODE Issue
- [x] Document the fix for Bruce to run on Pi (change .env STREAM_MODE=hls)
- [x] Update pi-bridge config default to 'hls' instead of 'webrtc'

### 2. Clip Recording on Detection (Browser-side)
- [x] Add MediaRecorder-based clip capture in the browser ML pipeline
- [x] Save clips to Firebase Storage with metadata in Firestore  
- [x] Wire into detection pipeline (record N seconds around a sighting)

### 3. ML Pipeline Improvements
- [x] Improve species label mapping (ImageNet classes → friendly bird names)
- [x] Add clip recording hook that triggers on sighting events

### 4. Dashboard Improvements
- [x] Add sightings timeline with thumbnails on camera page
- [x] Add daily activity summary component on main dashboard

### 5. Code Quality & Commit
- [x] Commit all changes
- [x] Push to GitHub
- [x] Document Pi-side instructions for Bruce

## Status: COMPLETE ✅
