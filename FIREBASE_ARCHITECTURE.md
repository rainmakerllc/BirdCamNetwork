# BirdCam Network — Firebase Architecture

**Project ID:** `birdwatchnetwork`  
**Service Account:** Stored in `config/firebase-service-account.json` (gitignored)

---

## Firebase Services Used

| Service | Purpose |
|---------|---------|
| **Firebase Hosting** | Next.js SSR + static assets |
| **Cloud Functions** | API endpoints, workers, webhooks |
| **Firestore** | Primary database (NoSQL) |
| **Firebase Auth** | User authentication |
| **Cloud Storage** | Video clips, images, media |
| **Cloud Tasks** | Job queues (ingest, ML, NFT) |
| **Firebase Extensions** | Resize images, etc. |

---

## Revised Tech Stack

### Frontend
| Layer | Tech |
|-------|------|
| Framework | **Next.js 14+** (App Router) |
| Hosting | **Firebase Hosting** with Cloud Functions SSR |
| Auth | **Firebase Auth** (email, Google, Apple) |
| DB Client | **Firebase SDK** (Firestore) |
| Storage | **Firebase Cloud Storage** |
| Wallet | **@solana/wallet-adapter** |

### Backend
| Layer | Tech |
|-------|------|
| API | **Cloud Functions** (Node.js 20) |
| Database | **Firestore** (NoSQL, realtime) |
| Queues | **Cloud Tasks** + Pub/Sub |
| Storage | **Cloud Storage** (videos/images) |
| CDN | **Firebase Hosting CDN** |

### AI/ML Pipeline
| Layer | Tech |
|-------|------|
| Video Ingest | **Cloud Functions** + FFmpeg (via Cloud Run) |
| ML Inference | **Replicate** / **Vertex AI** |
| Transcoding | **Cloud Run** job |

### Solana NFTs
| Layer | Tech |
|-------|------|
| Standard | **Metaplex Token Metadata** |
| Storage | **Arweave** (Bundlr) |
| RPC | **Helius** |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Firebase Hosting (Next.js SSR)                      │
│                    + CDN (global edge)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Functions                              │
│        (API routes, webhooks, background workers)                │
└─────────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Firestore   │ │Cloud Storage │ │ Cloud Tasks  │ │  Pub/Sub     │
│  (database)  │ │   (media)    │ │  (queues)    │ │  (events)    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Run (heavy jobs)                       │
│           FFmpeg transcoding, ML batch, RTSP ingest              │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│      Replicate       │              │       Arweave        │
│   (ML inference)     │              │    (NFT storage)     │
└──────────────────────┘              └──────────────────────┘
                                                │
                                                ▼
                                      ┌──────────────────────┐
                                      │    Solana (Helius)   │
                                      │     NFT minting      │
                                      └──────────────────────┘
```

---

## Firestore Data Model

```
/users/{userId}
  - email, displayName, avatarUrl, planTier, createdAt
  
/users/{userId}/wallets/{walletId}
  - chain, address, verifiedAt, label

/cameras/{cameraId}
  - userId, name, rtspUrl (encrypted), status, isPublic, createdAt
  
/cameras/{cameraId}/zones/{zoneId}
  - name, type, polygon, sensitivity

/clips/{clipId}
  - cameraId, userId, startedAt, endedAt, storagePath, hlsManifest
  - shareVisibility, shareSlug

/sightings/{sightingId}
  - clipId, cameraId, userId, detectedAt, keyframePath
  - speciesModelTopN, speciesFinalId, speciesFinalSource, confidence
  - individualId, individualMatchConfidence

/species/{speciesCode}
  - commonName, scientificName, regionCodes

/individuals/{individualId}
  - userId, cameraGroupId, speciesId, displayName, avatarClipId
  - firstSeenAt, lastSeenAt, notes

/idRequests/{requestId}
  - sightingId, requesterId, status, proposedSpecies

/idRequests/{requestId}/votes/{voteId}
  - voterId, proposedSpeciesId, weight

/nftAssets/{nftId}
  - userId, walletId, assetType, status, mintAddress
  - metadataUri, mediaUri, privacyLevel, sourceSightingId

/badges/{badgeId}
  - name, description, iconKey, rules

/users/{userId}/earnedBadges/{badgeId}
  - earnedAt, context

/leaderboards/{scope}_{category}_{window}
  - computedAt, rows[]
