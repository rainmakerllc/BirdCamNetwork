'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export default function CommunityPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'feed' | 'requests' | 'leaderboard'>('feed');

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Community</h1>
        <p className="text-gray-500">Connect with fellow birders</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'feed', label: 'Feed' },
          { id: 'requests', label: 'ID Requests' },
          { id: 'leaderboard', label: 'Leaderboard' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t.id ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'feed' && (
        <div className="bg-white rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🌍</div>
          <h2 className="text-lg font-semibold mb-2">Community Feed</h2>
          <p className="text-gray-500">See what others are spotting. Coming soon!</p>
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Help Identify</h2>
              <span className="text-sm text-gray-500">0 open</span>
            </div>
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-gray-500 text-sm">No ID requests need help right now</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Your Requests</h2>
              <button className="text-sm text-emerald-600 font-medium">+ New Request</button>
            </div>
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Uncertain about a bird? Ask the community!</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="space-y-4">
          {/* Your Stats */}
          <div className="bg-emerald-50 rounded-xl p-6 flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-200 rounded-full flex items-center justify-center overflow-hidden">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
              ) : <span className="text-2xl">👤</span>}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{profile?.displayName || 'You'}</div>
              <div className="text-sm text-emerald-700">{profile?.xp || 0} XP</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-700">--</div>
              <div className="text-xs text-emerald-600">Your Rank</div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold">Top Birders This Week</h2>
            </div>
            <div className="divide-y">
              {[1, 2, 3, 4, 5].map((rank) => (
                <div key={rank} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                    rank === 2 ? 'bg-gray-100 text-gray-700' :
                    rank === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {rank}
                  </div>
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-300">--</div>
                    <div className="text-xs text-gray-300">-- species</div>
                  </div>
                  <div className="text-sm text-gray-300">-- XP</div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-gray-50 text-center text-sm text-gray-500">
              Rankings populate as the community grows
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
