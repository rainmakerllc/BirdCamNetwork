'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Sighting } from '@/types';
import { getBirdEmoji } from '@/lib/ml/classifier';

interface SightingsActivityProps {
  userId: string;
  maxItems?: number;
  className?: string;
}

interface DailySummary {
  totalSightings: number;
  uniqueSpecies: string[];
  topSpecies: { name: string; count: number }[];
  lastSighting?: Sighting;
}

function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function SightingsActivity({ userId, maxItems = 10, className = '' }: SightingsActivityProps) {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [summary, setSummary] = useState<DailySummary>({
    totalSightings: 0,
    uniqueSpecies: [],
    topSpecies: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'sightings'),
      where('userId', '==', userId),
      orderBy('detectedAt', 'desc'),
      limit(maxItems)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...convertTimestamps(doc.data() as Record<string, unknown>),
      })) as Sighting[];

      setSightings(items);
      
      // Calculate daily summary
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysSightings = items.filter(s => s.detectedAt >= today);
      const speciesMap = new Map<string, number>();
      
      todaysSightings.forEach(s => {
        const species = s.speciesFinalId || 'unknown';
        speciesMap.set(species, (speciesMap.get(species) || 0) + 1);
      });
      
      const topSpecies = Array.from(speciesMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setSummary({
        totalSightings: todaysSightings.length,
        uniqueSpecies: Array.from(speciesMap.keys()),
        topSpecies,
        lastSighting: items[0],
      });
      
      setLoading(false);
    }, (error) => {
      console.error('[SightingsActivity] Error:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, maxItems]);

  function formatSpeciesName(id: string): string {
    return id
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function timeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-xl p-6 ${className}`}>
        <h2 className="font-semibold mb-4">🐦 Bird Activity</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl p-6 ${className}`}>
      <h2 className="font-semibold mb-4">🐦 Bird Activity</h2>
      
      {/* Daily summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold text-emerald-700">{summary.totalSightings}</div>
          <div className="text-xs text-emerald-600">Today</div>
        </div>
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-700">{summary.uniqueSpecies.length}</div>
          <div className="text-xs text-blue-600">Species</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-700">{sightings.length}</div>
          <div className="text-xs text-purple-600">Total</div>
        </div>
      </div>
      
      {/* Top species today */}
      {summary.topSpecies.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Top Species Today</h3>
          <div className="flex flex-wrap gap-2">
            {summary.topSpecies.map(({ name, count }) => (
              <span 
                key={name}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm"
              >
                <span>{getBirdEmoji(name)}</span>
                <span className="font-medium">{formatSpeciesName(name)}</span>
                <span className="text-gray-400 text-xs">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent sightings timeline */}
      {sightings.length === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <div className="text-3xl mb-2">🐦</div>
          <p className="text-sm">No sightings yet</p>
          <p className="text-xs mt-1">Enable ML detection on a camera to start tracking birds</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sightings.map((sighting) => {
            const species = sighting.speciesFinalId || 'unknown';
            const confidence = sighting.speciesFinalConfidence || 0;
            
            return (
              <div 
                key={sighting.id} 
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* Thumbnail or emoji */}
                {sighting.keyframePath ? (
                  <img 
                    src={sighting.keyframePath} 
                    alt={formatSpeciesName(species)}
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                    {getBirdEmoji(species)}
                  </div>
                )}
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {formatSpeciesName(species)}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {sighting.detectedAt ? timeAgo(sighting.detectedAt) : 'Unknown'}
                  </div>
                </div>
                
                {/* Confidence bar */}
                <div className="w-12 h-1.5 bg-gray-200 rounded-full flex-shrink-0">
                  <div 
                    className={`h-full rounded-full ${
                      confidence > 0.7 ? 'bg-emerald-500' :
                      confidence > 0.5 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
