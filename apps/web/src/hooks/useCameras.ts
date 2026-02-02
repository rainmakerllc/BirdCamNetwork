'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToUserCameras,
  createCamera,
  updateCamera,
  deleteCamera,
} from '@/lib/services/cameras';
import { Camera } from '@/types';

export function useCameras() {
  const { user } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCameras([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserCameras(user.uid, (updatedCameras) => {
      setCameras(updatedCameras);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addCamera = useCallback(
    async (data: { name: string; rtspUrl: string; locationLabel?: string }) => {
      if (!user) throw new Error('Not authenticated');
      setError(null);
      try {
        const camera = await createCamera(user.uid, data);
        return camera;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add camera';
        setError(message);
        throw err;
      }
    },
    [user]
  );

  const editCamera = useCallback(
    async (
      cameraId: string,
      updates: Partial<Pick<Camera, 'name' | 'rtspUrl' | 'status' | 'isPublic' | 'locationLabel'>>
    ) => {
      setError(null);
      try {
        await updateCamera(cameraId, updates);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update camera';
        setError(message);
        throw err;
      }
    },
    []
  );

  const removeCamera = useCallback(async (cameraId: string) => {
    setError(null);
    try {
      await deleteCamera(cameraId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete camera';
      setError(message);
      throw err;
    }
  }, []);

  return {
    cameras,
    loading,
    error,
    addCamera,
    editCamera,
    removeCamera,
  };
}
