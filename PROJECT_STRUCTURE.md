# BirdCam Network — Project Structure

## Monorepo Layout

```
birdcam-network/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/         # Auth routes (login, register)
│   │   │   ├── (dashboard)/    # Authenticated app
│   │   │   │   ├── cameras/
│   │   │   │   ├── clips/
│   │   │   │   ├── birds/
│   │   │   │   ├── analytics/
│   │   │   │   ├── community/
│   │   │   │   ├── nfts/
│   │   │   │   └── settings/
│   │   │   ├── (marketing)/    # Public pages
│   │   │   └── api/            # Next.js API routes (if needed)
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui components
│   │   │   ├── camera/
│   │   │   ├── clip/
│   │   │   ├── birds/
│   │   │   ├── nft/
│   │   │   └── layout/
│   │   ├── lib/
│   │   │   ├── api.ts          # API client
│   │   │   ├── auth.ts
│   │   │   └── solana.ts       # Wallet adapter setup
│   │   ├── hooks/
│   │   └── styles/
│   │
│   ├── api/                    # Backend API (Fastify/Hono)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── cameras.ts
│   │   │   │   ├── clips.ts
│   │   │   │   ├── sightings.ts
│   │   │   │   ├── community.ts
│   │   │   │   ├── gamification.ts
│   │   │   │   ├── wallets.ts
│   │   │   │   └── nfts.ts
│   │   │   ├── services/
│   │   │   │   ├── camera.service.ts
│   │   │   │   ├── clip.service.ts
│   │   │   │   ├── detection.service.ts
│   │   │   │   ├── species.service.ts
│   │   │   │   ├── individual.service.ts
│   │   │   │   ├── community.service.ts
│   │   │   │   ├── gamification.service.ts
│   │   │   │   └── nft.service.ts
│   │   │   ├── workers/
│   │   │   │   ├── ingest.worker.ts
│   │   │   │   ├── transcode.worker.ts
│   │   │   │   ├── detection.worker.ts
│   │   │   │   ├── species.worker.ts
│   │   │   │   └── nft-indexer.worker.ts
│   │   │   ├── lib/
│   │   │   │   ├── ffmpeg.ts
│   │   │   │   ├── replicate.ts
│   │   │   │   ├── arweave.ts
│   │   │   │   └── solana.ts
│   │   │   └── index.ts
│   │   └── Dockerfile
│   │
│   └── edge-agent/             # Optional local agent (Go/Rust)
│       └── ...
│
├── packages/
│   ├── db/                     # Database schema + migrations
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── cameras.ts
│   │   │   ├── clips.ts
│   │   │   ├── sightings.ts
│   │   │   ├── birds.ts
│   │   │   ├── community.ts
│   │   │   ├── gamification.ts
│   │   │   ├── wallets.ts
│   │   │   └── nfts.ts
│   │   ├── migrations/
│   │   ├── seed/
│   │   └── index.ts
│   │
│   ├── shared/                 # Shared types + utils
│   │   ├── types/
│   │   │   ├── api.ts
│   │   │   ├── camera.ts
│   │   │   ├── clip.ts
│   │   │   ├── sighting.ts
│   │   │   ├── bird.ts
│   │   │   ├── nft.ts
│   │   │   └── events.ts
│   │   ├── utils/
│   │   └── constants/
│   │
│   └── ui/                     # Shared UI components (optional)
│
├── docs/                       # Spec files + API docs
│   ├── spec/                   # Copy of Dropbox spec files
│   └── api/                    # Generated OpenAPI docs
│
├── scripts/
│   ├── seed-species.ts         # Seed bird species data
│   └── migrate.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docker-compose.yml          # Local dev (Postgres, Redis)
├── package.json
├── pnpm-workspace.yaml
├── turbo.json                  # Turborepo config
└── README.md
```

## Key Files to Create First

