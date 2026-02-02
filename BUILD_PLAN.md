# BirdCam Network — Complete Build Plan

**Domain:** BirdCamNetwork.com  
**Version:** Based on Comprehensive Spec v3 + Solana NFT  
**Created:** 2026-02-01

---

## Executive Summary

BirdCam Network is a SaaS platform that connects IP cameras (ONVIF/RTSP) to detect birds, identify species, recognize recurring individuals, and enable community sharing with gamification — plus optional Solana NFT minting.

**Timeline Estimate:**
- **MVP:** 10-12 weeks
- **v1 (NFTs + Community):** +16-20 weeks
- **v2 (Scale + Pro):** +6-12 months

---

## Tech Stack Recommendation

### Frontend
| Layer | Tech | Rationale |
|-------|------|-----------|
| Web App | **Next.js 14+** (App Router) | SSR/SSG, great DX, Vercel deployment |
| Styling | **Tailwind CSS + shadcn/ui** | Rapid iteration, consistent design |
| State | **Zustand** or **TanStack Query** | Simple state + server state caching |
| Video Player | **HLS.js** + custom controls | HLS streaming, timeline scrubbing |
| Wallet | **@solana/wallet-adapter** | Standard Solana wallet integration |
| Mobile (later) | **React Native** or **Expo** | Code sharing, push notifications |

### Backend
| Layer | Tech | Rationale |
|-------|------|-----------|
| API | **Node.js + Fastify** or **Bun + Hono** | Fast, TypeScript-first |
| Auth | **Clerk** or **Auth.js** + custom JWT | OAuth + email, org/roles |
| Database | **PostgreSQL** (Neon/Supabase) | Relational, JSONB for flexibility |
| Cache | **Redis** (Upstash) | Session, rate limits, leaderboards |
| Queue | **BullMQ** or **Inngest** | Job processing, event-driven |
| Search | **Meilisearch** or Postgres FTS | Species/clip search |
| ORM | **Drizzle** or **Prisma** | Type-safe, migrations |

### Media & AI Pipeline
| Layer | Tech | Rationale |
|-------|------|-----------|
| Video Ingest | **FFmpeg** + custom workers | RTSP pull, transcoding |
| Object Storage | **Cloudflare R2** or **S3** | Cost-effective, CDN integration |
| CDN | **Cloudflare** | Global, HLS delivery |
| ML Inference | **Replicate** / **Roboflow** / Custom | Bird detection + species ID |
| Edge Agent | **Go** or **Rust** binary | Local RTSP, privacy masking |

### Blockchain (Solana NFTs)
| Layer | Tech | Rationale |
|-------|------|-----------|
| NFT Standard | **Metaplex Token Metadata** | Industry standard |
| SDK | **@metaplex-foundation/js** | Metadata, collections |
| Off-chain Storage | **Arweave** (Bundlr) | Permanent, decentralized |
| Wallet Adapter | **@solana/wallet-adapter-react** | Multi-wallet support |
| RPC | **Helius** or **QuickNode** | Reliable, indexed |

### Infrastructure
| Layer | Tech | Rationale |
|-------|------|-----------|
| Hosting | **Vercel** (web) + **Railway/Render** (API) | Easy deployment |
| Containers | **Docker** + **Fly.io** for workers | Scalable ingest workers |
| Monitoring | **Sentry** + **Axiom** | Errors, logs, traces |
| Feature Flags | **LaunchDarkly** or **Vercel Flags** | Controlled rollouts |

---

## Phase 1: MVP (Weeks 1-12)

### Goals
- User auth + basic account management
- Add RTSP camera + preview + health monitoring
- Zones/masks editor (polygon UI)
- Event-based clip recording with pre-roll
- Bird detection (motion → bird vs non-bird)
- Species ID on keyframes (top-N candidates)
- Basic timeline + clip player
- Analytics dashboard (visits, species breakdown)
- Alerts (new species, camera offline)
- Basic sharing (private/link)

### Week-by-Week Breakdown

#### Weeks 1-2: Foundation
- [ ] Project scaffolding (monorepo: pnpm workspaces)
- [ ] Next.js app setup with Tailwind + shadcn/ui
- [ ] Auth system (Clerk or Auth.js)
- [ ] Database schema v1 (User, Camera, Zone, Clip, Sighting, BirdSpecies)
- [ ] API skeleton (Fastify/Hono + OpenAPI validation)
- [ ] CI/CD pipeline (GitHub Actions → Vercel + Railway)

#### Weeks 3-4: Camera Onboarding
- [ ] RTSP URL input + validation UI
- [ ] FFmpeg probe worker (codec/resolution/fps check)
- [ ] Camera health status polling
- [ ] Stream preview component (MJPEG snapshot or short HLS test)
- [ ] Zone/mask polygon editor (canvas-based)
- [ ] Privacy mask enforcement in pipeline

