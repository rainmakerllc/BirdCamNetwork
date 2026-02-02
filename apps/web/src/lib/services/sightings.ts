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
import { db } from '@/lib/firebase';
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
