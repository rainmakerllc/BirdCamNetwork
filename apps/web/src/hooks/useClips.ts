'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToUserClips,
  toggleClipFavorite,
  deleteClip,
  getUserClipsCount,
  getTodaysClipsCount,
} from '@/lib/services/clips';
import { Clip } from '@/types';

export function useClips() {
  const { user } = useAuth();
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setClips([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserClips(user.uid, (updatedClips) => {
      setClips(updatedClips);
      setLoading(false);
    });

    // Get counts
    getUserClipsCount(user.uid).then(setTotalCount);
    getTodaysClipsCount(user.uid).then(setTodayCount);

    return () => unsubscribe();
  }, [user]);

  const toggleFavorite = useCallback(async (clipId: string, isFavorite: boolean) => {
    await toggleClipFavorite(clipId, isFavorite);
  }, []);

  const removeClip = useCallback(async (clipId: string) => {
    await deleteClip(clipId);
  }, []);

  return {
    clips,
    loading,
    totalCount,
    todayCount,
    toggleFavorite,
    removeClip,
  };
}
