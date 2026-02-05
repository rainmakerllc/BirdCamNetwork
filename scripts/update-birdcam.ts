import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as serviceAccount from '../config/firebase-service-account.json';

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount as any),
});

const db = getFirestore();

async function updateBirdcam() {
  const cameraId = 'Ro52pSoQPnqSr0cO6ody';
  
  const updates = {
    status: 'active',
    updatedAt: FieldValue.serverTimestamp(),
    streamSettings: {
      mode: 'auto',
      gatewayUrl: 'http://192.168.86.34:1984',
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
    await db.collection('cameras').doc(cameraId).update(updates);
    console.log('✅ Camera updated with stream settings');
    console.log('Stream URLs:');
    console.log('  HLS: http://birdnetwork:1984/api/stream.m3u8?src=birdcam');
    console.log('  WebRTC: http://birdnetwork:1984/api/webrtc?src=birdcam');
  } catch (error) {
    console.error('❌ Error updating camera:', error);
  }
}

updateBirdcam();
