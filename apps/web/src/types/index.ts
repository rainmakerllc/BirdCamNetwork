// User
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  bio?: string;
  location?: string;
  website?: string;
  planTier: 'free' | 'plus' | 'pro';
  xp?: number;
  level?: number;
  badges?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Camera
export interface Camera {
  id: string;
  userId: string;
  name: string;
  rtspUrl: string;
  status: 'pending' | 'active' | 'offline' | 'error';
  codec?: string;
  resolution?: string;
  fps?: number;
  isPublic: boolean;
  locationLabel?: string;
  description?: string;
  youtubeId?: string;
  streamType?: 'rtsp' | 'youtube' | 'hls';
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Zone {
  id: string;
  cameraId: string;
  name: string;
  type: 'detect' | 'privacy' | 'ignore';
  polygon: { x: number; y: number }[];
  sensitivity?: number;
  createdAt: Date;
}

// Clips & Sightings
export interface Clip {
  id: string;
  cameraId: string;
  userId: string;
  zoneId?: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  storagePath: string;
  hlsManifest?: string;
  thumbnailPath?: string;
  isFavorite: boolean;
  shareVisibility: 'private' | 'link' | 'public' | 'org';
  shareSlug?: string;
  createdAt: Date;
}

export interface Sighting {
  id: string;
  clipId: string;
  cameraId: string;
  userId: string;
  detectedAt: Date;
  durationMs: number;
  keyframePath: string;
  speciesModelTopN: { speciesId: string; confidence: number }[];
  speciesFinalId?: string;
  speciesFinalSource?: 'model' | 'user' | 'community';
  speciesFinalConfidence?: number;
  individualId?: string;
  individualMatchConfidence?: number;
  isRare: boolean;
  createdAt: Date;
}

// Birds
export interface BirdSpecies {
  id: string; // e.g., "norcar" (Northern Cardinal)
  commonName: string;
  scientificName: string;
  regionCodes: string[];
  imageUrl?: string;
}

export interface IndividualBird {
  id: string;
  userId: string;
  cameraGroupId?: string;
  speciesId: string;
  displayName: string; // "Franky"
  avatarPath?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  visitCount: number;
  notes?: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// NFT
export interface Wallet {
  id: string;
  userId: string;
  chain: 'solana';
  address: string;
  label?: string;
  verifiedAt: Date;
  createdAt: Date;
}

export interface NFTAsset {
  id: string;
  userId: string;
  walletId?: string;
  chain: 'solana';
  assetType: 'sighting_nft' | 'individual_nft' | 'achievement_nft';
  status: 'draft' | 'pending' | 'confirmed' | 'failed';
  mintAddress?: string;
  txSignature?: string;
  metadataUri?: string;
  mediaUri?: string;
  privacyLevel: 'private' | 'coarse' | 'public';
  sourceSightingId?: string;
  sourceIndividualId?: string;
  createdAt: Date;
  updatedAt: Date;
}
