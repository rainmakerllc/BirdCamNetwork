# BirdCam Network - Master TODO

## 🚀 LIVE: https://birdwatchnetwork.web.app

## Phase 1: Core Setup ✅
- [x] Project scaffolding (Next.js + Tailwind)
- [x] Firebase configuration
- [x] Authentication (Google sign-in)
- [x] Firestore security rules
- [x] Storage rules
- [x] TypeScript types

## Phase 2: Services ✅
- [x] Users service
- [x] Cameras service
- [x] Clips service
- [x] Sightings service
- [x] Species service
- [x] Individuals service
- [x] Wallets service
- [x] NFTs service

## Phase 3: UI Pages ✅
- [x] Landing page
- [x] Dashboard
- [x] Cameras list + detail
- [x] Clips page
- [x] Birds page
- [x] Analytics page
- [x] Community page
- [x] NFTs page
- [x] Settings page
- [x] Explore page (public bird cams)

## Phase 4: UI Components ✅
- [x] Button component
- [x] Badge component
- [x] Card component
- [x] Modal component
- [x] Input component
- [x] EmptyState component
- [x] Dashboard layout with nav

## Phase 5: Data & Content ✅
- [x] Seed species database (54 NA birds)
- [x] Add favicon and app icons
- [x] Seed public bird cams (6 YouTube feeds)
  - Cornell Lab FeederWatch
  - Decorah Eagles
  - Panama Fruit Feeder
  - Recke Wetlands (Germany)
  - UK Garden Birds
  - Bella Hummingbirds

## Phase 6: Firebase Deploy ✅
- [x] Firestore rules deployed
- [x] Static hosting deployed
- [x] Live at https://birdwatchnetwork.web.app
- [ ] Connect custom domain (optional)
- [ ] Enable Cloud Functions (requires Admin role)

## Phase 7: Testing ✅
- [x] Test auth flow end-to-end
- [x] Test camera CRUD
- [x] All dashboard pages build
- [x] Mobile responsive nav
- [x] Production build passes

## ⚠️ Architecture Decisions (Bruce's Direction)
- **No continuous video storage** - Live feeds only
- **Capture on detection** - Snapshot + short clip when bird appears
- **Open source bird ID** - Use BirdNET (free, runs locally, no API costs)
- **$200 hard cap** - Do not exceed without written approval

## Phase 8: Remaining Features 🔄
- [ ] Camera stream preview (RTSP → HLS transcoding)
- [ ] Bird detection integration (BirdNET/custom model)
- [ ] Clip recording when bird detected
- [ ] Species classification display
- [ ] Individual bird tracking
- [ ] NFT minting (Solana integration)
- [ ] Community leaderboard

## Phase 9: Backend Services (Future)
- [ ] Camera stream ingestion worker
- [ ] Bird detection ML pipeline
- [ ] Species classification model
- [ ] Individual recognition
- [ ] NFT minting service
- [ ] Push notifications

---
Last updated: 2026-02-02
Status: MVP DEPLOYED 🎉
