'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { getUserWallets, linkWallet, unlinkWallet, generateNonce, generateSignMessage } from '@/lib/services/wallets';
import { getUserNFTs } from '@/lib/services/nfts';
import { Wallet, NFTAsset } from '@/types';

export default function NFTsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'gallery' | 'mint' | 'wallets'>('gallery');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [nfts, setNfts] = useState<NFTAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [walletsData, nftsData] = await Promise.all([
        getUserWallets(user.uid),
        getUserNFTs(user.uid),
      ]);
      setWallets(walletsData);
      setNfts(nftsData);
    } catch (err) {
      console.error('Failed to load NFT data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    if (!user) return;
    
    const solana = (window as any).solana || (window as any).phantom?.solana;
    if (!solana) {
      alert('Please install Phantom or Solflare wallet');
      return;
    }

    setConnecting(true);
    try {
      const response = await solana.connect();
      const publicKey = response.publicKey.toString();
      const nonce = generateNonce();
      const message = generateSignMessage(publicKey, nonce);
      await solana.signMessage(new TextEncoder().encode(message), 'utf8');
      await linkWallet(user.uid, publicKey);
      await loadData();
    } catch (err: any) {
      if (err.message !== 'User rejected the request.') {
        alert('Failed to connect wallet');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (walletId: string) => {
    if (!confirm('Disconnect this wallet?')) return;
    try {
      await unlinkWallet(walletId);
      await loadData();
    } catch {
      alert('Failed to disconnect');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NFTs</h1>
          <p className="text-gray-500">Mint your sightings on Solana</p>
        </div>
        {wallets.length > 0 && (
          <div className="text-sm text-gray-500 font-mono">
            {wallets[0].address.slice(0, 6)}...{wallets[0].address.slice(-4)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'gallery', label: 'My NFTs' },
          { id: 'mint', label: 'Mint New' },
          { id: 'wallets', label: 'Wallets' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.id ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mx-auto"></div>
        </div>
      ) : (
        <>
          {tab === 'gallery' && (
            nfts.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="text-5xl mb-4">🎨</div>
                <h2 className="text-lg font-semibold mb-2">No NFTs yet</h2>
                <p className="text-gray-500 text-sm mb-4">Mint your bird sightings as unique NFTs</p>
                <button
                  onClick={() => setTab('mint')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg"
                >
                  Mint Your First NFT
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nfts.map((nft) => (
                  <div key={nft.id} className="bg-white rounded-xl overflow-hidden">
                    <div className="aspect-square bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                      <span className="text-5xl">🐦</span>
                    </div>
                    <div className="p-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        nft.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        nft.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {nft.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'mint' && (
            <div className="max-w-xl mx-auto">
              {wallets.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center">
                  <div className="text-5xl mb-4">🔗</div>
                  <h2 className="text-lg font-semibold mb-2">Connect Wallet First</h2>
                  <p className="text-gray-500 text-sm mb-4">Link your Solana wallet to mint NFTs</p>
                  <button
                    onClick={handleConnectWallet}
                    disabled={connecting}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : 'Connect Phantom'}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Mint Sighting NFT</h2>
                  <div className="bg-gray-50 p-4 rounded-lg text-center mb-4">
                    <p className="text-gray-500 text-sm">Select a sighting to mint as an NFT</p>
                    <p className="text-gray-400 text-xs mt-1">Add cameras and detect birds first!</p>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Privacy</label>
                    <select className="w-full px-3 py-2 border rounded-lg">
                      <option value="public">Public (location visible)</option>
                      <option value="region_only">Region Only</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <button disabled className="w-full py-3 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
                    Select a Sighting
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'wallets' && (
            <div className="max-w-xl mx-auto space-y-4">
              {wallets.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center">
                  <div className="text-5xl mb-4">👛</div>
                  <h2 className="text-lg font-semibold mb-2">No Wallets</h2>
                  <p className="text-gray-500 text-sm mb-4">Connect a Solana wallet to mint NFTs</p>
                  <button
                    onClick={handleConnectWallet}
                    disabled={connecting}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {connecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              ) : (
                <>
                  {wallets.map((wallet) => (
                    <div key={wallet.id} className="bg-white rounded-xl p-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-xl">👛</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate">
                          {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                        </div>
                        <div className="text-xs text-gray-500">Solana • Verified</div>
                      </div>
                      <button onClick={() => handleDisconnect(wallet.id)} className="text-red-600 text-sm">
                        Disconnect
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleConnectWallet}
                    disabled={connecting}
                    className="w-full py-3 border-2 border-dashed rounded-xl text-gray-500 hover:border-purple-300"
                  >
                    + Add Another Wallet
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
