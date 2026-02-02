'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
  getConnection, 
  generateSightingMetadata, 
  uploadMetadata,
  checkBalance,
  estimateMintCost,
  formatSOL,
  requestAirdrop,
  SOLANA_NETWORK,
} from '@/lib/solana/mint';
import { createNFTDraft, updateNFTStatus } from '@/lib/services/nfts';
import { Sighting, Camera, BirdSpecies } from '@/types';

interface MintButtonProps {
  sighting: Sighting;
  camera: Camera;
  species: BirdSpecies;
  userId: string;
  clipUrl: string;
  thumbnailUrl: string;
  onSuccess?: (mintAddress: string) => void;
  onError?: (error: string) => void;
}

type MintStatus = 'idle' | 'checking' | 'uploading' | 'minting' | 'success' | 'error';

export function MintButton({
  sighting,
  camera,
  species,
  userId,
  clipUrl,
  thumbnailUrl,
  onSuccess,
  onError,
}: MintButtonProps) {
  const { publicKey, connected } = useWallet();
  const [status, setStatus] = useState<MintStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

  const handleMint = async () => {
    if (!publicKey || !connected) {
      setError('Please connect your wallet first');
      return;
    }

    setStatus('checking');
    setError(null);

    try {
      const connection = getConnection();

      // Check balance
      const { sufficient, balance, required } = await checkBalance(connection, publicKey);
      setEstimatedCost(required);

      if (!sufficient) {
        if (SOLANA_NETWORK === 'devnet') {
          // Offer airdrop on devnet
          const shouldAirdrop = confirm(
            `Insufficient balance. You have ${formatSOL(balance)} SOL but need ~${formatSOL(required)} SOL.\n\nRequest a devnet airdrop?`
          );
          if (shouldAirdrop) {
            await requestAirdrop(connection, publicKey, 1);
            // Re-check balance
            const newBalance = await connection.getBalance(publicKey);
            if (newBalance < required) {
              throw new Error('Airdrop received but still insufficient balance');
            }
          } else {
            throw new Error('Insufficient balance for minting');
          }
        } else {
          throw new Error(
            `Insufficient balance. You have ${formatSOL(balance)} SOL but need ~${formatSOL(required)} SOL.`
          );
        }
      }

      // Create NFT draft in Firestore
      setStatus('uploading');
      const nftDraft = await createNFTDraft(userId, {
        assetType: 'sighting_nft',
        privacyLevel: 'public',
        sourceSightingId: sighting.id,
      });

      // Generate and upload metadata
      const metadata = generateSightingMetadata({
        species: species.commonName,
        scientificName: species.scientificName,
        confidence: sighting.speciesFinalConfidence || 0.8,
        cameraName: camera.name,
        location: camera.locationLabel,
        timestamp: sighting.detectedAt,
        clipUrl,
        thumbnailUrl,
        sightingId: sighting.id,
      });

      const metadataUri = await uploadMetadata(metadata);

      // Update draft with metadata URI
      await updateNFTStatus(nftDraft.id, 'pending', { metadataUri });

      // Call mint API
      setStatus('minting');
      const response = await fetch('/api/nft/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nftId: nftDraft.id,
          metadataUri,
          recipientAddress: publicKey.toBase58(),
          name: `${species.commonName} Sighting`,
          symbol: 'BIRDCAM',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Minting failed');
      }

      const result = await response.json();

      setMintAddress(result.mintAddress);
      setTxSignature(result.txSignature);
      setStatus('success');
      onSuccess?.(result.mintAddress);

    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setStatus('error');
      onError?.(message);
    }
  };

  // Not connected - show wallet button
  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-2">
        <WalletMultiButton />
        <p className="text-sm text-gray-500">Connect wallet to mint</p>
      </div>
    );
  }

  // Success state
  if (status === 'success' && mintAddress) {
    const explorerUrl = SOLANA_NETWORK === 'mainnet-beta'
      ? `https://explorer.solana.com/address/${mintAddress}`
      : `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`;

    return (
      <div className="flex flex-col items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <div className="text-green-600 dark:text-green-400">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-medium text-green-800 dark:text-green-200">NFT Minted Successfully!</p>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          View on Solana Explorer →
        </a>
      </div>
    );
  }

  // Loading/minting states
  const isLoading = ['checking', 'uploading', 'minting'].includes(status);
  const statusMessages: Record<MintStatus, string> = {
    idle: 'Mint as NFT',
    checking: 'Checking balance...',
    uploading: 'Uploading metadata...',
    minting: 'Minting NFT...',
    success: 'Success!',
    error: 'Try Again',
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleMint}
        disabled={isLoading}
        className={`
          px-6 py-3 rounded-lg font-medium text-white
          transition-all duration-200
          ${isLoading 
            ? 'bg-purple-400 cursor-wait' 
            : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
          }
          disabled:opacity-70
        `}
      >
        {isLoading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {statusMessages[status]}
      </button>

      {estimatedCost && status === 'idle' && (
        <p className="text-xs text-gray-500">
          Est. cost: ~{formatSOL(estimatedCost)} SOL
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-xs">
          {error}
        </p>
      )}

      {SOLANA_NETWORK === 'devnet' && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠️ Devnet - NFTs are for testing only
        </p>
      )}
    </div>
  );
}
