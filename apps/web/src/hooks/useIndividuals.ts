'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToUserIndividuals,
  createIndividual,
  updateIndividual,
  deleteIndividual,
  getUserIndividualsCount,
} from '@/lib/services/individuals';
import { IndividualBird } from '@/types';

export function useIndividuals() {
  const { user } = useAuth();
  const [individuals, setIndividuals] = useState<IndividualBird[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setIndividuals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserIndividuals(user.uid, (updated) => {
      setIndividuals(updated);
      setLoading(false);
    });

    getUserIndividualsCount(user.uid).then(setCount);

    return () => unsubscribe();
  }, [user]);

  const addIndividual = useCallback(
    async (data: { speciesId: string; displayName: string; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return createIndividual(user.uid, data);
    },
    [user]
  );

  const editIndividual = useCallback(
    async (id: string, updates: { displayName?: string; notes?: string }) => {
      await updateIndividual(id, updates);
    },
    []
  );

  const removeIndividual = useCallback(async (id: string) => {
    await deleteIndividual(id);
  }, []);

  return {
    individuals,
    loading,
    count,
    addIndividual,
    editIndividual,
    removeIndividual,
  };
}
