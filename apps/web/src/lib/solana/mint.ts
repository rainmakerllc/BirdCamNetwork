/**
 * Solana NFT Minting for BirdCam Network
 * 
 * Uses Metaplex for standard Solana NFT creation.
 * Sighting clips become collectible NFTs.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Network configuration
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
export const SOLANA_RPC_URL = 
  SOLANA_NETWORK === 'mainnet-beta' 
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com'
    : process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || 'https://api.devnet.solana.com';

// BirdCam collection authority (update with your keypair in production)
export const COLLECTION_AUTHORITY = process.env.NEXT_PUBLIC_BIRDCAM_COLLECTION_PUBKEY || '';
export const COLLECTION_MINT = process.env.NEXT_PUBLIC_BIRDCAM_COLLECTION_MINT || '';

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animation_url?: string;
  external_url?: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties: {
    category: 'video' | 'image';
    files: Array<{
      uri: string;
      type: string;
    }>;
    creators?: Array<{
      address: string;
      share: number;
    }>;
  };
}

export interface MintResult {
  success: boolean;
  mintAddress?: string;
  txSignature?: string;
  metadataAddress?: string;
  error?: string;
}

/**
 * Get Solana connection
 */
export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Generate metadata for a bird sighting NFT
 */
export function generateSightingMetadata(params: {
  species: string;
  scientificName?: string;
  confidence: number;
  cameraName: string;
  location?: string;
  timestamp: Date;
  clipUrl: string;
  thumbnailUrl: string;
  sightingId: string;
}): NFTMetadata {
  const date = params.timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const time = params.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    name: `${params.species} Sighting`,
    symbol: 'BIRDCAM',
    description: `A ${params.species} was spotted${params.location ? ` at ${params.location}` : ''} on ${date} at ${time}. Captured by ${params.cameraName} on the BirdCam Network.`,
    image: params.thumbnailUrl,
    animation_url: params.clipUrl,
    external_url: `https://birdwatchnetwork.web.app/sightings/${params.sightingId}`,
    attributes: [
      { trait_type: 'Species', value: params.species },
      ...(params.scientificName ? [{ trait_type: 'Scientific Name', value: params.scientificName }] : []),
      { trait_type: 'Confidence', value: `${(params.confidence * 100).toFixed(1)}%` },
      { trait_type: 'Camera', value: params.cameraName },
      ...(params.location ? [{ trait_type: 'Location', value: params.location }] : []),
      { trait_type: 'Date', value: date },
      { trait_type: 'Time', value: time },
      { trait_type: 'Rarity', value: params.confidence > 0.95 ? 'Ultra Rare' : params.confidence > 0.85 ? 'Rare' : 'Common' },
    ],
    properties: {
      category: 'video',
      files: [
        { uri: params.thumbnailUrl, type: 'image/jpeg' },
        { uri: params.clipUrl, type: 'video/mp4' },
      ],
      creators: COLLECTION_AUTHORITY ? [
        { address: COLLECTION_AUTHORITY, share: 100 },
      ] : undefined,
    },
  };
}

/**
 * Generate metadata for an individual bird NFT
 */
export function generateIndividualMetadata(params: {
  name: string;
  species: string;
  scientificName?: string;
  firstSeen: Date;
  visitCount: number;
  imageUrl: string;
  individualId: string;
}): NFTMetadata {
  const firstSeenDate = params.firstSeen.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    name: `${params.name} the ${params.species}`,
    symbol: 'BIRDCAM',
    description: `Meet ${params.name}, a ${params.species} who has visited ${params.visitCount} times since being first spotted on ${firstSeenDate}. This NFT represents your unique bond with this individual bird.`,
    image: params.imageUrl,
    external_url: `https://birdwatchnetwork.web.app/birds/${params.individualId}`,
    attributes: [
      { trait_type: 'Name', value: params.name },
      { trait_type: 'Species', value: params.species },
      ...(params.scientificName ? [{ trait_type: 'Scientific Name', value: params.scientificName }] : []),
      { trait_type: 'First Seen', value: firstSeenDate },
      { trait_type: 'Visit Count', value: params.visitCount },
      { trait_type: 'Bond Level', value: params.visitCount > 50 ? 'Best Friend' : params.visitCount > 20 ? 'Regular' : 'New Friend' },
    ],
    properties: {
      category: 'image',
      files: [
        { uri: params.imageUrl, type: 'image/jpeg' },
      ],
    },
  };
}

/**
 * Upload metadata to Arweave/IPFS (via Metaplex Bundlr or similar)
 * For MVP, we'll use a simple JSON hosting approach
 */
export async function uploadMetadata(metadata: NFTMetadata): Promise<string> {
  // In production, use Arweave via Bundlr or IPFS via NFT.Storage
  // For MVP, we'll store in Firebase and return the URL
  
  const response = await fetch('/api/nft/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  
  if (!response.ok) {
    throw new Error('Failed to upload metadata');
  }
  
  const { uri } = await response.json();
  return uri;
}

/**
 * Create mint transaction for user to sign
 * Returns unsigned transaction for wallet to sign
 */
export async function createMintTransaction(
  connection: Connection,
  payer: PublicKey,
  metadataUri: string,
  metadata: NFTMetadata
): Promise<{ transaction: Transaction; mintKeypair: PublicKey }> {
  // For a proper implementation, we'd create the mint account
  // and metadata account in a single transaction
  
  // This is a simplified version - in production use Metaplex SDK's
  // createNft or similar helper
  
  const transaction = new Transaction();
  
  // The actual mint creation would go here
  // For now, we'll create a placeholder that the API will process
  
  // Add a memo instruction with the metadata URI for tracking
  // The actual minting will be done server-side with proper keypair management
  
  return {
    transaction,
    mintKeypair: payer, // Placeholder
  };
}

/**
 * Estimate minting cost
 */
export async function estimateMintCost(connection: Connection): Promise<{
  rentExemption: number;
  transactionFee: number;
  totalLamports: number;
  totalSOL: number;
}> {
  // Approximate costs for NFT minting
  // - Mint account: ~0.00203928 SOL (rent exemption)
  // - Token account: ~0.00203928 SOL
  // - Metadata account: ~0.01 SOL
  // - Master edition: ~0.00561672 SOL
  // - Transaction fees: ~0.00001 SOL
  
  const rentExemption = await connection.getMinimumBalanceForRentExemption(82 + 679 + 241);
  const transactionFee = 5000; // ~0.000005 SOL
  const totalLamports = rentExemption + transactionFee;
  
  return {
    rentExemption,
    transactionFee,
    totalLamports,
    totalSOL: totalLamports / LAMPORTS_PER_SOL,
  };
}

/**
 * Check if wallet has sufficient balance for minting
 */
export async function checkBalance(
  connection: Connection,
  wallet: PublicKey
): Promise<{ balance: number; sufficient: boolean; required: number }> {
  const balance = await connection.getBalance(wallet);
  const { totalLamports } = await estimateMintCost(connection);
  
  return {
    balance,
    sufficient: balance >= totalLamports,
    required: totalLamports,
  };
}

/**
 * Get SOL airdrop for testing (devnet only)
 */
export async function requestAirdrop(
  connection: Connection,
  wallet: PublicKey,
  amount: number = 1
): Promise<string> {
  if (SOLANA_NETWORK !== 'devnet') {
    throw new Error('Airdrop only available on devnet');
  }
  
  const signature = await connection.requestAirdrop(
    wallet,
    amount * LAMPORTS_PER_SOL
  );
  
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

/**
 * Format SOL amount for display
 */
export function formatSOL(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
