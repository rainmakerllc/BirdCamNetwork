/**
 * PTZ Preset Management Module
 * 
 * Enhanced preset management with named presets, scheduling, and patrol mode.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { PtzController } from './ptz.js';
import type { AmcrestPtzController } from './amcrest-ptz.js';

export interface SavedPreset {
  id: string;
  name: string;
  description?: string;
  token: string;         // Camera's internal preset token
  createdAt: string;
  lastUsed?: string;
  thumbnail?: string;    // Base64 or path to thumbnail
  tags?: string[];       // e.g., ['feeder', 'morning', 'birds']
}

export interface PatrolConfig {
  enabled: boolean;
  presets: string[];     // Preset IDs in order
  dwellSeconds: number;  // Time at each preset
  loop: boolean;
}

export interface ScheduledPreset {
  id: string;
  presetId: string;
  cronExpression: string; // e.g., "0 6 * * *" for 6 AM daily
  enabled: boolean;
  name?: string;
}

export interface PresetManagerState {
  presets: SavedPreset[];
  patrol: PatrolConfig;
  scheduled: ScheduledPreset[];
}

const DEFAULT_STATE: PresetManagerState = {
  presets: [],
  patrol: {
    enabled: false,
    presets: [],
    dwellSeconds: 30,
    loop: true,
  },
  scheduled: [],
};

export class PresetManager {
  private state: PresetManagerState;
  private statePath: string;
  private ptzController: PtzController | AmcrestPtzController | null = null;
  private patrolTimer: NodeJS.Timeout | null = null;
  private patrolIndex: number = 0;
  private scheduleTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(stateDir?: string) {
    const dir = stateDir || join(homedir(), '.birdcam');
    this.statePath = join(dir, 'ptz-presets.json');
    this.state = this.loadState();
  }

  private loadState(): PresetManagerState {
    try {
      if (existsSync(this.statePath)) {
        const data = readFileSync(this.statePath, 'utf-8');
        return { ...DEFAULT_STATE, ...JSON.parse(data) };
      }
    } catch (err) {
      console.warn('[PresetManager] Failed to load state:', (err as Error).message);
    }
    return { ...DEFAULT_STATE };
  }

  private saveState(): void {
    try {
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('[PresetManager] Failed to save state:', (err as Error).message);
    }
  }

  /**
   * Set the PTZ controller to use
   */
  setPtzController(controller: PtzController | AmcrestPtzController): void {
    this.ptzController = controller;
    console.log('[PresetManager] PTZ controller set');
  }

  /**
   * Get all saved presets
   */
  getPresets(): SavedPreset[] {
    return [...this.state.presets];
  }

  /**
   * Get a preset by ID
   */
  getPreset(id: string): SavedPreset | undefined {
    return this.state.presets.find(p => p.id === id);
  }

  /**
   * Add or update a preset
   */
  async savePreset(preset: Omit<SavedPreset, 'createdAt'> & { createdAt?: string }): Promise<SavedPreset> {
    const existing = this.state.presets.findIndex(p => p.id === preset.id);
    
    const savedPreset: SavedPreset = {
      ...preset,
      createdAt: preset.createdAt || new Date().toISOString(),
    };

    if (existing >= 0) {
      this.state.presets[existing] = savedPreset;
    } else {
      this.state.presets.push(savedPreset);
    }

    this.saveState();
    console.log(`[PresetManager] Saved preset: ${savedPreset.name} (${savedPreset.id})`);
    return savedPreset;
  }

  /**
   * Create a new preset from current camera position
   */
  async createPresetFromCurrent(name: string, description?: string): Promise<SavedPreset | null> {
    if (!this.ptzController) {
      console.error('[PresetManager] No PTZ controller set');
      return null;
    }

    // Save position on camera
    const token = await this.ptzController.setPreset(name);
    if (!token) {
      console.error('[PresetManager] Failed to save preset on camera');
      return null;
    }

    const preset: SavedPreset = {
      id: `preset_${Date.now()}`,
      name,
      description,
      token,
      createdAt: new Date().toISOString(),
      tags: [],
    };

    this.state.presets.push(preset);
    this.saveState();

    console.log(`[PresetManager] Created preset: ${name} -> ${token}`);
    return preset;
  }

  /**
   * Go to a preset by ID
   */
  async gotoPreset(id: string): Promise<boolean> {
    if (!this.ptzController) {
      console.error('[PresetManager] No PTZ controller set');
      return false;
    }

    const preset = this.state.presets.find(p => p.id === id);
    if (!preset) {
      console.error(`[PresetManager] Preset not found: ${id}`);
      return false;
    }

    const success = await this.ptzController.gotoPreset(preset.token);
    
    if (success) {
      // Update last used
      preset.lastUsed = new Date().toISOString();
      this.saveState();
    }

    return success;
  }

  /**
   * Delete a preset
   */
  deletePreset(id: string): boolean {
    const index = this.state.presets.findIndex(p => p.id === id);
    if (index >= 0) {
      this.state.presets.splice(index, 1);
      
      // Remove from patrol if present
      this.state.patrol.presets = this.state.patrol.presets.filter(p => p !== id);
      
      // Remove from scheduled
      this.state.scheduled = this.state.scheduled.filter(s => s.presetId !== id);
      
      this.saveState();
      console.log(`[PresetManager] Deleted preset: ${id}`);
      return true;
    }
    return false;
  }

  // ==================== Patrol Mode ====================

  /**
   * Get patrol configuration
   */
  getPatrolConfig(): PatrolConfig {
    return { ...this.state.patrol };
  }

  /**
   * Update patrol configuration
   */
  setPatrolConfig(config: Partial<PatrolConfig>): PatrolConfig {
    this.state.patrol = { ...this.state.patrol, ...config };
    this.saveState();
    
    // Restart patrol if running
    if (this.patrolTimer && config.enabled !== false) {
      this.stopPatrol();
      this.startPatrol();
    }
    
    return this.state.patrol;
  }

  /**
   * Start patrol mode
   */
  startPatrol(): boolean {
    if (!this.ptzController) {
      console.error('[PresetManager] No PTZ controller set');
      return false;
    }

    if (this.state.patrol.presets.length === 0) {
      console.error('[PresetManager] No presets configured for patrol');
      return false;
    }

    this.state.patrol.enabled = true;
    this.patrolIndex = 0;
    this.saveState();

    console.log(`[PresetManager] Starting patrol with ${this.state.patrol.presets.length} presets`);
    this.runPatrolStep();
    return true;
  }

  /**
   * Stop patrol mode
   */
  stopPatrol(): void {
    if (this.patrolTimer) {
      clearTimeout(this.patrolTimer);
      this.patrolTimer = null;
    }
    this.state.patrol.enabled = false;
    this.saveState();
    console.log('[PresetManager] Patrol stopped');
  }

  /**
   * Check if patrol is running
   */
  isPatrolling(): boolean {
    return this.patrolTimer !== null;
  }

  private async runPatrolStep(): Promise<void> {
    if (!this.state.patrol.enabled || this.state.patrol.presets.length === 0) {
      return;
    }

    const presetId = this.state.patrol.presets[this.patrolIndex];
    console.log(`[PresetManager] Patrol step ${this.patrolIndex + 1}/${this.state.patrol.presets.length}: ${presetId}`);

    await this.gotoPreset(presetId);

    // Move to next preset
    this.patrolIndex++;
    if (this.patrolIndex >= this.state.patrol.presets.length) {
      if (this.state.patrol.loop) {
        this.patrolIndex = 0;
      } else {
        this.stopPatrol();
        return;
      }
    }

    // Schedule next step
    this.patrolTimer = setTimeout(
      () => this.runPatrolStep(),
      this.state.patrol.dwellSeconds * 1000
    );
  }

  // ==================== Scheduled Presets ====================

  /**
   * Get scheduled presets
   */
  getScheduledPresets(): ScheduledPreset[] {
    return [...this.state.scheduled];
  }

  /**
   * Add a scheduled preset
   */
  addScheduledPreset(schedule: Omit<ScheduledPreset, 'id'>): ScheduledPreset {
    const scheduled: ScheduledPreset = {
      ...schedule,
      id: `schedule_${Date.now()}`,
    };

    this.state.scheduled.push(scheduled);
    this.saveState();

    if (scheduled.enabled) {
      this.setupScheduleTimer(scheduled);
    }

    console.log(`[PresetManager] Added scheduled preset: ${scheduled.name || scheduled.id}`);
    return scheduled;
  }

  /**
   * Remove a scheduled preset
   */
  removeScheduledPreset(id: string): boolean {
    const index = this.state.scheduled.findIndex(s => s.id === id);
    if (index >= 0) {
      this.state.scheduled.splice(index, 1);
      this.saveState();

      // Clear timer if exists
      const timer = this.scheduleTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.scheduleTimers.delete(id);
      }

      return true;
    }
    return false;
  }

  /**
   * Initialize all schedule timers
   */
  initSchedules(): void {
    for (const schedule of this.state.scheduled) {
      if (schedule.enabled) {
        this.setupScheduleTimer(schedule);
      }
    }
  }

  private setupScheduleTimer(schedule: ScheduledPreset): void {
    // Simple implementation: parse cron and set timeout to next occurrence
    // For production, use a proper cron library like node-cron
    const nextRun = this.getNextCronTime(schedule.cronExpression);
    if (!nextRun) return;

    const delay = nextRun.getTime() - Date.now();
    if (delay <= 0) return;

    console.log(`[PresetManager] Scheduling ${schedule.name || schedule.id} for ${nextRun.toISOString()}`);

    const timer = setTimeout(async () => {
      console.log(`[PresetManager] Executing scheduled preset: ${schedule.name || schedule.id}`);
      await this.gotoPreset(schedule.presetId);
      
      // Reschedule for next occurrence
      this.setupScheduleTimer(schedule);
    }, delay);

    this.scheduleTimers.set(schedule.id, timer);
  }

  private getNextCronTime(cron: string): Date | null {
    // Very basic cron parser for common patterns
    // Format: minute hour day month weekday
    const parts = cron.split(' ');
    if (parts.length !== 5) return null;

    const [minute, hour, day, month, weekday] = parts;
    const now = new Date();
    const next = new Date(now);

    // Handle simple cases: specific hour and minute
    if (minute !== '*' && hour !== '*') {
      next.setHours(parseInt(hour, 10));
      next.setMinutes(parseInt(minute, 10));
      next.setSeconds(0);
      next.setMilliseconds(0);

      // If time has passed today, move to tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      return next;
    }

    // Default: run in 1 hour
    next.setTime(now.getTime() + 60 * 60 * 1000);
    return next;
  }

  /**
   * Cleanup and stop all timers
   */
  destroy(): void {
    this.stopPatrol();
    for (const timer of this.scheduleTimers.values()) {
      clearTimeout(timer);
    }
    this.scheduleTimers.clear();
  }
}

// Singleton instance
let presetManager: PresetManager | null = null;

export function getPresetManager(): PresetManager {
  if (!presetManager) {
    presetManager = new PresetManager();
  }
  return presetManager;
}
