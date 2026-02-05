import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Sighting } from '@/types';

const sightingsRef = collection(db, 'sightings');

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

// Create sighting (usually called by backend/worker)
export async function createSighting(data: {
  clipId: string;
  cameraId: string;
  userId: string;
  detectedAt: Date;
  durationMs: number;
  keyframePath: string;
  speciesModelTopN: { speciesId: string; confidence: number }[];
  speciesFinalId?: string;
  speciesFinalSource?: 'model' | 'user' | 'community';
  speciesFinalConfidence?: number;
  isRare?: boolean;
}): Promise<Sighting> {
  const docRef = await addDoc(sightingsRef, {
    ...data,
    isRare: data.isRare || false,
    createdAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as Sighting;
}

// Get user's sightings
export async function getUserSightings(userId: string, limitCount = 50): Promise<Sighting[]> {
  const q = query(
    sightingsRef,
    where('userId', '==', userId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Sighting[];
}

// Get sightings by camera
export async function getCameraSightings(cameraId: string, limitCount = 50): Promise<Sighting[]> {
  const q = query(
    sightingsRef,
    where('cameraId', '==', cameraId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Sighting[];
}

// Get sightings by species
export async function getSpeciesSightings(
  userId: string,
  speciesId: string,
  limitCount = 50
): Promise<Sighting[]> {
  const q = query(
    sightingsRef,
    where('userId', '==', userId),
    where('speciesFinalId', '==', speciesId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Sighting[];
}

// Subscribe to user's sightings (realtime)
export function subscribeToUserSightings(
  userId: string,
  callback: (sightings: Sighting[]) => void,
  limitCount = 50
): () => void {
  const q = query(
    sightingsRef,
    where('userId', '==', userId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const sightings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data() as Record<string, unknown>),
    })) as Sighting[];
    callback(sightings);
  });
}

// Get single sighting
export async function getSighting(sightingId: string): Promise<Sighting | null> {
  const docRef = doc(db, 'sightings', sightingId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...convertTimestamps(docSnap.data() as Record<string, unknown>),
    } as Sighting;
  }
  return null;
}

// Confirm/update species identification
export async function confirmSpecies(
  sightingId: string,
  speciesId: string,
  source: 'user' | 'community' = 'user',
  confidence?: number
): Promise<void> {
  const docRef = doc(db, 'sightings', sightingId);
  await updateDoc(docRef, {
    speciesFinalId: speciesId,
    speciesFinalSource: source,
    speciesFinalConfidence: confidence,
  });
}

// Assign to individual bird
export async function assignToIndividual(
  sightingId: string,
  individualId: string,
  matchConfidence?: number
): Promise<void> {
  const docRef = doc(db, 'sightings', sightingId);
  await updateDoc(docRef, {
    individualId,
    individualMatchConfidence: matchConfidence,
  });
}

// Get unique species count for user
export async function getUserSpeciesCount(userId: string): Promise<number> {
  const q = query(
    sightingsRef,
    where('userId', '==', userId),
    where('speciesFinalId', '!=', null)
  );
  const snapshot = await getDocs(q);
  
  const uniqueSpecies = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (data.speciesFinalId) {
      uniqueSpecies.add(data.speciesFinalId);
    }
  });
  
  return uniqueSpecies.size;
}

// Get sightings count for today
export async function getTodaysSightingsCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const q = query(
    sightingsRef,
    where('userId', '==', userId),
    where('detectedAt', '>=', Timestamp.fromDate(today))
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// =============================================================================
// Browser-based Detection Sightings
// =============================================================================

export interface BrowserSightingData {
  cameraId: string;
  userId: string;
  species: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  snapshot?: string; // base64 data URL
  trackId: string;
  trackDuration: number;
}

/**
 * Save a sighting detected by browser ML
 * Uploads snapshot to Firebase Storage and creates Firestore document
 */
export async function saveBrowserSighting(data: BrowserSightingData): Promise<string> {
  const now = new Date();
  let keyframePath = '';
  
  // Upload snapshot if provided
  if (data.snapshot) {
    try {
      const filename = `${data.cameraId}/${now.getTime()}_${data.trackId}.jpg`;
      const storageRef = ref(storage, `sightings/${filename}`);
      
      // Upload base64 image
      await uploadString(storageRef, data.snapshot, 'data_url');
      keyframePath = await getDownloadURL(storageRef);
    } catch (e) {
      console.error('[Sightings] Failed to upload snapshot:', e);
      // Continue without snapshot
    }
  }
  
  // Create sighting document
  const sightingDoc = {
    cameraId: data.cameraId,
    userId: data.userId,
    detectedAt: Timestamp.fromDate(now),
    durationMs: data.trackDuration,
    keyframePath,
    bbox: data.bbox,
    speciesModelTopN: [
      { speciesId: data.species.toLowerCase().replace(/\s+/g, '_'), confidence: data.confidence }
    ],
    speciesFinalId: data.species.toLowerCase().replace(/\s+/g, '_'),
    speciesFinalSource: 'model' as const,
    speciesFinalConfidence: data.confidence,
    isRare: false,
    source: 'browser_ml', // Distinguish from backend detections
    trackId: data.trackId,
    createdAt: serverTimestamp(),
  };
  
  const docRef = await addDoc(sightingsRef, sightingDoc);
  console.log('[Sightings] Saved browser sighting:', docRef.id, data.species);
  
  return docRef.id;
}

/**
 * Get recent browser-detected sightings for a camera
 */
export async function getRecentCameraSightings(
  cameraId: string, 
  limitCount = 20
): Promise<Sighting[]> {
  const q = query(
    sightingsRef,
    where('cameraId', '==', cameraId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as Sighting[];
}

/**
 * Subscribe to camera sightings in realtime
 */
export function subscribeToCameraSightings(
  cameraId: string,
  callback: (sightings: Sighting[]) => void,
  limitCount = 20
): () => void {
  const q = query(
    sightingsRef,
    where('cameraId', '==', cameraId),
    orderBy('detectedAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sightings = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...convertTimestamps(doc.data() as Record<string, unknown>),
      })) as Sighting[];
      callback(sightings);
    },
    (error) => {
      console.error('[Sightings] Subscription error:', error);
      callback([]);
    }
  );
}
