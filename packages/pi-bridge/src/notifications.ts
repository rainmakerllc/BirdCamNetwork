/**
 * Notifications Module
 * 
 * Handles push notifications and alerts for bird sightings,
 * motion events, and system status changes.
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import https from 'https';

const SETTINGS_DIR = join(homedir(), '.birdcam');
const NOTIFICATIONS_FILE = join(SETTINGS_DIR, 'notifications.json');

export interface NotificationSettings {
  enabled: boolean;
  
  // Notification triggers
  onBirdDetected: boolean;
  onNewSpecies: boolean;      // First time seeing a species
  onRareBird: boolean;        // Configurable rare species list
  onMotion: boolean;
  onCameraOffline: boolean;
  onStorageLow: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string;    // "22:00"
  quietHoursEnd: string;      // "07:00"
  
  // Rate limiting
  minIntervalSeconds: number; // Minimum time between notifications
  maxPerHour: number;
  
  // Push services
  pushover?: {
    enabled: boolean;
    userKey: string;
    apiToken: string;
    priority: number;         // -2 to 2
  };
  
  ntfy?: {
    enabled: boolean;
    topic: string;
    server?: string;          // Default: ntfy.sh
  };
  
  webhook?: {
    enabled: boolean;
    url: string;
    headers?: Record<string, string>;
  };
  
  // Species filters
  rareSpecies: string[];      // Species that trigger rare bird alerts
  ignoredSpecies: string[];   // Species to never notify about
}

export interface NotificationPayload {
  type: 'bird_detected' | 'new_species' | 'rare_bird' | 'motion' | 'camera_offline' | 'storage_low' | 'custom';
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  imageUrl?: string;
  data?: Record<string, any>;
}

interface NotificationLog {
  timestamp: string;
  type: string;
  sent: boolean;
  error?: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  onBirdDetected: true,
  onNewSpecies: true,
  onRareBird: true,
  onMotion: false,
  onCameraOffline: true,
  onStorageLow: true,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  minIntervalSeconds: 60,
  maxPerHour: 20,
  rareSpecies: [],
  ignoredSpecies: [],
};

class NotificationManager extends EventEmitter {
  private settings: NotificationSettings;
  private recentNotifications: NotificationLog[] = [];
  private loaded = false;

  constructor() {
    super();
    this.settings = { ...DEFAULT_SETTINGS };
  }

  private load(): void {
    if (this.loaded) return;

    try {
      if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true });
      }

      if (existsSync(NOTIFICATIONS_FILE)) {
        const data = readFileSync(NOTIFICATIONS_FILE, 'utf-8');
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (err) {
      console.warn('[Notifications] Failed to load settings:', (err as Error).message);
    }

    this.loaded = true;
  }

  private save(): void {
    try {
      if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true });
      }
      writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.error('[Notifications] Failed to save:', (err as Error).message);
    }
  }

  /**
   * Get current notification settings
   */
  getSettings(): NotificationSettings {
    this.load();
    return { ...this.settings };
  }

  /**
   * Update notification settings
   */
  updateSettings(updates: Partial<NotificationSettings>): NotificationSettings {
    this.load();
    this.settings = { ...this.settings, ...updates };
    this.save();
    return { ...this.settings };
  }

  /**
   * Check if we're in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.settings.quietHoursEnabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = this.settings.quietHoursStart.split(':').map(Number);
    const [endH, endM] = this.settings.quietHoursEnd.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Check rate limiting
   */
  private isRateLimited(): boolean {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const minInterval = this.settings.minIntervalSeconds * 1000;

    // Clean old entries
    this.recentNotifications = this.recentNotifications.filter(
      n => new Date(n.timestamp).getTime() > oneHourAgo
    );

    // Check max per hour
    if (this.recentNotifications.length >= this.settings.maxPerHour) {
      return true;
    }

    // Check minimum interval
    const lastNotification = this.recentNotifications[this.recentNotifications.length - 1];
    if (lastNotification) {
      const lastTime = new Date(lastNotification.timestamp).getTime();
      if (now - lastTime < minInterval) {
        return true;
      }
    }

    return false;
  }

  /**
   * Send a notification
   */
  async send(payload: NotificationPayload): Promise<boolean> {
    this.load();

    if (!this.settings.enabled) {
      console.log('[Notifications] Disabled, skipping');
      return false;
    }

    // Check quiet hours (unless urgent)
    if (payload.priority !== 'urgent' && this.isQuietHours()) {
      console.log('[Notifications] Quiet hours, skipping');
      return false;
    }

    // Check rate limiting
    if (this.isRateLimited()) {
      console.log('[Notifications] Rate limited, skipping');
      return false;
    }

    const results: boolean[] = [];

    // Send via configured services
    if (this.settings.pushover?.enabled) {
      results.push(await this.sendPushover(payload));
    }

    if (this.settings.ntfy?.enabled) {
      results.push(await this.sendNtfy(payload));
    }

    if (this.settings.webhook?.enabled) {
      results.push(await this.sendWebhook(payload));
    }

    const success = results.some(r => r);

    // Log notification
    this.recentNotifications.push({
      timestamp: new Date().toISOString(),
      type: payload.type,
      sent: success,
    });

    this.emit('notification', { payload, success });

    return success;
  }

  /**
   * Send via Pushover
   */
  private async sendPushover(payload: NotificationPayload): Promise<boolean> {
    const config = this.settings.pushover;
    if (!config) return false;

    const priority = payload.priority === 'urgent' ? 2 : 
                     payload.priority === 'high' ? 1 : 
                     payload.priority === 'low' ? -1 : 0;

    const data = new URLSearchParams({
      token: config.apiToken,
      user: config.userKey,
      title: payload.title,
      message: payload.message,
      priority: String(Math.max(-2, Math.min(2, priority))),
    });

    if (payload.imageUrl) {
      data.append('url', payload.imageUrl);
    }

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.pushover.net',
        port: 443,
        path: '/1/messages.json',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', (err) => {
        console.error('[Notifications] Pushover error:', err.message);
        resolve(false);
      });

      req.write(data.toString());
      req.end();
    });
  }

  /**
   * Send via ntfy.sh
   */
  private async sendNtfy(payload: NotificationPayload): Promise<boolean> {
    const config = this.settings.ntfy;
    if (!config) return false;

    const server = config.server || 'ntfy.sh';
    const priority = payload.priority === 'urgent' ? '5' :
                     payload.priority === 'high' ? '4' :
                     payload.priority === 'low' ? '2' : '3';

    return new Promise((resolve) => {
      const req = https.request({
        hostname: server,
        port: 443,
        path: `/${config.topic}`,
        method: 'POST',
        headers: {
          'Title': payload.title,
          'Priority': priority,
          'Tags': payload.type === 'bird_detected' ? 'bird' : 
                  payload.type === 'new_species' ? 'tada,bird' : 'camera',
        },
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', (err) => {
        console.error('[Notifications] ntfy error:', err.message);
        resolve(false);
      });

      req.write(payload.message);
      req.end();
    });
  }

  /**
   * Send via webhook
   */
  private async sendWebhook(payload: NotificationPayload): Promise<boolean> {
    const config = this.settings.webhook;
    if (!config) return false;

    const url = new URL(config.url);

    return new Promise((resolve) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
      }, (res) => {
        const code = res.statusCode || 0;
        resolve(code >= 200 && code < 300);
      });

      req.on('error', (err) => {
        console.error('[Notifications] Webhook error:', err.message);
        resolve(false);
      });

      req.write(JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }));
      req.end();
    });
  }

  // ==================== Convenience Methods ====================

  /**
   * Notify about a bird detection
   */
  async notifyBirdDetected(species: string, confidence: number, isNew: boolean, isRare: boolean): Promise<void> {
    this.load();

    // Check if species is ignored
    if (this.settings.ignoredSpecies.includes(species.toLowerCase())) {
      return;
    }

    // Determine notification type and check if enabled
    if (isNew && this.settings.onNewSpecies) {
      await this.send({
        type: 'new_species',
        title: '🎉 New Species!',
        message: `First sighting of ${species}! (${(confidence * 100).toFixed(0)}% confidence)`,
        priority: 'high',
        data: { species, confidence, isNew: true },
      });
    } else if (isRare && this.settings.onRareBird) {
      await this.send({
        type: 'rare_bird',
        title: '⭐ Rare Bird Alert!',
        message: `${species} spotted! (${(confidence * 100).toFixed(0)}% confidence)`,
        priority: 'high',
        data: { species, confidence, isRare: true },
      });
    } else if (this.settings.onBirdDetected) {
      await this.send({
        type: 'bird_detected',
        title: '🐦 Bird Detected',
        message: `${species} (${(confidence * 100).toFixed(0)}% confidence)`,
        priority: 'normal',
        data: { species, confidence },
      });
    }
  }

  /**
   * Notify about motion detection
   */
  async notifyMotion(): Promise<void> {
    this.load();
    if (!this.settings.onMotion) return;

    await this.send({
      type: 'motion',
      title: '📹 Motion Detected',
      message: 'Movement detected on camera',
      priority: 'low',
    });
  }

  /**
   * Notify about camera going offline
   */
  async notifyCameraOffline(): Promise<void> {
    this.load();
    if (!this.settings.onCameraOffline) return;

    await this.send({
      type: 'camera_offline',
      title: '⚠️ Camera Offline',
      message: 'The camera has gone offline',
      priority: 'urgent',
    });
  }

  /**
   * Notify about low storage
   */
  async notifyStorageLow(usedPercent: number): Promise<void> {
    this.load();
    if (!this.settings.onStorageLow) return;

    await this.send({
      type: 'storage_low',
      title: '💾 Storage Low',
      message: `Storage is ${usedPercent.toFixed(0)}% full`,
      priority: usedPercent > 95 ? 'high' : 'normal',
      data: { usedPercent },
    });
  }

  /**
   * Check if a species is configured as rare
   */
  isRareSpecies(species: string): boolean {
    this.load();
    return this.settings.rareSpecies.some(
      r => r.toLowerCase() === species.toLowerCase()
    );
  }
}

// Singleton
let notificationManager: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!notificationManager) {
    notificationManager = new NotificationManager();
  }
  return notificationManager;
}
