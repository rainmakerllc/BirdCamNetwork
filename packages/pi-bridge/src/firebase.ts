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

// Get Firebase Storage
export function getStorage(): admin.storage.Storage {
  if (!app) initFirebase();
  return admin.storage();
}

export interface DetectionData {
  species: string;
  scientificName: string;
  confidence: number;
  clipId: string;
  clipBuffer: Buffer;
  thumbnailBuffer?: Buffer;
  timestamp: Date;
}

export interface DetectionRecord {
  id?: string;
  cameraId: string;
  species: string;
  scientificName: string;
  confidence: number;
  clipUrl?: string;
  thumbnailUrl?: string;
  timestamp: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Upload a clip to Firebase Storage
 */
export async function uploadClip(
  cameraId: string,
  clipId: string,
  clipBuffer: Buffer,
  contentType: string = 'video/mp4'
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket();
  
  const filePath = `clips/${cameraId}/${clipId}.mp4`;
  const file = bucket.file(filePath);
  
  await file.save(clipBuffer, {
    contentType,
    metadata: {
      cameraId,
      clipId,
      uploadedAt: new Date().toISOString(),
    },
  });
  
  // Make the file publicly accessible
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

/**
 * Upload a thumbnail to Firebase Storage
 */
export async function uploadThumbnail(
  cameraId: string,
  clipId: string,
  thumbnailBuffer: Buffer
): Promise<string> {
  const storage = getStorage();
  const bucket = storage.bucket();
  
  const filePath = `thumbnails/${cameraId}/${clipId}.jpg`;
  const file = bucket.file(filePath);
  
  await file.save(thumbnailBuffer, {
    contentType: 'image/jpeg',
    metadata: {
      cameraId,
      clipId,
    },
  });
  
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

/**
 * Save a bird detection record
 */
export async function saveDetection(
  cameraId: string,
  data: DetectionData
): Promise<string> {
  const db = getFirestore();
  
  // Upload clip
  const clipUrl = await uploadClip(cameraId, data.clipId, data.clipBuffer);
  
  // Upload thumbnail if available
  let thumbnailUrl: string | undefined;
  if (data.thumbnailBuffer) {
    thumbnailUrl = await uploadThumbnail(cameraId, data.clipId, data.thumbnailBuffer);
  }
  
  // Create detection record
  const record: Omit<DetectionRecord, 'id'> = {
    cameraId,
    species: data.species,
    scientificName: data.scientificName,
    confidence: data.confidence,
    clipUrl,
    thumbnailUrl,
    timestamp: admin.firestore.Timestamp.fromDate(data.timestamp),
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  const docRef = await db.collection('detections').add(record);
  
  // Also update the camera's last detection info
  await db.collection('cameras').doc(cameraId).update({
    lastDetection: {
      species: data.species,
      confidence: data.confidence,
      timestamp: record.timestamp,
      clipUrl,
      thumbnailUrl,
    },
    updatedAt: admin.firestore.Timestamp.now(),
  });
  
  // Update species collection (for analytics)
  const speciesRef = db.collection('species').doc(data.scientificName.replace(/\s+/g, '_').toLowerCase());
  await speciesRef.set({
    commonName: data.species,
    scientificName: data.scientificName,
    lastSeen: record.timestamp,
    detectionCount: admin.firestore.FieldValue.increment(1),
  }, { merge: true });
  
  return docRef.id;
}
