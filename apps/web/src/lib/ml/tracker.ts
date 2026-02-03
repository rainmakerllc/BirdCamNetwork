// Simple IoU-based tracker for deduplicating bird detections

export interface BBox {
  x: number;  // normalized 0-1
  y: number;
  w: number;
  h: number;
}

export interface Track {
  id: string;
  firstSeen: number;  // timestamp ms
  lastSeen: number;
  bbox: BBox;
  speciesHistory: Array<{ label: string; score: number; ts: number }>;
  bestSpecies: string;
  bestConfidence: number;
  emittedAt: number | null;  // last emit timestamp
}

export interface TrackerConfig {
  iouThreshold: number;       // min IoU to match (default 0.3)
  maxAge: number;             // max ms since last seen before removing (default 2000)
  minTrackDuration: number;   // min ms before emitting event (default 1500)
  minConfidence: number;      // min species confidence to emit (default 0.55)
  emitCooldown: number;       // min ms between emits for same track (default 10000)
  speciesWindowSize: number;  // frames to average species over (default 5)
}

const DEFAULT_CONFIG: TrackerConfig = {
  iouThreshold: 0.3,
  maxAge: 2000,
  minTrackDuration: 1500,
  minConfidence: 0.55,
  emitCooldown: 10000,
  speciesWindowSize: 5,
};

export class BirdTracker {
  private tracks: Map<string, Track> = new Map();
  private nextId = 1;
  private config: TrackerConfig;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Calculate Intersection over Union
  private iou(a: BBox, b: BBox): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);

    if (x2 <= x1 || y2 <= y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    const union = areaA + areaB - intersection;

    return intersection / union;
  }

  // Get smoothed species from history
  private getSmoothedSpecies(history: Track['speciesHistory']): { label: string; confidence: number } {
    if (history.length === 0) return { label: 'Unknown', confidence: 0 };

    // Get last N entries
    const recent = history.slice(-this.config.speciesWindowSize);
    
    // Count votes per species, weighted by confidence
    const votes = new Map<string, number>();
    for (const entry of recent) {
      const current = votes.get(entry.label) || 0;
      votes.set(entry.label, current + entry.score);
    }

    // Find winner
    let bestLabel = 'Unknown';
    let bestScore = 0;
    for (const [label, score] of votes) {
      if (score > bestScore) {
        bestLabel = label;
        bestScore = score;
      }
    }

    // Average confidence for the winner
    const winnerEntries = recent.filter(e => e.label === bestLabel);
    const avgConfidence = winnerEntries.reduce((sum, e) => sum + e.score, 0) / winnerEntries.length;

    return { label: bestLabel, confidence: avgConfidence };
  }

  // Update tracks with new detections
  update(
    detections: Array<{ bbox: BBox; species?: string; confidence?: number }>,
    timestamp: number = Date.now()
  ): { tracks: Track[]; toEmit: Track[] } {
    const now = timestamp;
    const toEmit: Track[] = [];

    // Match detections to existing tracks
    const unmatched: typeof detections = [];
    const matchedTrackIds = new Set<string>();

    for (const det of detections) {
      let bestMatch: Track | null = null;
      let bestIou = 0;

      for (const [id, track] of this.tracks) {
        if (matchedTrackIds.has(id)) continue;
        
        const score = this.iou(det.bbox, track.bbox);
        if (score > bestIou && score >= this.config.iouThreshold) {
          bestIou = score;
          bestMatch = track;
        }
      }

      if (bestMatch) {
        // Update existing track
        matchedTrackIds.add(bestMatch.id);
        bestMatch.bbox = det.bbox;
        bestMatch.lastSeen = now;
        
        if (det.species && det.confidence !== undefined) {
          bestMatch.speciesHistory.push({
            label: det.species,
            score: det.confidence,
            ts: now,
          });
          
          // Update best species
          const smoothed = this.getSmoothedSpecies(bestMatch.speciesHistory);
          bestMatch.bestSpecies = smoothed.label;
          bestMatch.bestConfidence = smoothed.confidence;
        }

        // Check if should emit
        const duration = now - bestMatch.firstSeen;
        const sinceLastEmit = bestMatch.emittedAt ? now - bestMatch.emittedAt : Infinity;
        
        if (
          duration >= this.config.minTrackDuration &&
          bestMatch.bestConfidence >= this.config.minConfidence &&
          sinceLastEmit >= this.config.emitCooldown
        ) {
          bestMatch.emittedAt = now;
          toEmit.push({ ...bestMatch });
        }
      } else {
        unmatched.push(det);
      }
    }

    // Create new tracks for unmatched detections
    for (const det of unmatched) {
      const id = `track_${this.nextId++}`;
      const track: Track = {
        id,
        firstSeen: now,
        lastSeen: now,
        bbox: det.bbox,
        speciesHistory: det.species && det.confidence !== undefined
          ? [{ label: det.species, score: det.confidence, ts: now }]
          : [],
        bestSpecies: det.species || 'Unknown',
        bestConfidence: det.confidence || 0,
        emittedAt: null,
      };
      this.tracks.set(id, track);
    }

    // Remove stale tracks
    for (const [id, track] of this.tracks) {
      if (now - track.lastSeen > this.config.maxAge) {
        this.tracks.delete(id);
      }
    }

    return {
      tracks: Array.from(this.tracks.values()),
      toEmit,
    };
  }

  // Get current tracks
  getTracks(): Track[] {
    return Array.from(this.tracks.values());
  }

  // Clear all tracks
  clear() {
    this.tracks.clear();
    this.nextId = 1;
  }

  // Update config
  setConfig(config: Partial<TrackerConfig>) {
    this.config = { ...this.config, ...config };
  }
}
