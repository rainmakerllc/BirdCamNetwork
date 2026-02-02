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
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Clip } from '@/types';

const clipsRef = collection(db, 'clips');

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

// Create clip
export async function createClip(
  userId: string,
  cameraId: string,
  data: {
    startedAt: Date;
    endedAt: Date;
    durationMs: number;
    storagePath: string;
    hlsManifest?: string;
    thumbnailPath?: string;
    zoneId?: string;
  }
): Promise<Clip> {
  const docRef = await addDoc(clipsRef, {
    userId,
    cameraId,
    ...data,
    isFavorite: false,
    shareVisibility: 'private',
    createdAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as Clip;
}

// Get user's clips
export async function getUserClips(userId: string, limitCount = 50): Promise<Clip[]> {
  const q = query(
    clipsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Clip[];
}

// Get clips by camera
export async function getCameraClips(cameraId: string, limitCount = 50): Promise<Clip[]> {
  const q = query(
    clipsRef,
    where('cameraId', '==', cameraId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Clip[];
}

// Subscribe to user's clips (realtime)
export function subscribeToUserClips(
  userId: string,
  callback: (clips: Clip[]) => void,
  limitCount = 50
): () => void {
  const q = query(
    clipsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const clips = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data() as Record<string, unknown>),
    })) as Clip[];
    callback(clips);
  });
}

// Get single clip
export async function getClip(clipId: string): Promise<Clip | null> {
  const docRef = doc(db, 'clips', clipId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...convertTimestamps(docSnap.data() as Record<string, unknown>),
    } as Clip;
  }
  return null;
}

// Update clip
export async function updateClip(
  clipId: string,
  updates: Partial<Pick<Clip, 'isFavorite' | 'shareVisibility' | 'shareSlug'>>
): Promise<void> {
  const docRef = doc(db, 'clips', clipId);
  await updateDoc(docRef, updates);
}

// Toggle favorite
export async function toggleClipFavorite(clipId: string, isFavorite: boolean): Promise<void> {
  await updateClip(clipId, { isFavorite });
}

// Delete clip
export async function deleteClip(clipId: string): Promise<void> {
  const docRef = doc(db, 'clips', clipId);
  await deleteDoc(docRef);
}

// Get clips count for user
export async function getUserClipsCount(userId: string): Promise<number> {
  const q = query(clipsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// Get today's clips count
export async function getTodaysClipsCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const q = query(
    clipsRef,
    where('userId', '==', userId),
    where('createdAt', '>=', Timestamp.fromDate(today))
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
}
