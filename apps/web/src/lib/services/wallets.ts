import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Wallet } from '@/types';

const walletsRef = collection(db, 'wallets');

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

// Get user's wallets
export async function getUserWallets(userId: string): Promise<Wallet[]> {
  const q = query(walletsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Wallet[];
}

// Get wallet by address
export async function getWalletByAddress(
  userId: string,
  address: string
): Promise<Wallet | null> {
  const q = query(
    walletsRef,
    where('userId', '==', userId),
    where('address', '==', address)
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  } as Wallet;
}

// Link wallet (after signature verification)
export async function linkWallet(
  userId: string,
  address: string,
  label?: string
): Promise<Wallet> {
  // Check if already linked
  const existing = await getWalletByAddress(userId, address);
  if (existing) {
    return existing;
  }

  const docRef = await addDoc(walletsRef, {
    userId,
    chain: 'solana',
    address,
    label: label || null,
    verifiedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as Wallet;
}

// Unlink wallet
export async function unlinkWallet(walletId: string): Promise<void> {
  const docRef = doc(db, 'wallets', walletId);
  await deleteDoc(docRef);
}

// Generate nonce message for signing
export function generateSignMessage(address: string, nonce: string): string {
  return `BirdCam Network Wallet Verification

Address: ${address}
Nonce: ${nonce}
Timestamp: ${new Date().toISOString()}

Sign this message to link your wallet to BirdCam Network. This will not trigger any blockchain transaction or cost any fees.`;
}

// Generate random nonce
export function generateNonce(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
