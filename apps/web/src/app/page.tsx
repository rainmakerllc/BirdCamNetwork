'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui';

export default function Home() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) router.push('/dashboard');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 to-sky-50/50">
      {/* Header */}
      <header className="container mx-auto px-6 py-5">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐦</span>
            <span className="text-xl font-semibold text-gray-900">BirdCam</span>
          </div>
          <Button onClick={signInWithGoogle} size="sm">Sign In</Button>
        </nav>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-6 pt-16 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-5">
            Your Window to
            <span className="text-emerald-600"> Nature</span>
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
            Connect your feeder cam. Identify species with AI. Name your regulars.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-20">
            <Button onClick={signInWithGoogle} size="lg">
              Get Started — Free
            </Button>
            <a href="/explore">
              <Button variant="secondary" size="lg">
                Watch Live Cams
              </Button>
            </a>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-5 text-left">
            {[
              { icon: '📹', title: 'Easy Setup', desc: 'Any RTSP camera. Minutes to connect.' },
              { icon: '🤖', title: 'AI Detection', desc: 'Auto species ID. Learn who visits.' },
              { icon: '⭐', title: 'Name Birds', desc: 'Track individuals. Get alerts.' },
            ].map((f) => (
              <div key={f.title} className="bg-white/80 backdrop-blur p-5 rounded-xl border border-gray-100">
                <span className="text-3xl">{f.icon}</span>
                <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* More Features */}
          <div className="grid md:grid-cols-2 gap-5 mt-5 text-left">
            <div className="bg-white/80 backdrop-blur p-5 rounded-xl border border-gray-100">
              <span className="text-3xl">📊</span>
              <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1">Analytics</h3>
              <p className="text-sm text-gray-600">Track patterns, peak hours, and species diversity over time.</p>
            </div>
            <div className="bg-white/80 backdrop-blur p-5 rounded-xl border border-gray-100">
              <span className="text-3xl">🌍</span>
              <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1">Community</h3>
              <p className="text-sm text-gray-600">Get help IDing birds. Compare sightings with neighbors.</p>
            </div>
          </div>

          {/* NFT Teaser */}
          <div className="mt-16 bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">
              ✨ Coming Soon
            </span>
            <h3 className="text-lg font-semibold text-gray-900">Mint Your Sightings</h3>
            <p className="text-sm text-gray-600 mt-1">Turn rare moments into collectible Solana NFTs.</p>
          </div>

          {/* Social Proof */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-gray-400 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">45+</div>
              <div>Species Detected</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">1000+</div>
              <div>Clips Captured</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">Free</div>
              <div>To Start</div>
            </div>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-6 py-8 text-center text-sm text-gray-500 border-t border-gray-100">
        © 2026 BirdCam Network • Built with 💚 for bird lovers
      </footer>
    </div>
  );
}
