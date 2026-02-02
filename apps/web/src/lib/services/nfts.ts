import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NFTAsset } from '@/types';

const nftAssetsRef = collection(db, 'nftAssets');

function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Create NFT mint request (draft)
export async function createNFTDraft(
  userId: string,
  data: {
    walletId?: string;
    assetType: NFTAsset['assetType'];
    privacyLevel: NFTAsset['privacyLevel'];
    sourceSightingId?: string;
    sourceIndividualId?: string;
  }
): Promise<NFTAsset> {
  const docRef = await addDoc(nftAssetsRef, {
    userId,
    chain: 'solana',
    status: 'draft',
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as NFTAsset;
}

// Get user's NFTs
export async function getUserNFTs(userId: string): Promise<NFTAsset[]> {
  const q = query(
    nftAssetsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as NFTAsset[];
}

// Get confirmed NFTs only
export async function getUserConfirmedNFTs(userId: string): Promise<NFTAsset[]> {
  const q = query(
    nftAssetsRef,
    where('userId', '==', userId),
    where('status', '==', 'confirmed'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as NFTAsset[];
}

// Subscribe to user's NFTs (realtime)
export function subscribeToUserNFTs(
  userId: string,
  callback: (nfts: NFTAsset[]) => void
): () => void {
  const q = query(
    nftAssetsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const nfts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data() as Record<string, unknown>),
    })) as NFTAsset[];
    callback(nfts);
  });
}

// Get single NFT
export async function getNFT(nftId: string): Promise<NFTAsset | null> {
  const docRef = doc(db, 'nftAssets', nftId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...convertTimestamps(docSnap.data() as Record<string, unknown>),
    } as NFTAsset;
  }
  return null;
}

// Update NFT status (usually called by backend after minting)
export async function updateNFTStatus(
  nftId: string,
  status: NFTAsset['status'],
  data?: {
    mintAddress?: string;
    txSignature?: string;
    metadataUri?: string;
    mediaUri?: string;
  }
): Promise<void> {
  const docRef = doc(db, 'nftAssets', nftId);
  await updateDoc(docRef, {
    status,
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// Get NFT counts by status
export async function getUserNFTCounts(
  userId: string
): Promise<{ total: number; confirmed: number; pending: number }> {
  const q = query(nftAssetsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  
  let total = 0;
  let confirmed = 0;
  let pending = 0;
  
  snapshot.docs.forEach((doc) => {
    total++;
    const status = doc.data().status;
    if (status === 'confirmed') confirmed++;
    if (status === 'pending') pending++;
  });
  
  return { total, confirmed, pending };
}
