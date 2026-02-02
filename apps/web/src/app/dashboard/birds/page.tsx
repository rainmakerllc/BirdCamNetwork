'use client';

import { useIndividuals } from '@/hooks/useIndividuals';
import { useSightings } from '@/hooks/useSightings';
import { useEffect, useState } from 'react';
import { getAllSpecies } from '@/lib/services/species';
import { BirdSpecies } from '@/types';

export default function BirdsPage() {
  const { individuals, loading: individualsLoading, count, addIndividual, removeIndividual } = useIndividuals();
  const { speciesCount } = useSightings();
  
  const [tab, setTab] = useState<'named' | 'species'>('named');
  const [species, setSpecies] = useState<BirdSpecies[]>([]);
  const [showAddBird, setShowAddBird] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', speciesId: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAllSpecies().then(setSpecies).catch(console.error);
  }, []);

  const handleAddBird = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.displayName || !formData.speciesId) return;
    
    setSubmitting(true);
    try {
      await addIndividual({
        displayName: formData.displayName,
        speciesId: formData.speciesId,
        notes: formData.notes || undefined,
      });
      setShowAddBird(false);
      setFormData({ displayName: '', speciesId: '', notes: '' });
    } catch {
      alert('Failed to add bird');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Birds</h1>
          <p className="text-gray-500">Track and name your feathered visitors</p>
        </div>
        <button
          onClick={() => setShowAddBird(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          + Name a Bird
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-6 rounded-xl">
          <div className="text-3xl font-bold">{count}</div>
          <div className="text-sm text-gray-500">Named Birds</div>
        </div>
        <div className="bg-white p-6 rounded-xl">
          <div className="text-3xl font-bold">{speciesCount}</div>
          <div className="text-sm text-gray-500">Species Seen</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('named')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'named' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'
          }`}
        >
          Named Birds
        </button>
        <button
          onClick={() => setTab('species')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'species' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'
          }`}
        >
          Species Library
        </button>
      </div>

      {tab === 'named' ? (
        individualsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mx-auto"></div>
          </div>
        ) : individuals.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center">
            <div className="text-5xl mb-4">🐦</div>
            <h2 className="text-lg font-semibold mb-2">No named birds yet</h2>
            <p className="text-gray-500 text-sm mb-4">Give your regular visitors names to track them</p>
            <button
              onClick={() => setShowAddBird(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg"
            >
              Name Your First Bird
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {individuals.map((bird) => (
              <div key={bird.id} className="bg-white rounded-xl p-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-2xl">
                    🐦
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{bird.displayName}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {species.find(s => s.id === bird.speciesId)?.commonName || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{bird.visitCount} visits</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${bird.displayName}?`)) removeIndividual(bird.id);
                    }}
                    className="text-gray-400 hover:text-red-500 text-xl"
                  >
                    ×
                  </button>
                </div>
                {bird.notes && (
                  <p className="text-sm text-gray-600 mt-3 line-clamp-2">{bird.notes}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {species.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl p-12 text-center">
              <p className="text-gray-500">Loading species library...</p>
            </div>
          ) : (
            species.map((s) => (
              <div key={s.id} className="bg-white rounded-xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  🐦
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{s.commonName}</h3>
                  <p className="text-xs text-gray-500 italic truncate">{s.scientificName}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Bird Modal */}
      {showAddBird && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Name a Bird</h2>
            <form onSubmit={handleAddBird} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g., Franky"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Species *</label>
                <select
                  required
                  value={formData.speciesId}
                  onChange={(e) => setFormData({ ...formData, speciesId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Select species...</option>
                  {species.map((s) => (
                    <option key={s.id} value={s.id}>{s.commonName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Distinguishing features..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBird(false)}
                  className="flex-1 py-2 border rounded-lg text-gray-600"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Bird'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
