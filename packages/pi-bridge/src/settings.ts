/**
 * Settings Module
 * 
 * Manages persistent camera and stream settings.
 * Settings are stored in a JSON file and can be modified via API.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

const SETTINGS_DIR = join(homedir(), '.birdcam');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');

export interface VideoSettings {
  // Output settings (FFmpeg transcoding)
  outputResolution: '1080p' | '720p' | '480p' | 'source' | 'custom';
  customWidth?: number;
  customHeight?: number;
  outputFps: number;          // 0 = source fps
  outputBitrate: string;      // e.g., "2000k", "4000k"
  qualityPreset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium';
  
  // HLS settings
  hlsSegmentDuration: number;
  hlsPlaylistSize: number;
  
  // Audio settings
  audioBitrate: string;       // e.g., "128k"
  audioEnabled: boolean;
}

export interface CameraSettings {
  // ONVIF camera source settings (if supported)
  sourceResolution?: string;  // e.g., "1920x1080"
  sourceFps?: number;
  sourceGovLength?: number;   // GOP length
  sourceBitrate?: number;     // kbps
}

export interface AllSettings {
  video: VideoSettings;
  camera: CameraSettings;
  lastModified: string;
}

const DEFAULT_SETTINGS: AllSettings = {
  video: {
    outputResolution: 'source',
    outputFps: 0,
    outputBitrate: '2000k',
    qualityPreset: 'ultrafast',
    hlsSegmentDuration: 2,
    hlsPlaylistSize: 5,
    audioBitrate: '128k',
    audioEnabled: true,
  },
  camera: {},
  lastModified: new Date().toISOString(),
};

// Resolution presets
export const RESOLUTION_PRESETS: Record<string, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
  '360p': { width: 640, height: 360 },
};

class SettingsManager extends EventEmitter {
  private settings: AllSettings;
  private loaded = false;

  constructor() {
    super();
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /**
   * Load settings from file
   */
  load(): AllSettings {
    if (this.loaded) {
      return this.settings;
    }

    try {
      // Ensure settings directory exists
      if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true });
      }

      if (existsSync(SETTINGS_FILE)) {
        const data = readFileSync(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(data) as Partial<AllSettings>;
        
        // Merge with defaults to handle new fields
        this.settings = {
          video: { ...DEFAULT_SETTINGS.video, ...saved.video },
          camera: { ...DEFAULT_SETTINGS.camera, ...saved.camera },
          lastModified: saved.lastModified || new Date().toISOString(),
        };
        
        console.log('[Settings] Loaded from', SETTINGS_FILE);
      } else {
        // Save defaults
        this.save();
        console.log('[Settings] Created default settings');
      }
    } catch (err) {
      console.error('[Settings] Failed to load:', (err as Error).message);
      this.settings = { ...DEFAULT_SETTINGS };
    }

    this.loaded = true;
    return this.settings;
  }

  /**
   * Save settings to file
   */
  save(): void {
    try {
      if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true });
      }
      
      this.settings.lastModified = new Date().toISOString();
      writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
      console.log('[Settings] Saved to', SETTINGS_FILE);
    } catch (err) {
      console.error('[Settings] Failed to save:', (err as Error).message);
    }
  }

  /**
   * Get all settings
   */
  getAll(): AllSettings {
    if (!this.loaded) {
      this.load();
    }
    return { ...this.settings };
  }

  /**
   * Get video settings
   */
  getVideo(): VideoSettings {
    if (!this.loaded) {
      this.load();
    }
    return { ...this.settings.video };
  }

  /**
   * Get camera settings
   */
  getCamera(): CameraSettings {
    if (!this.loaded) {
      this.load();
    }
    return { ...this.settings.camera };
  }

  /**
   * Update video settings
   */
  updateVideo(updates: Partial<VideoSettings>): VideoSettings {
    if (!this.loaded) {
      this.load();
    }

    // Validate and sanitize
    if (updates.outputFps !== undefined) {
      updates.outputFps = Math.max(0, Math.min(60, updates.outputFps));
    }
    if (updates.hlsSegmentDuration !== undefined) {
      updates.hlsSegmentDuration = Math.max(1, Math.min(10, updates.hlsSegmentDuration));
    }
    if (updates.hlsPlaylistSize !== undefined) {
      updates.hlsPlaylistSize = Math.max(2, Math.min(20, updates.hlsPlaylistSize));
    }
    if (updates.customWidth !== undefined) {
      updates.customWidth = Math.max(320, Math.min(3840, updates.customWidth));
    }
    if (updates.customHeight !== undefined) {
      updates.customHeight = Math.max(240, Math.min(2160, updates.customHeight));
    }

    this.settings.video = { ...this.settings.video, ...updates };
    this.save();
    this.emit('videoSettingsChanged', this.settings.video);
    
    return { ...this.settings.video };
  }

  /**
   * Update camera settings
   */
  updateCamera(updates: Partial<CameraSettings>): CameraSettings {
    if (!this.loaded) {
      this.load();
    }

    this.settings.camera = { ...this.settings.camera, ...updates };
    this.save();
    this.emit('cameraSettingsChanged', this.settings.camera);
    
    return { ...this.settings.camera };
  }

  /**
   * Reset to defaults
   */
  reset(): AllSettings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.emit('settingsReset', this.settings);
    return { ...this.settings };
  }

  /**
   * Get FFmpeg output options based on current settings
   */
  getFfmpegOutputOptions(): string[] {
    const video = this.getVideo();
    const options: string[] = [];

    // Video codec
    options.push('-c:v', 'libx264');
    options.push('-preset', video.qualityPreset);
    options.push('-tune', 'zerolatency');

    // Bitrate
    options.push('-b:v', video.outputBitrate);
    options.push('-maxrate', video.outputBitrate);
    const bitrateNum = parseInt(video.outputBitrate);
    options.push('-bufsize', `${bitrateNum * 2}k`);

    // Resolution
    if (video.outputResolution !== 'source') {
      let width: number, height: number;
      
      if (video.outputResolution === 'custom' && video.customWidth && video.customHeight) {
        width = video.customWidth;
        height = video.customHeight;
      } else if (RESOLUTION_PRESETS[video.outputResolution]) {
        const preset = RESOLUTION_PRESETS[video.outputResolution];
        width = preset.width;
        height = preset.height;
      } else {
        // Default to source
        width = 0;
        height = 0;
      }

      if (width > 0 && height > 0) {
        // Use scale filter with even dimensions (required by x264)
        options.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`);
      }
    }

    // FPS limit
    if (video.outputFps > 0) {
      options.push('-r', video.outputFps.toString());
    }

    // Audio
    if (video.audioEnabled) {
      options.push('-c:a', 'aac');
      options.push('-b:a', video.audioBitrate);
      options.push('-ar', '44100');
    } else {
      options.push('-an');
    }

    // HLS options
    options.push('-f', 'hls');
    options.push('-hls_time', video.hlsSegmentDuration.toString());
    options.push('-hls_list_size', video.hlsPlaylistSize.toString());
    options.push('-hls_flags', 'delete_segments+append_list');

    return options;
  }

  /**
   * Get resolution dimensions from settings
   */
  getOutputDimensions(): { width: number; height: number } | null {
    const video = this.getVideo();
    
    if (video.outputResolution === 'source') {
      return null;
    }
    
    if (video.outputResolution === 'custom' && video.customWidth && video.customHeight) {
      return { width: video.customWidth, height: video.customHeight };
    }
    
    return RESOLUTION_PRESETS[video.outputResolution] || null;
  }
}

// Singleton instance
const settingsManager = new SettingsManager();

export function getSettings(): SettingsManager {
  return settingsManager;
}

export { settingsManager };