#### Weeks 5-6: Recording Pipeline
- [ ] Circular buffer implementation (configurable 30-120s)
- [ ] Motion detection trigger (cheap pre-filter)
- [ ] Bird detection model integration (Replicate/Roboflow)
- [ ] Clip assembly with pre/post roll
- [ ] HLS transcoding + upload to R2
- [ ] Clip metadata storage + status updates

#### Weeks 7-8: Species Identification
- [ ] Species classifier integration (keyframe crops)
- [ ] Top-N candidates + confidence scoring
- [ ] Regional/seasonal priors (optional boost)
- [ ] BirdSpecies reference data seeding (~900 NA species)
- [ ] User override UI (confirm/correct species)
- [ ] Store model_label vs final_label + source

#### Weeks 9-10: Clip UI + Analytics
- [ ] Clips feed with filters (camera, species, date, confidence)
- [ ] Clip player: HLS playback, timeline scrubbing, keyframes
- [ ] Species label display + confidence indicator
- [ ] "Confirm" / "Correct" flow
- [ ] Analytics dashboard: visits/day chart, species breakdown, heatmap
- [ ] 30-day aggregates with caching

#### Weeks 11-12: Alerts + Sharing + Polish
- [ ] Alert configuration UI (new species, rare, camera offline)
- [ ] Push notifications (web push) + email (Resend/Postmark)
- [ ] Rate limiting + quiet hours
- [ ] Share controls (private/link/public)
- [ ] Share page (public clip view)
- [ ] Landing page + onboarding flow
- [ ] MVP QA + bug fixes

### MVP Deliverables
- Working web app at staging URL
- 1 camera per user (Free tier)
- End-to-end: add camera → auto-detect birds → clips with species ID
- Basic analytics + alerts
- Public share links

---

## Phase 2: v1 — Community + Named Birds + NFTs (Weeks 13-32)

### Goals
- Named bird profiles + individual matching
- Community features (ID requests, voting, reputation)
- Gamification (badges, XP, leaderboards)
- Solana wallet linking + NFT minting
- Pro tier + multi-camera support
- Mobile push notifications

### Milestones

#### Weeks 13-16: Named Birds + Individual Matching
- [ ] IndividualBird entity + UI
- [ ] Embedding model for individual recognition
- [ ] Similarity matching with confidence
- [ ] "Create named bird" flow from sighting
- [ ] Named bird profile page (gallery, visits, patterns)
- [ ] "Franky appeared!" alerts
- [ ] User merge/split tools

#### Weeks 17-20: Community Platform
- [ ] ID request creation from uncertain sightings
- [ ] Community feed (regional + friends)
- [ ] ID proposal + voting UI
- [ ] Reputation system (vote weighting)
- [ ] Quorum rules for verification
- [ ] Comment system
- [ ] Moderation queue + reporting

#### Weeks 21-24: Gamification
- [ ] Badge definitions + rule engine
- [ ] XP event logging
- [ ] UserBadge awards (milestones, streaks, species)
- [ ] Leaderboard snapshots (daily compute)
- [ ] Leaderboard UI (friends/region/global)
- [ ] Challenges framework (seasonal events)
- [ ] Anti-cheat: caps, anomaly detection

#### Weeks 25-28: Solana NFT Integration
- [ ] Wallet linking flow (nonce signing)
- [ ] Wallet management UI
- [ ] NFTAsset + NFTMintRequest entities
- [ ] Media upload to Arweave (Bundlr)
- [ ] Metadata JSON builder (Metaplex format)
- [ ] Unsigned tx construction (mint + metadata + collection)
- [ ] Client-side signing flow
- [ ] Tx submission + confirmation indexer
- [ ] "My NFTs" gallery
- [ ] Privacy controls (private/coarse/public)
- [ ] Fee estimation + display
- [ ] Mint caps + abuse detection

#### Weeks 29-32: Pro Tier + Polish
- [ ] Stripe integration for subscriptions
- [ ] Plan tiers (Free/Plus/Pro)
- [ ] Multi-camera support (5 on Plus, 10+ on Pro)
- [ ] Pro API keys + webhooks portal
- [ ] Home Assistant integration docs
- [ ] iNaturalist/eBird export
- [ ] Mobile push (Expo notifications)
- [ ] v1 QA + performance tuning

### v1 Deliverables
- Full community platform with ID requests + reputation
- Named birds with individual recognition
- Gamification (badges, leaderboards, challenges)
- Solana NFT minting (Sighting NFTs)
- Pro tier with API access
- Mobile notifications

---

## Phase 3: v2 — Scale + Enterprise (Months 8-18)

### Goals
- Edge agent for local processing
- Org accounts + SSO
- Public camera directory
- Individual NFTs + user collections
- Platform relayer (subsidized mints)
- Challenge/event platform

