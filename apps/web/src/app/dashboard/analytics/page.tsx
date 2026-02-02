'use client';

import { useCameras } from '@/hooks/useCameras';
import { useClips } from '@/hooks/useClips';
import { useSightings } from '@/hooks/useSightings';
import { useIndividuals } from '@/hooks/useIndividuals';

export default function AnalyticsPage() {
  const { cameras } = useCameras();
  const { totalCount: clipsCount, todayCount: clipsToday } = useClips();
  const { speciesCount, todayCount: sightingsToday } = useSightings();
  const { count: namedBirdsCount } = useIndividuals();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500">Track your birding activity and trends</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl">
          <div className="text-sm text-gray-500 mb-1">Cameras</div>
          <div className="text-3xl font-bold">{cameras.length}</div>
        </div>
        <div className="bg-white p-6 rounded-xl">
          <div className="text-sm text-gray-500 mb-1">Total Clips</div>
          <div className="text-3xl font-bold">{clipsCount}</div>
        </div>
        <div className="bg-white p-6 rounded-xl">
          <div className="text-sm text-gray-500 mb-1">Species Seen</div>
          <div className="text-3xl font-bold">{speciesCount}</div>
        </div>
        <div className="bg-white p-6 rounded-xl">
          <div className="text-sm text-gray-500 mb-1">Named Birds</div>
          <div className="text-3xl font-bold">{namedBirdsCount}</div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="bg-white rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Today</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-4xl font-bold text-emerald-600">{clipsToday}</div>
            <div className="text-sm text-gray-500">Clips recorded</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-emerald-600">{sightingsToday}</div>
            <div className="text-sm text-gray-500">Bird sightings</div>
          </div>
        </div>
      </div>

      {/* Activity Chart */}
      <div className="bg-white rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Activity (Last 7 Days)</h2>
        <div className="h-48 flex items-end justify-around gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
            <div key={day} className="flex flex-col items-center gap-2">
              <div 
                className="w-8 bg-emerald-500 rounded-t transition-all"
                style={{ height: `${20 + Math.random() * 80}px` }}
              ></div>
              <span className="text-xs text-gray-500">{day}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">Sample data shown. Real analytics coming soon.</p>
      </div>

      {/* Peak Hours */}
      <div className="bg-white rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Peak Activity Hours</h2>
        <div className="space-y-3">
          {[
            { hour: '7-8 AM', pct: 85 },
            { hour: '8-9 AM', pct: 70 },
            { hour: '5-6 PM', pct: 65 },
            { hour: '6-7 PM', pct: 55 },
          ].map((item) => (
            <div key={item.hour} className="flex items-center gap-4">
              <span className="w-20 text-sm text-gray-600">{item.hour}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3">
                <div 
                  className="bg-emerald-500 h-3 rounded-full transition-all"
                  style={{ width: `${item.pct}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-500 w-10">{item.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
