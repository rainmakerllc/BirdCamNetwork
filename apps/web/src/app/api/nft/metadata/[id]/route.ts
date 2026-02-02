/**
 * NFT Metadata Fetch API
 * 
 * Returns stored NFT metadata by ID.
 * Used by Solana wallets and marketplaces to display NFT info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const metadataRef = doc(db, 'nftMetadata', id);
    const metadataSnap = await getDoc(metadataRef);
    
    if (!metadataSnap.exists()) {
      return NextResponse.json(
        { error: 'Metadata not found' },
        { status: 404 }
      );
    }
    
    const data = metadataSnap.data();
    
    // Remove internal fields
    const { createdAt, ...metadata } = data;
    
    // Return as standard NFT metadata JSON
    return NextResponse.json(metadata, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year (metadata is immutable)
      },
    });
  } catch (error) {
    console.error('Metadata fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metadata' },
      { status: 500 }
    );
  }
}
