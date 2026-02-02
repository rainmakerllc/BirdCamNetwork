'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useCameras } from '@/hooks/useCameras';
import { useState } from 'react';
import { Camera } from '@/types';
import Link from 'next/link';

export default function CamerasPage() {
  const { user } = useAuth();
  const { cameras, loading, addCamera, removeCamera } = useCameras();
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [formData, setFormData] = useState({ name: '', rtspUrl: '', locationLabel: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await addCamera({
        name: formData.name,
        rtspUrl: formData.rtspUrl,
        locationLabel: formData.locationLabel || undefined,
      });
      setShowAddCamera(false);
      setFormData({ name: '', rtspUrl: '', locationLabel: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add camera');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCamera = async (camera: Camera) => {
    if (!confirm(`Delete "${camera.name}"? This cannot be undone.`)) return;
    try {
      await removeCamera(camera.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete camera');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cameras</h1>
          <p className="text-gray-500">Manage your bird watching cameras</p>
        </div>
        <button
          onClick={() => setShowAddCamera(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2"
        >
          <span>+</span> Add Camera
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mx-auto"></div>
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">📹</div>
          <h2 className="text-lg font-semibold mb-2">No cameras yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add your first camera to start watching birds
          </p>
          <button
            onClick={() => setShowAddCamera(true)}
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Add Your First Camera
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {cameras.map((camera) => (
            <div key={camera.id} className="bg-white rounded-xl p-6 flex items-center gap-6">
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-3xl">
                📹
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{camera.name}</h3>
                {camera.locationLabel && (
                  <p className="text-gray-500 text-sm">{camera.locationLabel}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                  <span className={`px-2 py-0.5 rounded-full ${
                    camera.status === 'active' ? 'bg-green-100 text-green-700' :
                    camera.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {camera.status}
                  </span>
                  <span>Added {camera.createdAt?.toLocaleDateString?.() || 'recently'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/camera?id=${camera.id}`}
                  className="px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium"
                >
                  View
                </Link>
                <button
                  onClick={() => handleDeleteCamera(camera)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Camera Modal */}
      {showAddCamera && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Add Camera</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}
            
            <form onSubmit={handleAddCamera} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Camera Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Backyard Feeder"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RTSP URL *
                </label>
                <input
                  type="text"
                  required
                  value={formData.rtspUrl}
                  onChange={(e) => setFormData({ ...formData, rtspUrl: e.target.value })}
                  placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location (optional)
                </label>
                <input
                  type="text"
                  value={formData.locationLabel}
                  onChange={(e) => setFormData({ ...formData, locationLabel: e.target.value })}
                  placeholder="Backyard, Front porch..."
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddCamera(false); setError(null); }}
                  className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