### 1. Root Config
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "db:push": { "cache": false },
    "db:migrate": { "cache": false }
  }
}
```

### 2. Database Schema (Drizzle example)

```typescript
// packages/db/schema/cameras.ts
import { pgTable, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const cameras = pgTable('cameras', {
  id: text('id').primaryKey().$defaultFn(() => `cam_${crypto.randomUUID()}`),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  rtspUrl: text('rtsp_url_encrypted').notNull(),
  codec: text('codec'),
  resolution: text('resolution'),
  fps: text('fps'),
  status: text('status').default('pending'),
  isPublic: boolean('is_public').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const zones = pgTable('zones', {
  id: text('id').primaryKey().$defaultFn(() => `zone_${crypto.randomUUID()}`),
  cameraId: text('camera_id').references(() => cameras.id).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // detect, privacy, ignore
  polygon: jsonb('polygon').notNull(),
  sensitivity: text('sensitivity'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### 3. API Route Example

```typescript
// apps/api/src/routes/cameras.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@birdcam/db';
import { cameras } from '@birdcam/db/schema';

const app = new Hono();

const createCameraSchema = z.object({
  name: z.string().min(1).max(100),
  rtspUrl: z.string().url(),
});

app.get('/', async (c) => {
  const userId = c.get('userId');
  const userCameras = await db.query.cameras.findMany({
    where: eq(cameras.userId, userId),
  });
  return c.json({ cameras: userCameras });
});

app.post('/', zValidator('json', createCameraSchema), async (c) => {
  const userId = c.get('userId');
  const { name, rtspUrl } = c.req.valid('json');
  
  // Validate RTSP stream
  const streamInfo = await validateRtspStream(rtspUrl);
  
  const [camera] = await db.insert(cameras).values({
    userId,
    name,
    rtspUrl: encrypt(rtspUrl),
    codec: streamInfo.codec,
    resolution: streamInfo.resolution,
    fps: streamInfo.fps,
    status: 'active',
  }).returning();
  
  return c.json({ camera }, 201);
});

export default app;
```

### 4. NFT Mint Service

```typescript
// apps/api/src/services/nft.service.ts
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import Bundlr from '@bundlr-network/client';

export class NFTService {
  private connection: Connection;
  private metaplex: Metaplex;
  private bundlr: Bundlr;

  async createMintRequest(userId: string, sightingId: string, walletAddress: string) {
    const sighting = await this.getSighting(sightingId);
    
    // 1. Upload media to Arweave
    const mediaUri = await this.uploadMedia(sighting.keyframePath);
    
    // 2. Build metadata
    const metadata = this.buildMetadata(sighting, mediaUri);
    const metadataUri = await this.uploadMetadata(metadata);
    
    // 3. Construct unsigned transaction
    const { unsignedTx, estimatedFees } = await this.buildMintTransaction(
      walletAddress,
      metadataUri
    );
    
    // 4. Store mint request
    const mintRequest = await db.insert(nftMintRequests).values({
      userId,
      walletAddress,
      sightingId,
      metadataUri,
      mediaUri,
      unsignedTxB64: unsignedTx.toString('base64'),
      estimatedFees,
      status: 'awaiting_signature',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    }).returning();
    
    return mintRequest;
  }

  private buildMetadata(sighting: Sighting, mediaUri: string) {
    return {
      name: `${sighting.speciesFinal.commonName} Sighting`,
      symbol: 'BIRD',
      description: `A ${sighting.speciesFinal.commonName} captured on BirdCam Network`,
      image: mediaUri,
      external_url: `https://birdcamnetwork.com/sightings/${sighting.id}`,
      attributes: [
        { trait_type: 'Species', value: sighting.speciesFinal.commonName },
        { trait_type: 'Confidence', value: Math.round(sighting.confidence * 100) },
        { trait_type: 'Date', value: this.coarsenDate(sighting.detectedAt) },
        { trait_type: 'Privacy', value: sighting.privacyLevel },
      ],
      properties: {
        category: 'image',
        files: [{ uri: mediaUri, type: 'image/jpeg' }],
      },
    };
  }
}
```

## Environment Variables

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# apps/api/.env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
REPLICATE_API_TOKEN=...
BUNDLR_PRIVATE_KEY=...
SOLANA_RPC_URL=https://api.devnet.solana.com
HELIUS_API_KEY=...
ENCRYPTION_KEY=...
```

## Getting Started Commands

```bash
# Install dependencies
pnpm install

# Start local services
docker-compose up -d

# Push database schema
pnpm db:push

# Seed species data
pnpm seed:species

# Start dev servers
pnpm dev
```
