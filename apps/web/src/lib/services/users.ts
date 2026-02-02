import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { UserProfile } from '@/types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as UserProfile;
  }
  return null;
}

export async function createUserProfile(user: User): Promise<UserProfile> {
  const docRef = doc(db, 'users', user.uid);
  
  const profile = {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    planTier: 'free',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  await setDoc(docRef, profile);
  
  return {
    id: user.uid,
    ...profile,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as UserProfile;
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) {
    return existing;
  }
  return createUserProfile(user);
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'photoURL' | 'bio' | 'location' | 'website'>>
): Promise<void> {
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
