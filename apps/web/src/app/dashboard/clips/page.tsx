'use client';

import { useClips } from '@/hooks/useClips';
import { useState } from 'react';

export default function ClipsPage() {
  const { clips, loading, todayCount, toggleFavorite, removeClip } = useClips();
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');

  const filteredClips = filter === 'favorites' ? clips.filter(c => c.isFavorite) : clips;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clips</h1>
          <p className="text-gray-500">{todayCount} clips recorded today</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          All ({clips.length})
        </button>
        <button
          onClick={() => setFilter('favorites')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'favorites' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Favorites ({clips.filter(c => c.isFavorite).length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mx-auto"></div>
        </div>
      ) : filteredClips.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-lg font-semibold mb-2">No clips yet</h2>
          <p className="text-gray-500 text-sm">
            {filter === 'favorites' 
              ? 'Star clips to add them to favorites'
              : 'Clips appear here when birds are detected'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClips.map((clip) => (
            <div key={clip.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="aspect-video bg-gray-100 flex items-center justify-center">
                <span className="text-4xl">🎬</span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">
                    {clip.createdAt?.toLocaleDateString?.() || 'Just now'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {Math.round((clip.durationMs || 0) / 1000)}s
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleFavorite(clip.id, !clip.isFavorite)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      clip.isFavorite 
                        ? 'bg-yellow-100 text-yellow-700' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {clip.isFavorite ? '★ Favorited' : '☆ Favorite'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this clip?')) removeClip(clip.id);
                    }}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
