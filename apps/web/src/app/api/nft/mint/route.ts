/**
 * NFT Minting API
 * 
 * Creates a Solana NFT using Metaplex.
 * Called after user signs the transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
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
} from '@solana/spl-token';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import bs58 from 'bs58';

// Initialize Firebase
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

// Solana configuration
const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const SOLANA_RPC_URL = 
  SOLANA_NETWORK === 'mainnet-beta' 
    ? process.env.SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com'
    : process.env.SOLANA_RPC_DEVNET || 'https://api.devnet.solana.com';

// Get mint authority keypair from environment
function getMintAuthority(): Keypair {
  const secretKey = process.env.BIRDCAM_MINT_AUTHORITY_SECRET;
  if (!secretKey) {
    throw new Error('BIRDCAM_MINT_AUTHORITY_SECRET not configured');
  }
  return Keypair.fromSecretKey(bs58.decode(secretKey));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      nftId, 
      metadataUri, 
      recipientAddress,
      name,
      symbol = 'BIRDCAM',
    } = body;
    
    // Validate required fields
    if (!nftId || !metadataUri || !recipientAddress || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: nftId, metadataUri, recipientAddress, name' },
        { status: 400 }
      );
    }
    
    // Validate recipient address
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(recipientAddress);
    } catch {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      );
    }
    
    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const mintAuthority = getMintAuthority();
    
    console.log(`[Mint] Creating NFT for ${recipientAddress}`);
    console.log(`[Mint] Metadata URI: ${metadataUri}`);
    
    // Create the mint account
    const mint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,  // mint authority
      null,                      // freeze authority (null = no freeze)
      0                          // 0 decimals for NFT
    );
    
    console.log(`[Mint] Created mint: ${mint.toBase58()}`);
    
    // Get or create associated token account for recipient
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      recipient
    );
    
    console.log(`[Mint] Token account: ${tokenAccount.address.toBase58()}`);
    
    // Mint 1 token to recipient
    await mintTo(
      connection,
      mintAuthority,
      mint,
      tokenAccount.address,
      mintAuthority,
      1
    );
    
    console.log(`[Mint] Minted 1 token to recipient`);
    
    // Create metadata account
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    
    const createMetadataIx = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataAccount,
        mint: mint,
        mintAuthority: mintAuthority.publicKey,
        payer: mintAuthority.publicKey,
        updateAuthority: mintAuthority.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: name.slice(0, 32),
            symbol: symbol.slice(0, 10),
            uri: metadataUri,
            sellerFeeBasisPoints: 250, // 2.5% royalty
            creators: [
              {
                address: mintAuthority.publicKey,
                verified: true,
                share: 100,
              },
            ],
            collection: null,
            uses: null,
          },
          isMutable: false,
          collectionDetails: null,
        },
      }
    );
    
    // Create master edition (makes it a true 1/1 NFT)
    const [masterEdition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    
    const createMasterEditionIx = createCreateMasterEditionV3Instruction(
      {
        edition: masterEdition,
        mint: mint,
        updateAuthority: mintAuthority.publicKey,
        mintAuthority: mintAuthority.publicKey,
        payer: mintAuthority.publicKey,
        metadata: metadataAccount,
      },
      {
        createMasterEditionArgs: {
          maxSupply: 0, // 0 = unique 1/1
        },
      }
    );
    
    // Send metadata transaction
    const tx = new Transaction().add(createMetadataIx, createMasterEditionIx);
    const txSignature = await sendAndConfirmTransaction(
      connection,
      tx,
      [mintAuthority],
      { commitment: 'confirmed' }
    );
    
    console.log(`[Mint] Transaction confirmed: ${txSignature}`);
    
    // Update NFT record in Firestore
    const nftRef = doc(db, 'nftAssets', nftId);
    await updateDoc(nftRef, {
      status: 'confirmed',
      mintAddress: mint.toBase58(),
      metadataAddress: metadataAccount.toBase58(),
      txSignature,
      metadataUri,
      updatedAt: serverTimestamp(),
    });
    
    return NextResponse.json({
      success: true,
      mintAddress: mint.toBase58(),
      metadataAddress: metadataAccount.toBase58(),
      txSignature,
      explorerUrl: SOLANA_NETWORK === 'mainnet-beta'
        ? `https://explorer.solana.com/tx/${txSignature}`
        : `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
    });
    
  } catch (error) {
    console.error('[Mint] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Minting failed' },
      { status: 500 }
    );
  }
}
