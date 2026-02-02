# BirdCam Network — MVP Action Plan

## Phase 1: Core Infrastructure (TODAY)
- [x] Project scaffold (Next.js + Firebase)
- [x] Firebase Auth (Google sign-in)
- [x] Landing page + Dashboard shell
- [ ] Firestore integration (cameras, clips, sightings)
- [ ] Cloud Storage setup for media
- [ ] Camera CRUD (add, list, delete)

## Phase 2: Camera & Recording (DAYS 2-3)
- [ ] RTSP URL validation endpoint
- [ ] Camera preview (snapshot)
- [ ] Zone/mask editor UI
- [ ] Cloud Functions for video ingest
- [ ] Clip recording pipeline
- [ ] HLS playback

## Phase 3: AI Detection (DAYS 4-5)
- [ ] Bird detection integration (Replicate API)
- [ ] Species identification
- [ ] Sighting creation on detection
- [ ] Keyframe extraction & storage
- [ ] Clips feed UI

## Phase 4: Birds & Analytics (DAYS 6-7)
- [ ] Species library (seed data)
- [ ] Sighting details page
- [ ] Species confirmation UI
- [ ] Named birds (individuals)
- [ ] Basic analytics dashboard

## Phase 5: Community & NFTs (WEEK 2)
- [ ] Share clips (public links)
- [ ] ID request system
- [ ] Voting on IDs
- [ ] Solana wallet linking
- [ ] NFT minting flow

---

## TODAY'S TASKS (Executing Now)

### 1. Firestore Services
- Camera service (CRUD)
- User profile on first login
- Real-time listeners

### 2. Camera Management
- Add camera form (with validation)
- Camera list on dashboard
- Camera detail page
- Delete camera

### 3. UI Components
- Loading states
- Error handling
- Toast notifications
- Form validation

### 4. Deploy to Firebase Hosting
- First deployment
- Custom domain setup (BirdCamNetwork.com)
