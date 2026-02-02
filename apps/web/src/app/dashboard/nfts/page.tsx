'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getUserWallets, linkWallet, unlinkWallet, generateNonce, generateSignMessage } from '@/lib/services/wallets';
import { getUserNFTs, subscribeToUserNFTs } from '@/lib/services/nfts';
import { Wallet, NFTAsset, Sighting } from '@/types';
import { 
  getConnection, 
  checkBalance, 
  formatSOL, 
  requestAirdrop,
  SOLANA_NETWORK 
} from '@/lib/solana/mint';

export default function NFTsPage() {
  const { user } = useAuth();
  const { publicKey, connected, signMessage } = useWallet();
  const [tab, setTab] = useState<'gallery' | 'mint' | 'wallets'>('gallery');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [nfts, setNfts] = useState<NFTAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [linkingWallet, setLinkingWallet] = useState(false);

  // Load data on mount
  useEffect(() => {
    if (user) {
      loadWallets();
      // Subscribe to NFT updates
      const unsubscribe = subscribeToUserNFTs(user.uid, setNfts);
      return () => unsubscribe();
    }
  }, [user]);

  // Check balance when wallet connects
  useEffect(() => {
    if (publicKey) {
      checkWalletBalance();
    } else {
      setBalance(null);
    }
  }, [publicKey]);

  const loadWallets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUserWallets(user.uid);
      setWallets(data);
    } catch (err) {
      console.error('Failed to load wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkWalletBalance = async () => {
    if (!publicKey) return;
    try {
      const connection = getConnection();
      const bal = await connection.getBalance(publicKey);
      setBalance(bal);
    } catch (err) {
      console.error('Failed to check balance:', err);
    }
  };

  const handleLinkWallet = async () => {
    if (!user || !publicKey || !signMessage) return;

    setLinkingWallet(true);
    try {
      // Generate nonce and sign message
      const nonce = generateNonce();
      const message = generateSignMessage(publicKey.toBase58(), nonce);
      const encodedMessage = new TextEncoder().encode(message);
      
      // Request signature
      await signMessage(encodedMessage);
      
      // Link wallet in Firestore
      await linkWallet(user.uid, publicKey.toBase58());
      await loadWallets();
    } catch (err: any) {
      if (!err.message?.includes('rejected')) {
        alert('Failed to link wallet');
      }
    } finally {
      setLinkingWallet(false);
    }
  };

  const handleDisconnect = async (walletId: string) => {
    if (!confirm('Disconnect this wallet?')) return;
    try {
      await unlinkWallet(walletId);
      await loadWallets();
    } catch {
      alert('Failed to disconnect');
    }
  };

  const handleAirdrop = async () => {
    if (!publicKey || SOLANA_NETWORK !== 'devnet') return;
    try {
      const connection = getConnection();
      await requestAirdrop(connection, publicKey, 1);
      await checkWalletBalance();
      alert('Airdrop received! +1 SOL');
    } catch (err) {
      alert('Airdrop failed - try again later');
    }
  };

  const isWalletLinked = wallets.some(w => w.address === publicKey?.toBase58());

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NFTs</h1>
          <p className="text-gray-500 dark:text-gray-400">Mint your sightings on Solana</p>
        </div>
        <div className="flex items-center gap-3">
          {balance !== null && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatSOL(balance)} SOL
              {SOLANA_NETWORK === 'devnet' && (
                <button 
                  onClick={handleAirdrop}
                  className="ml-2 text-purple-600 hover:underline text-xs"
                >
                  + Airdrop
                </button>
              )}
            </div>
          )}
          <WalletMultiButton />
        </div>
      </div>

      {/* Network badge */}
      {SOLANA_NETWORK === 'devnet' && (
        <div className="mb-4 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm rounded-lg inline-block">
          ⚠️ Devnet Mode - NFTs are for testing only
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'gallery', label: 'My NFTs', count: nfts.filter(n => n.status === 'confirmed').length },
          { id: 'mint', label: 'Mint New' },
          { id: 'wallets', label: 'Wallets', count: wallets.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id 
                ? 'bg-purple-600 text-white' 
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                tab === t.id ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-600 border-t-transparent mx-auto"></div>
        </div>
      ) : (
        <>
          {/* Gallery Tab */}
          {tab === 'gallery' && (
            nfts.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
                <div className="text-6xl mb-4">🎨</div>
                <h2 className="text-lg font-semibold mb-2 dark:text-white">No NFTs yet</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  Mint your bird sightings as unique collectible NFTs
                </p>
                <button
                  onClick={() => setTab('mint')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Mint Your First NFT
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {nfts.map((nft) => (
                  <div 
                    key={nft.id} 
                    className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-square bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center relative">
                      {nft.mediaUri ? (
                        <img 
                          src={nft.mediaUri} 
                          alt="NFT" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-6xl">🐦</span>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          nft.status === 'confirmed' 
                            ? 'bg-green-500 text-white' 
                            : nft.status === 'pending' 
                            ? 'bg-yellow-500 text-white' 
                            : 'bg-gray-500 text-white'
                        }`}>
                          {nft.status}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {nft.assetType === 'sighting_nft' ? 'Sighting NFT' : 
                         nft.assetType === 'individual_nft' ? 'Individual Bird' : 
                         'Achievement'}
                      </h3>
                      {nft.mintAddress && (
                        <a
                          href={`https://explorer.solana.com/address/${nft.mintAddress}${SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:underline font-mono"
                        >
                          {nft.mintAddress.slice(0, 8)}...
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Mint Tab */}
          {tab === 'mint' && (
            <div className="max-w-2xl mx-auto">
              {!connected ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">🔗</div>
                  <h2 className="text-lg font-semibold mb-2 dark:text-white">Connect Wallet</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                    Connect your Solana wallet to mint NFTs
                  </p>
                  <WalletMultiButton />
                </div>
              ) : !isWalletLinked ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">✍️</div>
                  <h2 className="text-lg font-semibold mb-2 dark:text-white">Verify Wallet</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                    Sign a message to link this wallet to your account
                  </p>
                  <button
                    onClick={handleLinkWallet}
                    disabled={linkingWallet}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {linkingWallet ? 'Signing...' : 'Sign & Link Wallet'}
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4 dark:text-white">Mint Bird Sighting NFT</h2>
                  
                  <div className="space-y-4">
                    {/* Sighting Selection */}
                    <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg text-center">
                      <div className="text-4xl mb-3">📸</div>
                      <p className="text-gray-600 dark:text-gray-300 font-medium">Select a Sighting</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                        Bird sightings from your cameras will appear here
                      </p>
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-3">
                        Add cameras and wait for bird detections to mint NFTs
                      </p>
                    </div>

                    {/* Privacy Level */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Privacy Level
                      </label>
                      <select className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white">
                        <option value="public">Public (location visible)</option>
                        <option value="coarse">Region Only (city/state)</option>
                        <option value="private">Private (no location)</option>
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Choose how much location info to include in the NFT
                      </p>
                    </div>

                    {/* Mint Costs */}
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                      <h3 className="font-medium text-purple-800 dark:text-purple-300 mb-2">Estimated Costs</h3>
                      <div className="text-sm text-purple-700 dark:text-purple-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Mint Fee</span>
                          <span>~0.01 SOL</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transaction Fee</span>
                          <span>~0.00001 SOL</span>
                        </div>
                        <div className="flex justify-between font-medium pt-1 border-t border-purple-200 dark:border-purple-700">
                          <span>Total</span>
                          <span>~0.01 SOL</span>
                        </div>
                      </div>
                    </div>

                    {/* Mint Button */}
                    <button 
                      disabled
                      className="w-full py-3 bg-purple-600 text-white rounded-lg disabled:opacity-50 font-medium"
                    >
                      Select a Sighting to Mint
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wallets Tab */}
          {tab === 'wallets' && (
            <div className="max-w-xl mx-auto space-y-4">
              {!connected && wallets.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">👛</div>
                  <h2 className="text-lg font-semibold mb-2 dark:text-white">No Wallets Linked</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                    Connect a Solana wallet to mint NFTs
                  </p>
                  <WalletMultiButton />
                </div>
              ) : (
                <>
                  {/* Connected wallet (not linked yet) */}
                  {connected && !isWalletLinked && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-200 dark:bg-purple-800 rounded-full flex items-center justify-center text-xl">
                        🔗
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate text-gray-900 dark:text-white">
                          {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
                        </div>
                        <div className="text-xs text-purple-600 dark:text-purple-400">
                          Connected - Not verified yet
                        </div>
                      </div>
                      <button
                        onClick={handleLinkWallet}
                        disabled={linkingWallet}
                        className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg disabled:opacity-50"
                      >
                        {linkingWallet ? '...' : 'Verify'}
                      </button>
                    </div>
                  )}

                  {/* Linked wallets */}
                  {wallets.map((wallet) => (
                    <div 
                      key={wallet.id} 
                      className="bg-white dark:bg-gray-800 rounded-xl p-4 flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-xl">
                        ✓
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate text-gray-900 dark:text-white">
                          {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Solana • Verified
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDisconnect(wallet.id)} 
                        className="text-red-600 dark:text-red-400 text-sm hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* Add wallet button */}
                  {!connected && (
                    <div className="text-center pt-4">
                      <WalletMultiButton />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
