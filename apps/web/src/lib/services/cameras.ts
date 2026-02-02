import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Camera, Zone } from '@/types';

const camerasRef = collection(db, 'cameras');

// Convert Firestore timestamp to Date
function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Create camera
export async function createCamera(
  userId: string,
  data: { name: string; rtspUrl: string; locationLabel?: string }
): Promise<Camera> {
  const docRef = await addDoc(camerasRef, {
    userId,
    name: data.name,
    rtspUrl: data.rtspUrl,
    locationLabel: data.locationLabel || null,
    status: 'pending',
    isPublic: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as Camera;
}

// Get user's cameras
export async function getUserCameras(userId: string): Promise<Camera[]> {
  const q = query(
    camerasRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Camera[];
}

// Subscribe to user's cameras (realtime)
export function subscribeToUserCameras(
  userId: string,
  callback: (cameras: Camera[]) => void
): () => void {
  const q = query(
    camerasRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const cameras = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data() as Record<string, unknown>),
    })) as Camera[];
    callback(cameras);
  });
}

// Get single camera
export async function getCamera(cameraId: string): Promise<Camera | null> {
  const docRef = doc(db, 'cameras', cameraId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...convertTimestamps(docSnap.data() as Record<string, unknown>),
    } as Camera;
  }
  return null;
}

// Update camera
export async function updateCamera(
  cameraId: string,
  updates: Partial<Pick<Camera, 'name' | 'rtspUrl' | 'status' | 'isPublic' | 'locationLabel'>>
): Promise<void> {
  const docRef = doc(db, 'cameras', cameraId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// Delete camera
export async function deleteCamera(cameraId: string): Promise<void> {
  const docRef = doc(db, 'cameras', cameraId);
  await deleteDoc(docRef);
}

// Zones
export async function createZone(
  cameraId: string,
  data: { name: string; type: Zone['type']; polygon: Zone['polygon']; sensitivity?: number }
): Promise<Zone> {
  const zonesRef = collection(db, 'cameras', cameraId, 'zones');
  const docRef = await addDoc(zonesRef, {
    cameraId,
    ...data,
    createdAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as Zone;
}

export async function getCameraZones(cameraId: string): Promise<Zone[]> {
  const zonesRef = collection(db, 'cameras', cameraId, 'zones');
  const snapshot = await getDocs(zonesRef);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Zone[];
}

export async function deleteZone(cameraId: string, zoneId: string): Promise<void> {
  const docRef = doc(db, 'cameras', cameraId, 'zones', zoneId);
  await deleteDoc(docRef);
}
