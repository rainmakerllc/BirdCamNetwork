'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { updateUserProfile } from '@/lib/services/users';

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  
  const [tab, setTab] = useState<'profile' | 'notifications' | 'privacy' | 'account'>('profile');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    location: '',
    website: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        location: profile.location || '',
        website: profile.website || '',
      });
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        displayName: formData.displayName,
        bio: formData.bio || undefined,
        location: formData.location || undefined,
        website: formData.website || undefined,
      });
      alert('Saved!');
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Manage your account</p>
      </div>

      <div className="flex gap-8 max-w-4xl">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {[
              { id: 'profile', label: 'Profile', icon: '👤' },
              { id: 'notifications', label: 'Notifications', icon: '🔔' },
              { id: 'privacy', label: 'Privacy', icon: '🔒' },
              { id: 'account', label: 'Account', icon: '⚙️' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as typeof tab)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-left ${
                  tab === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {tab === 'profile' && (
            <div className="bg-white rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-6">Profile</h2>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center overflow-hidden">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : <span className="text-2xl">👤</span>}
                  </div>
                  <div>
                    <div className="font-medium">{user?.email}</div>
                    <div className="text-xs text-gray-500">Photo from Google</div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={3}
                    placeholder="About you..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="City, State"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </form>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="bg-white rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-6">Notifications</h2>
              <div className="space-y-4">
                {[
                  { id: 'rare', label: 'Rare sightings', desc: 'Unusual birds detected' },
                  { id: 'community', label: 'Community', desc: 'ID help responses' },
                  { id: 'live', label: 'Live alerts', desc: 'Real-time detections' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.desc}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="bg-white rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-6">Privacy</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sighting visibility</label>
                  <select className="w-full px-3 py-2 border rounded-lg">
                    <option value="public">Public</option>
                    <option value="followers">Followers only</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location precision</label>
                  <select className="w-full px-3 py-2 border rounded-lg">
                    <option value="exact">Exact</option>
                    <option value="city">City only</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'account' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Account</h2>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Email:</strong> {user?.email}</p>
                  <p><strong>Plan:</strong> {profile?.planTier || 'Free'}</p>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Sign Out</h2>
                <button
                  onClick={() => { signOut(); router.push('/'); }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Sign Out
                </button>
              </div>
              
              <div className="bg-red-50 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h2>
                <p className="text-sm text-red-600 mb-4">This permanently deletes all your data.</p>
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                  Delete Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
