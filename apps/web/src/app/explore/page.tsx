'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface PublicCamera {
  id: string;
  name: string;
  description?: string;
  locationLabel?: string;
  youtubeId?: string;
  status: string;
}

export default function ExplorePage() {
  const [cameras, setCameras] = useState<PublicCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCam, setSelectedCam] = useState<PublicCamera | null>(null);

  useEffect(() => {
    loadPublicCameras();
  }, []);

  async function loadPublicCameras() {
    try {
      const q = query(
        collection(db, 'cameras'),
        where('isPublic', '==', true),
        where('status', '==', 'active')
      );
      const snapshot = await getDocs(q);
      const cams = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PublicCamera[];
      setCameras(cams);
      if (cams.length > 0) setSelectedCam(cams[0]);
    } catch (err) {
      console.error('Failed to load public cameras:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐦</span>
            <span className="text-xl font-bold text-white">BirdCam Network</span>
          </Link>
          <Link 
            href="/"
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Sign Up Free
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Explore Live Bird Cams</h1>
          <p className="text-gray-400">Watch birds from around the world in real-time</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent"></div>
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📹</div>
            <h2 className="text-xl text-white mb-2">No public cameras yet</h2>
            <p className="text-gray-400">Check back soon!</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Video Player */}
            <div className="lg:col-span-2">
              {selectedCam && (
                <div className="bg-gray-800 rounded-xl overflow-hidden">
                  <div className="aspect-video bg-black">
                    {selectedCam.youtubeId ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${selectedCam.youtubeId}?autoplay=1&mute=1`}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <span className="text-4xl">📹</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="text-xl font-semibold text-white">{selectedCam.name}</h2>
                    {selectedCam.locationLabel && (
                      <p className="text-emerald-400 text-sm mt-1">📍 {selectedCam.locationLabel}</p>
                    )}
                    {selectedCam.description && (
                      <p className="text-gray-400 text-sm mt-2">{selectedCam.description}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Camera List */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white mb-4">Live Cams ({cameras.length})</h3>
              {cameras.map((cam) => (
                <button
                  key={cam.id}
                  onClick={() => setSelectedCam(cam)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedCam?.id === cam.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-10 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                      {cam.youtubeId ? (
                        <img 
                          src={`https://img.youtube.com/vi/${cam.youtubeId}/mqdefault.jpg`}
                          alt=""
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <span>📹</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{cam.name}</div>
                      {cam.locationLabel && (
                        <div className="text-xs opacity-75 truncate">{cam.locationLabel}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Add Your Own Bird Cam</h2>
          <p className="text-emerald-100 mb-4">
            Connect your feeder cam and join the network. AI species detection included!
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-white text-emerald-600 rounded-lg font-semibold hover:bg-emerald-50"
          >
            Get Started Free
          </Link>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 text-center text-gray-500 text-sm">
        © 2026 BirdCam Network • Built with 💚 for bird lovers
      </footer>
    </div>
  );
}
