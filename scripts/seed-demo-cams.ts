// Seed demo/public bird camera feeds
// Run with: npx tsx scripts/seed-demo-cams.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load service account
const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, '../config/firebase-service-account.json'), 'utf-8')
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

// Public/demo bird camera feeds (YouTube embeds, public streams)
const publicCams = [
  {
    name: 'Cornell Lab FeederWatch Cam',
    description: 'Live bird feeder at Cornell Lab of Ornithology, Ithaca NY',
    location: 'Ithaca, NY, USA',
    youtubeId: 'N609loYkFJo', // Cornell FeederWatch
    type: 'youtube',
  },
  {
    name: 'Decorah Eagles',
    description: 'Famous bald eagle nest in Decorah, Iowa',
    location: 'Decorah, IA, USA', 
    youtubeId: 'Qr9Mxq__cKg',
    type: 'youtube',
  },
  {
    name: 'Panama Fruit Feeder Cam',
    description: 'Tropical birds at a fruit feeder in Panama',
    location: 'Panama',
    youtubeId: 'vvxf72M9SA8',
    type: 'youtube',
  },
  {
    name: 'Recke Wetlands Bird Cam',
    description: 'Wetland birds in Germany',
    location: 'Recke, Germany',
    youtubeId: '8z-2L0h7aTY', 
    type: 'youtube',
  },
  {
    name: 'UK Garden Bird Feeder',
    description: 'British garden birds at a feeder',
    location: 'United Kingdom',
    youtubeId: 'dq_RsNfxXs4',
    type: 'youtube',
  },
  {
    name: 'Bella Hummingbird Cam',
    description: 'Hummingbird feeder in California',
    location: 'California, USA',
    youtubeId: 'kQ70KOiJDww',
    type: 'youtube',
  },
];

// Create demo users for public cams
const demoUsers = [
  { email: 'cornell@birdcam.demo', displayName: 'Cornell Lab' },
  { email: 'decorah@birdcam.demo', displayName: 'Decorah Eagles' },
  { email: 'panama@birdcam.demo', displayName: 'Panama Birds' },
  { email: 'recke@birdcam.demo', displayName: 'Recke Wetlands' },
  { email: 'ukgarden@birdcam.demo', displayName: 'UK Garden Birds' },
  { email: 'bella@birdcam.demo', displayName: 'Bella Hummingbirds' },
];

async function seed() {
  console.log('Seeding public bird cameras...\n');

  for (let i = 0; i < publicCams.length; i++) {
    const cam = publicCams[i];
    const user = demoUsers[i];
    
    console.log(`Setting up: ${cam.name}`);

    // Create or get demo user profile in Firestore
    const userId = `demo_${user.email.split('@')[0]}`;
    
    // Create user profile
    await db.collection('users').doc(userId).set({
      email: user.email,
      displayName: user.displayName,
      photoURL: null,
      planTier: 'demo',
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    // Create camera
    const cameraRef = await db.collection('cameras').add({
      userId,
      name: cam.name,
      description: cam.description,
      rtspUrl: `youtube://${cam.youtubeId}`, // Pseudo-URL for YouTube streams
      youtubeId: cam.youtubeId,
      streamType: cam.type,
      status: 'active',
      isPublic: true,
      locationLabel: cam.location,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`  ✅ Camera created: ${cameraRef.id}`);
  }

  console.log('\n✅ All public cams seeded successfully!');
  console.log('\nPublic cameras available:');
  publicCams.forEach(cam => {
    console.log(`  - ${cam.name} (${cam.location})`);
  });
}

seed().catch(console.error);
