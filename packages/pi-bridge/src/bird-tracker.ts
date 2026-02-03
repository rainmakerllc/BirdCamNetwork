/**
 * Bird Species Tracker
 * 
 * Tracks detected bird species with history, statistics, and life lists.
 * Integrates with BirdNET detector to maintain a log of all sightings.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';
import { getNotificationManager } from './notifications.js';
import { getCurrentWeather, type WeatherData } from './weather.js';

export interface BirdSighting {
  id: string;
  species: string;
  scientificName: string;
  confidence: number;
  timestamp: string;
  clipId?: string;
  snapshotId?: string;
  presetId?: string;        // Which camera preset was active
  weather?: WeatherInfo;
  notes?: string;
}

export interface WeatherInfo {
  temperature?: number;
  conditions?: string;
  windSpeed?: number;
}

export interface SpeciesStats {
  species: string;
  scientificName: string;
  totalSightings: number;
  firstSeen: string;
  lastSeen: string;
  averageConfidence: number;
  peakHour: number;         // Hour of day with most sightings (0-23)
  monthlyCount: number[];   // Array of 12 months
}

export interface DailyStats {
  date: string;
  totalSightings: number;
  uniqueSpecies: number;
  species: Array<{ species: string; count: number }>;
}

export interface TrackerState {
  sightings: BirdSighting[];
  lifeList: string[];       // All species ever seen
  lastUpdated: string;
}

const MAX_SIGHTINGS = 10000; // Keep last 10k sightings in memory
const SIGHTINGS_PER_FILE = 1000; // Archive to files after this many

export class BirdTracker extends EventEmitter {
  private state: TrackerState;
  private dataDir: string;
  private statePath: string;

  constructor(dataDir?: string) {
    super();
    this.dataDir = dataDir || join(homedir(), '.birdcam', 'birds');
    this.statePath = join(this.dataDir, 'tracker-state.json');
    
    // Ensure directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.state = this.loadState();
  }

  private loadState(): TrackerState {
    try {
      if (existsSync(this.statePath)) {
        const data = readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('[BirdTracker] Failed to load state:', (err as Error).message);
    }
    return {
      sightings: [],
      lifeList: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveState(): void {
    try {
      this.state.lastUpdated = new Date().toISOString();
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('[BirdTracker] Failed to save state:', (err as Error).message);
    }
  }

  /**
   * Record a new bird sighting
   */
  async recordSighting(sighting: Omit<BirdSighting, 'id'>): Promise<BirdSighting> {
    // Fetch current weather to add context
    let weather: WeatherData | null = null;
    try {
      weather = await getCurrentWeather();
    } catch (err) {
      // Weather is optional
    }

    const record: BirdSighting = {
      ...sighting,
      id: `sight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      weather: weather ? {
        temperature: weather.temperature,
        conditions: weather.conditions,
        windSpeed: weather.windSpeed,
      } : undefined,
    };

    // Add to sightings
    this.state.sightings.push(record);

    // Check if new species
    const isNew = !this.state.lifeList.includes(sighting.species);
    if (isNew) {
      this.state.lifeList.push(sighting.species);
      this.emit('newSpecies', record);
      console.log(`[BirdTracker] 🎉 New species added to life list: ${sighting.species}`);
    }

    // Check if rare species
    const notificationManager = getNotificationManager();
    const isRare = notificationManager.isRareSpecies(sighting.species);

    // Send notification
    try {
      await notificationManager.notifyBirdDetected(
        sighting.species,
        sighting.confidence,
        isNew,
        isRare
      );
    } catch (err) {
      // Notification failure shouldn't block recording
    }

    // Trim old sightings if needed
    if (this.state.sightings.length > MAX_SIGHTINGS) {
      this.archiveOldSightings();
    }

    this.saveState();
    this.emit('sighting', record);

    return record;
  }

  /**
   * Archive old sightings to separate files
   */
  private archiveOldSightings(): void {
    const toArchive = this.state.sightings.slice(0, SIGHTINGS_PER_FILE);
    const firstDate = new Date(toArchive[0].timestamp);
    const archiveFile = join(
      this.dataDir,
      `archive-${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}.json`
    );

    // Load existing archive or create new
    let archive: BirdSighting[] = [];
    if (existsSync(archiveFile)) {
      try {
        archive = JSON.parse(readFileSync(archiveFile, 'utf-8'));
      } catch (e) {
        // Start fresh
      }
    }

    archive.push(...toArchive);
    writeFileSync(archiveFile, JSON.stringify(archive, null, 2));

    // Remove archived from active state
    this.state.sightings = this.state.sightings.slice(SIGHTINGS_PER_FILE);
    console.log(`[BirdTracker] Archived ${toArchive.length} sightings to ${archiveFile}`);
  }

  /**
   * Get the life list (all species ever seen)
   */
  getLifeList(): string[] {
    return [...this.state.lifeList].sort();
  }

  /**
   * Get total species count
   */
  getSpeciesCount(): number {
    return this.state.lifeList.length;
  }

  /**
   * Get recent sightings
   */
  getRecentSightings(limit: number = 50): BirdSighting[] {
    return this.state.sightings
      .slice(-limit)
      .reverse();
  }

  /**
   * Get sightings for a specific date
   */
  getSightingsForDate(date: Date): BirdSighting[] {
    const dateStr = date.toISOString().split('T')[0];
    return this.state.sightings.filter(s => 
      s.timestamp.startsWith(dateStr)
    );
  }

  /**
   * Get sightings for a specific species
   */
  getSightingsForSpecies(species: string): BirdSighting[] {
    return this.state.sightings.filter(s => 
      s.species.toLowerCase() === species.toLowerCase()
    );
  }

  /**
   * Get statistics for a specific species
   */
  getSpeciesStats(species: string): SpeciesStats | null {
    const sightings = this.getSightingsForSpecies(species);
    if (sightings.length === 0) return null;

    const hourCounts = new Array(24).fill(0);
    const monthCounts = new Array(12).fill(0);
    let totalConfidence = 0;

    for (const s of sightings) {
      const date = new Date(s.timestamp);
      hourCounts[date.getHours()]++;
      monthCounts[date.getMonth()]++;
      totalConfidence += s.confidence;
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    return {
      species,
      scientificName: sightings[0].scientificName,
      totalSightings: sightings.length,
      firstSeen: sightings[0].timestamp,
      lastSeen: sightings[sightings.length - 1].timestamp,
      averageConfidence: totalConfidence / sightings.length,
      peakHour,
      monthlyCount: monthCounts,
    };
  }

  /**
   * Get daily statistics
   */
  getDailyStats(date?: Date): DailyStats {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];
    const sightings = this.getSightingsForDate(targetDate);

    const speciesCount: Record<string, number> = {};
    for (const s of sightings) {
      speciesCount[s.species] = (speciesCount[s.species] || 0) + 1;
    }

    return {
      date: dateStr,
      totalSightings: sightings.length,
      uniqueSpecies: Object.keys(speciesCount).length,
      species: Object.entries(speciesCount)
        .map(([species, count]) => ({ species, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Get top species by sighting count
   */
  getTopSpecies(limit: number = 10): Array<{ species: string; count: number }> {
    const counts: Record<string, number> = {};
    
    for (const s of this.state.sightings) {
      counts[s.species] = (counts[s.species] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([species, count]) => ({ species, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get activity heatmap data (hour vs day of week)
   */
  getActivityHeatmap(): number[][] {
    // 7 days x 24 hours
    const heatmap: number[][] = Array.from({ length: 7 }, () => 
      new Array(24).fill(0)
    );

    for (const s of this.state.sightings) {
      const date = new Date(s.timestamp);
      heatmap[date.getDay()][date.getHours()]++;
    }

    return heatmap;
  }

  /**
   * Search sightings
   */
  search(query: string, options?: {
    startDate?: Date;
    endDate?: Date;
    minConfidence?: number;
  }): BirdSighting[] {
    const q = query.toLowerCase();
    
    return this.state.sightings.filter(s => {
      // Text match
      if (!s.species.toLowerCase().includes(q) && 
          !s.scientificName.toLowerCase().includes(q)) {
        return false;
      }

      // Date filters
      if (options?.startDate && new Date(s.timestamp) < options.startDate) {
        return false;
      }
      if (options?.endDate && new Date(s.timestamp) > options.endDate) {
        return false;
      }

      // Confidence filter
      if (options?.minConfidence && s.confidence < options.minConfidence) {
        return false;
      }

      return true;
    });
  }

  /**
   * Export data for backup or analysis
   */
  exportData(): {
    sightings: BirdSighting[];
    lifeList: string[];
    stats: {
      totalSightings: number;
      speciesCount: number;
      topSpecies: Array<{ species: string; count: number }>;
    };
  } {
    return {
      sightings: this.state.sightings,
      lifeList: this.state.lifeList,
      stats: {
        totalSightings: this.state.sightings.length,
        speciesCount: this.state.lifeList.length,
        topSpecies: this.getTopSpecies(10),
      },
    };
  }

  /**
   * Get summary for dashboard
   */
  getSummary(): {
    todaySightings: number;
    todaySpecies: number;
    totalSpecies: number;
    recentSightings: BirdSighting[];
    topToday: string | null;
  } {
    const todayStats = this.getDailyStats();
    const recent = this.getRecentSightings(5);
    
    return {
      todaySightings: todayStats.totalSightings,
      todaySpecies: todayStats.uniqueSpecies,
      totalSpecies: this.state.lifeList.length,
      recentSightings: recent,
      topToday: todayStats.species[0]?.species || null,
    };
  }
}

// Singleton instance
let birdTracker: BirdTracker | null = null;

export function getBirdTracker(): BirdTracker {
  if (!birdTracker) {
    birdTracker = new BirdTracker();
  }
  return birdTracker;
}
