// Update public camera YouTube IDs with working streams
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, '../config/firebase-service-account.json'), 'utf-8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Fresh working YouTube live stream IDs (verified Feb 2026)
const updatedCams = [
  {
    name: 'Cornell Lab FeederWatch Cam',
    youtubeId: 'x10vL6_47Dw', // 4K live stream
    location: 'Ithaca, NY, USA',
    description: 'Live bird feeder at Cornell Lab of Ornithology, Ithaca NY - 4K quality',
  },
  {
    name: 'Ontario FeederWatch Cam',
    youtubeId: 'YQ2vfNZA5SE',
    location: 'Manitouwadge, Ontario',
    description: 'Boreal birds including winter finches in northern Ontario',
  },
  {
    name: 'Florida Bird Feeder',
    youtubeId: '0jYT7VWz7A8',
    location: 'Central Florida, USA',
    description: '24/7 backyard bird feeder cam with Florida birds and squirrels',
  },
  {
    name: 'Snowy Bird Feeder',
    youtubeId: 'Zn28VuyZ4V8',
    location: 'Northern USA',
    description: '24/7 winter bird feeder with relaxing nature sounds',
  },
];

async function updateCams() {
  console.log('Updating public camera YouTube IDs...\n');

  // Delete old public cams
  const oldCams = await db.collection('cameras').where('isPublic', '==', true).get();
  console.log(`Deleting ${oldCams.size} old public cameras...`);
  
  const batch = db.batch();
  oldCams.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Create fresh cams
  for (const cam of updatedCams) {
    const ref = await db.collection('cameras').add({
      userId: 'demo_public',
      name: cam.name,
      description: cam.description,
      rtspUrl: `youtube://${cam.youtubeId}`,
      youtubeId: cam.youtubeId,
      streamType: 'youtube',
      status: 'active',
      isPublic: true,
      locationLabel: cam.location,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✅ ${cam.name} → ${cam.youtubeId}`);
  }

  console.log('\n✅ Done! Refresh the explore page.');
}

updateCams().catch(console.error);
