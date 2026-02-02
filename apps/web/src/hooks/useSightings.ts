'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToUserSightings,
  confirmSpecies,
  getUserSpeciesCount,
  getTodaysSightingsCount,
} from '@/lib/services/sightings';
import { Sighting } from '@/types';

export function useSightings() {
  const { user } = useAuth();
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [speciesCount, setSpeciesCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setSightings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserSightings(user.uid, (updated) => {
      setSightings(updated);
      setLoading(false);
    });

    // Get counts
    getUserSpeciesCount(user.uid).then(setSpeciesCount);
    getTodaysSightingsCount(user.uid).then(setTodayCount);

    return () => unsubscribe();
  }, [user]);

  const confirm = useCallback(async (sightingId: string, speciesId: string) => {
    await confirmSpecies(sightingId, speciesId, 'user');
  }, []);

  return {
    sightings,
    loading,
    speciesCount,
    todayCount,
    confirmSpecies: confirm,
  };
}
