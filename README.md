# BirdCam Network

🚀 **Live at: https://birdwatchnetwork.web.app**

**Your Window to Nature** — Connect your feeder cam, identify species with AI, name your regular visitors, and mint sightings as NFTs on Solana.

![Landing Page](docs/landing.png)

## Features

- 📹 **Easy Camera Setup** — Connect any RTSP/ONVIF camera
- 🤖 **AI Species Detection** — Automatic bird identification
- ⭐ **Name Your Birds** — Track individual visitors like "Franky the Cardinal"
- 📊 **Analytics** — Track patterns, peak hours, species diversity
- 🌍 **Community** — Get help IDing birds, compare with neighbors
- 🎨 **NFT Minting** — Turn rare sightings into Solana collectibles

## Tech Stack

- **Frontend**: Next.js 16 + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Auth**: Google Sign-In
- **NFTs**: Solana + Metaplex

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project
- Google Cloud credentials

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/BirdCamNetwork.git
cd BirdCamNetwork

# Install dependencies
cd apps/web
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your Firebase config

# Run development server
npm run dev
```

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication (Google provider)
3. Create Firestore database
4. Create Storage bucket
5. Download service account JSON to `config/firebase-service-account.json`
6. Add web app config to `.env.local`

### Seed Species Data

```bash
cd BirdCamNetwork
npx tsx scripts/seed-species.ts
```

## Project Structure

```
BirdCamNetwork/
├── apps/
│   └── web/                 # Next.js frontend
│       ├── src/
│       │   ├── app/         # App router pages
│       │   ├── components/  # UI components
│       │   ├── contexts/    # React contexts
│       │   ├── hooks/       # Custom hooks
│       │   ├── lib/         # Firebase + services
│       │   └── types/       # TypeScript types
│       └── public/          # Static assets
├── config/                  # Firebase service account
├── scripts/                 # Utility scripts
└── docs/                    # Documentation
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard` | Main dashboard |
| `/dashboard/cameras` | Camera management |
| `/dashboard/clips` | Video clips |
| `/dashboard/birds` | Named birds + species |
| `/dashboard/analytics` | Stats and trends |
| `/dashboard/community` | Leaderboard + ID help |
| `/dashboard/nfts` | NFT gallery + minting |
| `/dashboard/settings` | Profile + preferences |
| `/explore` | Public live bird cams |

## Species Database

Includes 54+ North American backyard birds:
- Cardinals, Jays, Finches
- Chickadees, Nuthatches
- Woodpeckers, Sparrows
- Hummingbirds, Orioles
- And many more!

## Environment Variables

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Deployment

### Firebase Hosting

```bash
# Login to Firebase
firebase login

# Deploy
firebase deploy
```

### Vercel

Connect your repo to Vercel and it will auto-deploy.

## Contributing

PRs welcome! Please read our contributing guidelines.

## License

MIT

---

Built with 💚 for bird lovers
