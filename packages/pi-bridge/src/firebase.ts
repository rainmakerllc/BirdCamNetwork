import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { config } from './config.js';

let app: admin.app.App | null = null;

export function initFirebase(): admin.app.App {
  if (app) return app;
  
  const serviceAccount = JSON.parse(
    readFileSync(config.firebase.serviceAccountPath, 'utf-8')
  );
  
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: config.firebase.projectId,
  });
  
  console.log(`[Firebase] Initialized with project: ${config.firebase.projectId}`);
  return app;
}

export function getFirestore(): admin.firestore.Firestore {
  if (!app) initFirebase();
  return admin.firestore();
}

export interface CameraRegistration {
  id: string;
  deviceId: string;
  name: string;
  status: 'pending' | 'active' | 'offline' | 'error';
  streamUrl?: string;
  localUrl: string;
  locationLabel?: string;
  streamType: 'rtsp' | 'hls';
  codec?: string;
  resolution?: string;
  isPublic: boolean;
  lastHeartbeat: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function registerCamera(
  userId: string,
  streamUrl: string,
  localUrl: string
): Promise<string> {
  const db = getFirestore();
  
  // Check if this device already has a camera registered
  const existing = await db.collection('cameras')
    .where('deviceId', '==', config.deviceId)
    .limit(1)
    .get();
  
  const now = admin.firestore.Timestamp.now();
  
  if (!existing.empty) {
    // Update existing camera
    const doc = existing.docs[0];
    await doc.ref.update({
      status: 'active',
      streamUrl,
      localUrl,
      lastHeartbeat: now,
      updatedAt: now,
    });
    console.log(`[Firebase] Updated camera: ${doc.id}`);
    return doc.id;
  }
  
  // Create new camera
  const cameraData: Omit<CameraRegistration, 'id'> = {
    deviceId: config.deviceId,
    name: config.camera.name,
    status: 'active',
    streamUrl,
    localUrl,
    locationLabel: config.camera.location || undefined,
    streamType: 'hls',
    isPublic: false,
    lastHeartbeat: now,
    createdAt: now,
    updatedAt: now,
  };
  
  // Note: userId would typically come from device claim/registration flow
  // For now, cameras are created without userId and claimed later
  const docRef = await db.collection('cameras').add(cameraData);
  console.log(`[Firebase] Registered new camera: ${docRef.id}`);
  return docRef.id;
}

export async function updateCameraStatus(
  cameraId: string,
  status: CameraRegistration['status'],
  extra?: Partial<CameraRegistration>
): Promise<void> {
  const db = getFirestore();
  await db.collection('cameras').doc(cameraId).update({
    status,
    lastHeartbeat: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    ...extra,
  });
}

export async function sendHeartbeat(cameraId: string): Promise<void> {
  const db = getFirestore();
  await db.collection('cameras').doc(cameraId).update({
    lastHeartbeat: admin.firestore.Timestamp.now(),
  });
}
