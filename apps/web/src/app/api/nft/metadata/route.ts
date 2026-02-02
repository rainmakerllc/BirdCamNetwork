/**
 * NFT Metadata Upload API
 * 
 * Stores NFT metadata and returns a URI.
 * In production, this should upload to Arweave or IPFS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase if needed
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

export async function POST(request: NextRequest) {
  try {
    const metadata = await request.json();
    
    // Validate required fields
    if (!metadata.name || !metadata.image) {
      return NextResponse.json(
        { error: 'Missing required metadata fields' },
        { status: 400 }
      );
    }
    
    // Generate unique ID
    const metadataId = uuidv4();
    
    // Store metadata in Firestore
    const metadataRef = doc(db, 'nftMetadata', metadataId);
    await setDoc(metadataRef, {
      ...metadata,
      createdAt: serverTimestamp(),
    });
    
    // Return the metadata URI
    // In production, this would be an Arweave or IPFS URI
    const uri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://birdwatchnetwork.web.app'}/api/nft/metadata/${metadataId}`;
    
    return NextResponse.json({ uri, metadataId });
  } catch (error) {
    console.error('Metadata upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload metadata' },
      { status: 500 }
    );
  }
}