```

---

## Project Structure (Firebase)

```
birdcam-network/
├── apps/
│   └── web/                      # Next.js app
│       ├── app/
│       ├── components/
│       ├── lib/
│       │   ├── firebase.ts       # Firebase client init
│       │   ├── auth.ts
│       │   └── solana.ts
│       ├── next.config.js
│       └── package.json
│
├── functions/                    # Cloud Functions
│   ├── src/
│   │   ├── api/                  # HTTP functions (API)
│   │   │   ├── cameras.ts
│   │   │   ├── clips.ts
│   │   │   ├── sightings.ts
│   │   │   ├── community.ts
│   │   │   ├── wallets.ts
│   │   │   └── nfts.ts
│   │   ├── triggers/             # Firestore/Auth triggers
│   │   │   ├── onUserCreate.ts
│   │   │   ├── onSightingCreate.ts
│   │   │   └── onClipCreate.ts
│   │   ├── tasks/                # Cloud Tasks handlers
│   │   │   ├── processClip.ts
│   │   │   ├── runDetection.ts
│   │   │   └── mintNft.ts
│   │   ├── lib/
│   │   │   ├── firestore.ts
│   │   │   ├── storage.ts
│   │   │   ├── replicate.ts
│   │   │   ├── arweave.ts
│   │   │   └── solana.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                       # Shared types
│   ├── types/
│   └── constants/
│
├── firebase.json                 # Firebase config
├── firestore.rules               # Security rules
├── firestore.indexes.json        # Composite indexes
├── storage.rules                 # Storage security rules
├── .firebaserc                   # Project aliases
└── package.json
```

---

## Firebase Configuration

### firebase.json
```json
{
  "hosting": {
    "source": "apps/web",
    "frameworksBackend": {
      "region": "us-central1"
    }
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20",
    "codebase": "default"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

### .firebaserc
```json
{
  "projects": {
    "default": "birdwatchnetwork"
  }
}
```

---

## Firestore Security Rules (starter)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /wallets/{walletId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /earnedBadges/{badgeId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if false; // Server only
      }
    }
    
    // Cameras: owner can CRUD, public cams readable by all
    match /cameras/{cameraId} {
      allow read: if resource.data.isPublic == true || 
                    (request.auth != null && resource.data.userId == request.auth.uid);
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Clips: similar to cameras
    match /clips/{clipId} {
      allow read: if resource.data.shareVisibility == 'public' ||
                    (request.auth != null && resource.data.userId == request.auth.uid);
      allow write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Sightings: readable if clip is accessible
    match /sightings/{sightingId} {
      allow read: if request.auth != null;
      allow write: if false; // Server only
    }
    
    // Species: public read
    match /species/{speciesCode} {
      allow read: if true;
      allow write: if false; // Admin only
    }
    
    // NFTs: owner read, server write
    match /nftAssets/{nftId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow write: if false; // Server only
    }
    
    // Leaderboards: public read
    match /leaderboards/{boardId} {
      allow read: if true;
      allow write: if false; // Server only
    }
  }
}
```

---

## Deployment Commands

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Init (already configured)
firebase use birdwatchnetwork

# Deploy everything
firebase deploy

# Deploy specific
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage:rules

# Local development
firebase emulators:start

# View logs
firebase functions:log
```

---

## Environment Setup

### Local .env (apps/web/.env.local)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=birdwatchnetwork.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=birdwatchnetwork
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=birdwatchnetwork.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Functions .env (functions/.env)
```env
REPLICATE_API_TOKEN=...
BUNDLR_PRIVATE_KEY=...
HELIUS_API_KEY=...
ENCRYPTION_KEY=...
```

---

## Cost Estimates (Firebase)

| Service | Free Tier | Blaze (Pay-as-you-go) |
|---------|-----------|----------------------|
| Hosting | 10 GB/mo | $0.15/GB |
| Functions | 2M invocations | $0.40/million |
| Firestore | 1 GB storage, 50K reads/day | $0.18/100K reads |
| Storage | 5 GB | $0.026/GB |
| **Estimated 1K users** | — | **~$50-100/mo** |
| **Estimated 10K users** | — | **~$300-500/mo** |

---

## Next Steps

1. **Enable Firebase services** in console
2. **Get web app config** from Firebase console → Project settings
3. **Scaffold Next.js app** with Firebase SDK
4. **Set up Cloud Functions** for API
5. **Configure Firestore indexes**
6. **Deploy to staging**

Ready to scaffold the project?
