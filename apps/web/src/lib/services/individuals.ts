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
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { IndividualBird } from '@/types';

const individualsRef = collection(db, 'individuals');

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

// Create named individual
export async function createIndividual(
  userId: string,
  data: {
    speciesId: string;
    displayName: string;
    avatarPath?: string;
    notes?: string;
    cameraGroupId?: string;
  }
): Promise<IndividualBird> {
  const now = new Date();
  const docRef = await addDoc(individualsRef, {
    userId,
    speciesId: data.speciesId,
    displayName: data.displayName,
    avatarPath: data.avatarPath || null,
    notes: data.notes || null,
    cameraGroupId: data.cameraGroupId || null,
    firstSeenAt: now,
    lastSeenAt: now,
    visitCount: 1,
    isPrivate: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const newDoc = await getDoc(docRef);
  return {
    id: newDoc.id,
    ...convertTimestamps(newDoc.data() as Record<string, unknown>),
  } as IndividualBird;
}

// Get user's named birds
export async function getUserIndividuals(userId: string): Promise<IndividualBird[]> {
  const q = query(
    individualsRef,
    where('userId', '==', userId),
    orderBy('lastSeenAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as IndividualBird[];
}

// Get individuals by species
export async function getIndividualsBySpecies(
  userId: string,
  speciesId: string
): Promise<IndividualBird[]> {
  const q = query(
    individualsRef,
    where('userId', '==', userId),
    where('speciesId', '==', speciesId),
    orderBy('lastSeenAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as IndividualBird[];
}

// Subscribe to user's individuals (realtime)
export function subscribeToUserIndividuals(
  userId: string,
  callback: (individuals: IndividualBird[]) => void
): () => void {
  const q = query(
    individualsRef,
    where('userId', '==', userId),
    orderBy('lastSeenAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const individuals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...convertTimestamps(doc.data() as Record<string, unknown>),
    })) as IndividualBird[];
    callback(individuals);
  });
}

// Get single individual
export async function getIndividual(individualId: string): Promise<IndividualBird | null> {
  const docRef = doc(db, 'individuals', individualId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...convertTimestamps(docSnap.data() as Record<string, unknown>),
    } as IndividualBird;
  }
  return null;
}

// Update individual
export async function updateIndividual(
  individualId: string,
  updates: Partial<Pick<IndividualBird, 'displayName' | 'notes' | 'avatarPath' | 'isPrivate'>>
): Promise<void> {
  const docRef = doc(db, 'individuals', individualId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// Record a visit (increment count, update lastSeenAt)
export async function recordVisit(individualId: string): Promise<void> {
  const docRef = doc(db, 'individuals', individualId);
  await updateDoc(docRef, {
    visitCount: increment(1),
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// Delete individual
export async function deleteIndividual(individualId: string): Promise<void> {
  const docRef = doc(db, 'individuals', individualId);
  await deleteDoc(docRef);
}

// Get count of named birds for user
export async function getUserIndividualsCount(userId: string): Promise<number> {
  const q = query(individualsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// Get most visited individuals
export async function getMostVisited(userId: string, limitCount = 5): Promise<IndividualBird[]> {
  const q = query(
    individualsRef,
    where('userId', '==', userId),
    orderBy('visitCount', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...convertTimestamps(doc.data() as Record<string, unknown>),
  })) as IndividualBird[];
}
