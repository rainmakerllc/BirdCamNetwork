'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useCameras } from '@/hooks/useCameras';
import { useClips } from '@/hooks/useClips';
import { useSightings } from '@/hooks/useSightings';
import { useIndividuals } from '@/hooks/useIndividuals';
import Link from 'next/link';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { cameras, loading: camerasLoading } = useCameras();
  const { clips, todayCount: clipsToday } = useClips();
  const { sightings, speciesCount, todayCount: sightingsToday } = useSightings();
  const { individuals } = useIndividuals();

  const stats = [
    { label: 'Cameras', value: cameras.length, href: '/dashboard/cameras', icon: '📹' },
    { label: 'Clips Today', value: clipsToday, href: '/dashboard/clips', icon: '🎬' },
    { label: 'Sightings Today', value: sightingsToday, href: '/dashboard/birds', icon: '🐦' },
    { label: 'Species Seen', value: speciesCount, href: '/dashboard/birds', icon: '🦅' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.displayName?.split(' ')[0] || 'Birder'}
        </h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your bird cameras</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-xl p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <span className="text-2xl">{stat.icon}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      {cameras.length === 0 && (
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white mb-8">
          <h2 className="text-lg font-semibold mb-2">Get Started</h2>
          <p className="text-emerald-100 mb-4">
            Add your first camera to start detecting birds
          </p>
          <Link
            href="/dashboard/cameras"
            className="inline-block px-4 py-2 bg-white text-emerald-600 rounded-lg font-medium hover:bg-emerald-50"
          >
            Add Camera
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Sightings */}
        <div className="bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Sightings</h2>
            <Link href="/dashboard/birds" className="text-sm text-emerald-600">View all</Link>
          </div>
          {sightings.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">🔍</div>
              <p className="text-sm">No sightings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sightings.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    🐦
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{s.speciesFinalId || 'Unknown species'}</p>
                    <p className="text-xs text-gray-500">
                      {s.detectedAt?.toLocaleString?.() || 'Just now'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Cameras */}
        <div className="bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Cameras</h2>
            <Link href="/dashboard/cameras" className="text-sm text-emerald-600">Manage</Link>
          </div>
          {camerasLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent mx-auto"></div>
            </div>
          ) : cameras.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">📹</div>
              <p className="text-sm">No cameras yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cameras.slice(0, 4).map((camera) => (
                <Link
                  key={camera.id}
                  href={`/dashboard/camera?id=${camera.id}`}
                  className="flex items-center gap-3 py-2 border-b last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    📹
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{camera.name}</p>
                    <p className="text-xs text-gray-500">{camera.locationLabel || 'No location'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    camera.status === 'active' ? 'bg-green-100 text-green-700' :
                    camera.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {camera.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Named Birds */}
        <div className="bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Named Birds</h2>
            <Link href="/dashboard/birds" className="text-sm text-emerald-600">View all</Link>
          </div>
          {individuals.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-4xl mb-2">🐦</div>
              <p className="text-sm">Name your regular visitors</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {individuals.slice(0, 6).map((bird) => (
                <div key={bird.id} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-full">
                  <span>🐦</span>
                  <span className="text-sm font-medium text-emerald-700">{bird.displayName}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl p-6">
          <h2 className="font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/cameras"
              className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100"
            >
              <span className="text-2xl">📹</span>
              <p className="text-sm mt-2">Add Camera</p>
            </Link>
            <Link
              href="/dashboard/birds"
              className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100"
            >
              <span className="text-2xl">🐦</span>
              <p className="text-sm mt-2">Name a Bird</p>
            </Link>
            <Link
              href="/dashboard/community"
              className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100"
            >
              <span className="text-2xl">🔍</span>
              <p className="text-sm mt-2">Get ID Help</p>
            </Link>
            <Link
              href="/dashboard/nfts"
              className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100"
            >
              <span className="text-2xl">🎨</span>
              <p className="text-sm mt-2">Mint NFT</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