### Key Features
- [ ] Edge agent (Go/Rust) — local RTSP + detection + privacy masking
- [ ] Org accounts with roles (owner/admin/editor/viewer)
- [ ] SSO integration (SAML/OIDC)
- [ ] Public camera directory + discovery
- [ ] Nature center admin dashboard
- [ ] Individual NFTs ("Mint Franky")
- [ ] User NFT collections (Pro)
- [ ] Platform relayer option
- [ ] Challenge creation tools
- [ ] Advanced analytics (biodiversity index, trends)
- [ ] ML model versioning + A/B testing

---

## Data Model Summary

```
User ─┬─ Camera ─┬─ Zone
      │          └─ Clip ─── Sighting ─── IndividualBird
      │
      ├─ Wallet ─── NFTAsset ─── NFTMintRequest
      │
      ├─ UserBadge
      │
      └─ Membership ─── Organization
```

Key entities: ~20 tables (see 04_DATA_MODEL.md)

---

## API Endpoints Summary

### Core
- `POST /v1/auth/*` — login, register, OAuth
- `GET/POST /v1/cameras` — list, add
- `POST /v1/cameras/{id}/zones` — create zone/mask
- `GET /v1/clips` — list with filters
- `GET /v1/sightings` — list sightings
- `POST /v1/community/id-requests` — create ID request

### NFT
- `POST /v1/wallets/solana/link/start` — get nonce
- `POST /v1/wallets/solana/link/complete` — verify signature
- `POST /v1/nfts/mint-requests` — create mint request
- `POST /v1/nfts/mint-requests/{id}/submit-signed-tx` — submit signed tx
- `GET /v1/nfts` — list user NFTs

---

## Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (Next.js Web App)                      │
│                  + Cloudflare CDN (HLS/media)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (Fastify)                        │
│              Railway / Render / Fly.io                           │
└─────────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Auth Svc   │ │  Camera Svc  │ │ Community Svc│ │   NFT Svc    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
          │              │              │              │
          └──────────────┴──────────────┴──────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│   PostgreSQL (Neon)  │              │   Redis (Upstash)    │
│   + Drizzle ORM      │              │   cache/queue        │
└──────────────────────┘              └──────────────────────┘

          ┌───────────────────────────────────────┐
          │           Media Pipeline              │
          └───────────────────────────────────────┘
                    │              │
                    ▼              ▼
          ┌──────────────┐ ┌──────────────┐
          │ Ingest Worker│ │ ML Inference │
          │  (FFmpeg)    │ │ (Replicate)  │
          └──────────────┘ └──────────────┘
                    │
                    ▼
          ┌──────────────────────┐
          │   Cloudflare R2      │
          │   (video/images)     │
          └──────────────────────┘

          ┌───────────────────────────────────────┐
          │         Solana Integration            │
          └───────────────────────────────────────┘
                    │              │
                    ▼              ▼
          ┌──────────────┐ ┌──────────────┐
          │   Arweave    │ │  Solana RPC  │
          │  (Bundlr)    │ │  (Helius)    │
          └──────────────┘ └──────────────┘
```

---

## Cost Estimates (Monthly at Scale)

| Component | Free Tier | 1K Users | 10K Users |
|-----------|-----------|----------|-----------|
| Vercel | $0 | $20 | $150 |
| Railway (API) | $5 | $50 | $200 |
| Neon Postgres | $0 | $25 | $100 |
| Upstash Redis | $0 | $10 | $50 |
| Cloudflare R2 | $0 | $15 | $150 |
| Replicate (ML) | $0 | $100 | $500 |
| Helius (Solana) | $0 | $50 | $200 |
| **Total** | **$5** | **~$270** | **~$1,350** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Camera fragmentation | Compatibility list, RTSP validator, edge agent |
| ML accuracy varies | User corrections, community verification, model iteration |
| Community abuse | Reputation system, moderation queue, rate limits |
| NFT fee volatility | Fee estimates before mint, caps, relayer only for Pro |
| Scale costs | Edge-first inference, adaptive sampling, tier limits |

---

## Immediate Next Steps

1. **Set up monorepo** — `pnpm` workspaces with `apps/web`, `apps/api`, `packages/db`, `packages/shared`
2. **Scaffold Next.js app** — Landing + auth + dashboard shell
3. **Design database schema** — Drizzle schema for MVP entities
4. **Build camera onboarding** — RTSP validation + preview
5. **Prototype detection pipeline** — FFmpeg + Replicate bird detection

---

## Questions for Bruce

1. **Hosting preference?** Vercel + Railway, or all-in on one platform?
2. **ML provider?** Start with Replicate/Roboflow, or train custom models?
3. **Solana network?** Devnet for testing, then mainnet-beta?
4. **Design system?** shadcn/ui good, or want custom branding first?
5. **MVP scope trim?** Should gamification wait for v1, or include basic badges in MVP?

---

*Ready to start building. Let me know which phase to kick off first.*
