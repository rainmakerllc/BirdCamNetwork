'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { getCamera, updateCamera, deleteCamera } from '@/lib/services/cameras';
import { Camera } from '@/types';

function CameraDetailContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cameraId = searchParams.get('id');

  const [camera, setCamera] = useState<Camera | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', locationLabel: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
      return;
    }

    if (user && cameraId) {
      loadCamera();
    } else if (!cameraId) {
      router.push('/dashboard/cameras');
    }
  }, [user, authLoading, cameraId]);

  async function loadCamera() {
    if (!cameraId) return;
    try {
      const cam = await getCamera(cameraId);
      if (cam && cam.userId === user?.uid) {
        setCamera(cam);
        setFormData({ name: cam.name, locationLabel: cam.locationLabel || '' });
      } else {
        router.push('/dashboard/cameras');
      }
    } catch (error) {
      console.error('Error loading camera:', error);
      router.push('/dashboard/cameras');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!camera) return;
    setSaving(true);
    try {
      await updateCamera(camera.id, {
        name: formData.name,
        locationLabel: formData.locationLabel || undefined,
      });
      setCamera({ ...camera, name: formData.name, locationLabel: formData.locationLabel });
      setEditing(false);
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!camera || !confirm(`Delete "${camera.name}"?`)) return;
    try {
      await deleteCamera(camera.id);
      router.push('/dashboard/cameras');
    } catch {
      alert('Failed to delete');
    }
  }

  if (authLoading || loading) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="p-8 text-center py-20 text-gray-500">
        <div className="text-4xl mb-3">❌</div>
        <p>Camera not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <a href="/dashboard/cameras" className="text-gray-500 hover:text-gray-700 text-sm mb-4 inline-block">
        ← Back to Cameras
      </a>

      {/* Camera Preview */}
      <div className="bg-white rounded-xl overflow-hidden mb-6">
        <div className="aspect-video bg-gray-900 flex items-center justify-center">
          {camera.youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${camera.youtubeId}?autoplay=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-2">📹</div>
              <p>Camera preview coming soon</p>
            </div>
          )}
        </div>
      </div>

      {/* Camera Info */}
      <div className="bg-white rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            {editing ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="text-2xl font-bold text-gray-900 border-b-2 border-emerald-500 focus:outline-none"
              />
            ) : (
              <h1 className="text-2xl font-bold text-gray-900">{camera.name}</h1>
            )}
            {editing ? (
              <input
                type="text"
                value={formData.locationLabel}
                onChange={(e) => setFormData({ ...formData, locationLabel: e.target.value })}
                placeholder="Location"
                className="text-gray-600 border-b border-gray-300 focus:outline-none focus:border-emerald-500 mt-1"
              />
            ) : (
              camera.locationLabel && <p className="text-gray-500">{camera.locationLabel}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            camera.status === 'active' ? 'bg-green-100 text-green-700' :
            camera.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {camera.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-gray-500">Clips</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-gray-500">Today</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-gray-500">Species</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-gray-500">Named</div>
          </div>
        </div>

        <div className="flex gap-3">
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); setFormData({ name: camera.name, locationLabel: camera.locationLabel || '' }); }}
                className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                Edit
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recent Clips */}
      <div className="bg-white rounded-xl p-6">
        <h2 className="font-semibold mb-4">Recent Clips</h2>
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">🎬</div>
          <p className="text-sm">No clips yet</p>
        </div>
      </div>
    </div>
  );
}

export default function CameraDetailPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent"></div>
      </div>
    }>
      <CameraDetailContent />
    </Suspense>
  );
}
