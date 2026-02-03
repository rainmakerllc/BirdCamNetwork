'use client';

import { EmptyState } from '@/components/ui';

export default function NFTsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">NFT Gallery</h1>
        <p className="text-gray-500">Mint your rare bird sightings as collectibles</p>
      </div>

      <EmptyState
        icon="🎨"
        title="Coming Soon"
        description="NFT minting will be available once we integrate with Solana. For now, focus on capturing those birds!"
      />
    </div>
  );
}
