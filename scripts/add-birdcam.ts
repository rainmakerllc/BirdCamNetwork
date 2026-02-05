import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as serviceAccount from '../config/firebase-service-account.json';

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount as any),
});

const db = getFirestore();

async function addBirdcam() {
  // Add the birdcam with go2rtc stream config
  const cameraData = {
    name: 'Backyard BirdCam',
    locationLabel: 'Backyard Feeder',
    rtspUrl: 'rtsp://admin:Funstuff@192.168.86.30:554/cam/realmonitor?channel=1&subtype=0',
    status: 'active',
    isPublic: true,
    userId: 'system', // Public camera, no specific user
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    streamSettings: {
      mode: 'auto',
      gatewayUrl: 'http://birdnetwork:1984',
      streamPath: 'birdcam',
      apiKey: '',
      mlEnabled: true,
      detectionThreshold: 0.35,
      classificationThreshold: 0.55,
      showDebugOverlay: false,
      developerMode: false,
    },
  };

  try {
    const docRef = await db.collection('cameras').add(cameraData);
    console.log('✅ Birdcam added with ID:', docRef.id);
    console.log('Stream URLs:');
    console.log('  HLS: http://birdnetwork:1984/api/stream.m3u8?src=birdcam');
    console.log('  WebRTC: http://birdnetwork:1984/api/webrtc?src=birdcam');
  } catch (error) {
    console.error('❌ Error adding camera:', error);
  }
}

addBirdcam();
