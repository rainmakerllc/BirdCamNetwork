import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as serviceAccount from '../config/firebase-service-account.json';

initializeApp({
  credential: cert(serviceAccount as any),
});

const db = getFirestore();

async function addYouTubeCam() {
  const cameraData = {
    name: 'FL Birds Live Cam',
    locationLabel: 'Central Florida',
    rtspUrl: '', // YouTube stream via go2rtc exec
    status: 'active',
    isPublic: true,
    userId: 'system',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    streamSettings: {
      mode: 'auto',
      gatewayUrl: 'http://192.168.86.34:1984',
      streamPath: 'florida-birdcam',
      apiKey: '',
      mlEnabled: true,
      detectionThreshold: 0.25, // Lower threshold for testing
      classificationThreshold: 0.4,
      showDebugOverlay: true,
      developerMode: true,
    },
  };

  try {
    const docRef = await db.collection('cameras').add(cameraData);
    console.log('✅ YouTube cam added with ID:', docRef.id);
    console.log('Stream URLs:');
    console.log('  HLS: http://192.168.86.34:1984/api/stream.m3u8?src=florida-birdcam');
    console.log('  WebRTC: http://192.168.86.34:1984/api/webrtc?src=florida-birdcam');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addYouTubeCam();
