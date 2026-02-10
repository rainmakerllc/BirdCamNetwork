/**
 * Authentication Module
 * 
 * Provides HTTP Basic Auth and API key authentication for the dashboard and API.
 * Auto-generates and persists secure API keys for easy access.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AuthConfig {
  enabled: boolean;
  username: string;
  password: string;
  apiKey: string;
  realm: string;
  excludePaths: string[];  // Paths that don't require auth (e.g., health check)
}

const DEFAULT_CONFIG: AuthConfig = {
  enabled: true,
  username: 'admin',
  password: '',  // Must be set in env
  apiKey: '',    // Auto-generated if not set
  realm: 'BirdCam',
  excludePaths: ['/health'],  // Health check for monitoring
};

let authConfig: AuthConfig = { ...DEFAULT_CONFIG };

// Path for persisted API key
const BIRDCAM_DIR = join(homedir(), '.birdcam');
const API_KEY_FILE = join(BIRDCAM_DIR, 'api-key.txt');
const CREDENTIALS_FILE = join(BIRDCAM_DIR, 'credentials.txt');

/**
 * Load or generate API key, persisting to file
 */
function loadOrCreateApiKey(): string {
  // 1. Check environment variable first (highest priority)
  if (process.env.API_KEY) {
    return process.env.API_KEY;
  }
  
  // 2. Check if key file exists
  if (existsSync(API_KEY_FILE)) {
    try {
      const savedKey = readFileSync(API_KEY_FILE, 'utf-8').trim();
      if (savedKey && savedKey.startsWith('birdcam_')) {
        console.log('[Auth] 🔑 Loaded API key from', API_KEY_FILE);
        return savedKey;
      }
    } catch (err) {
      console.warn('[Auth] ⚠️  Could not read API key file:', err);
    }
  }
  
  // 3. Generate new secure API key
  const newKey = generateApiKey();
  
  // 4. Save to file
  try {
    if (!existsSync(BIRDCAM_DIR)) {
      mkdirSync(BIRDCAM_DIR, { recursive: true });
    }
    writeFileSync(API_KEY_FILE, newKey + '\n', { mode: 0o600 });
    console.log('[Auth] 🔑 Generated new API key and saved to', API_KEY_FILE);
  } catch (err) {
    console.warn('[Auth] ⚠️  Could not save API key file:', err);
  }
  
  return newKey;
}

/**
 * Save all credentials to a readable file
 */
function saveCredentialsFile(config: AuthConfig): void {
  try {
    if (!existsSync(BIRDCAM_DIR)) {
      mkdirSync(BIRDCAM_DIR, { recursive: true });
    }
    
    // Get hostname for URLs
    const hostname = process.env.HOSTNAME || 'birdnetwork';
    const port = process.env.HLS_PORT || '8080';
    const baseUrl = `http://${hostname}:${port}`;
    const dashboardUrl = `${baseUrl}/?api_key=${config.apiKey}`;
    
    // WebRTC stream URL for camera setup (this is what you'd put in external apps)
    const webrtcStreamUrl = `${baseUrl}/api/webrtc?api_key=${config.apiKey}`;
    const hlsStreamUrl = `${baseUrl}/stream.m3u8?api_key=${config.apiKey}`;
    const go2rtcUrl = `http://${hostname}:1984/stream.html?src=birdcam`;
    
    const content = `# ═══════════════════════════════════════════════════════════════
# BirdCam Credentials
# Generated: ${new Date().toISOString()}
# Keep this file secure!
# ═══════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# API KEY (use this for all authenticated requests)
# ─────────────────────────────────────────────────────────────────
API_KEY=${config.apiKey}

# ─────────────────────────────────────────────────────────────────
# BASIC AUTH (alternative to API key)
# ─────────────────────────────────────────────────────────────────
USERNAME=${config.username}
PASSWORD=${config.password}

# ═══════════════════════════════════════════════════════════════
# QUICK ACCESS URLS
# ═══════════════════════════════════════════════════════════════

# Dashboard (bookmark this!):
DASHBOARD_URL=${dashboardUrl}

# ─────────────────────────────────────────────────────────────────
# STREAM URLS (for camera setup on external apps/websites)
# ─────────────────────────────────────────────────────────────────

# HLS Stream (most compatible - works in browsers, VLC, etc):
HLS_STREAM_URL=${hlsStreamUrl}

# WebRTC Stream API (lowest latency):
WEBRTC_API_URL=${webrtcStreamUrl}

# go2rtc Direct (no auth required on local network):
GO2RTC_STREAM_URL=${go2rtcUrl}

# ─────────────────────────────────────────────────────────────────
# API EXAMPLES
# ─────────────────────────────────────────────────────────────────

# Using API key in URL:
# curl "${baseUrl}/health?api_key=${config.apiKey}"

# Using API key in header:
# curl -H "X-API-Key: ${config.apiKey}" ${baseUrl}/health

# Using Basic Auth:
# curl -u ${config.username}:${config.password} ${baseUrl}/health

# ═══════════════════════════════════════════════════════════════
`;
    
    writeFileSync(CREDENTIALS_FILE, content, { mode: 0o600 });
    console.log('[Auth] 📄 Credentials saved to', CREDENTIALS_FILE);
  } catch (err) {
    console.warn('[Auth] ⚠️  Could not save credentials file:', err);
  }
}

/**
 * Initialize auth configuration from environment
 */
export function initAuth(): AuthConfig {
  const password = process.env.AUTH_PASSWORD || process.env.DASHBOARD_PASSWORD;
  const apiKey = loadOrCreateApiKey();
  
  authConfig = {
    enabled: process.env.AUTH_ENABLED !== 'false',
    username: process.env.AUTH_USERNAME || 'admin',
    password: password || '',
    apiKey: apiKey,
    realm: process.env.AUTH_REALM || 'BirdCam',
    // Exclude health checks, HLS segments, test page, and stream from Basic Auth prompt
    // API key is still checked for sensitive endpoints
    excludePaths: ['/health', '/api/health', '/segment', '/test', '/stream'],
  };
  
  if (authConfig.enabled && !authConfig.password) {
    // Generate a random password if not set
    authConfig.password = generatePassword();
    console.log('[Auth] ⚠️  No AUTH_PASSWORD set - generated random password');
  }
  
  // Always save/update credentials file
  saveCredentialsFile(authConfig);
  
  // Display credentials on startup
  console.log('[Auth] ════════════════════════════════════════════════════════');
  console.log('[Auth]   🔐 Authentication Credentials');
  console.log('[Auth] ────────────────────────────────────────────────────────');
  console.log(`[Auth]   Username: ${authConfig.username}`);
  console.log(`[Auth]   Password: ${authConfig.password}`);
  console.log(`[Auth]   API Key:  ${authConfig.apiKey}`);
  console.log('[Auth] ────────────────────────────────────────────────────────');
  console.log(`[Auth]   📁 Saved to: ${CREDENTIALS_FILE}`);
  console.log(`[Auth]   🔗 Quick URL: http://localhost:8080/?api_key=${authConfig.apiKey}`);
  console.log('[Auth] ════════════════════════════════════════════════════════');
  
  return authConfig;
}

/**
 * Generate a random password
 */
function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  return 'birdcam_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Parse Basic Auth header
 */
function parseBasicAuth(header: string): { username: string; password: string } | null {
  if (!header.startsWith('Basic ')) return null;
  
  try {
    const base64 = header.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [username, ...passwordParts] = decoded.split(':');
    return { username, password: passwordParts.join(':') };
  } catch {
    return null;
  }
}

/**
 * Check if request is authenticated
 */
function isAuthenticated(req: Request): boolean {
  // Check API key in header or query
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;
  if (apiKey && secureCompare(apiKey, authConfig.apiKey)) {
    return true;
  }
  
  // Check Basic Auth
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const credentials = parseBasicAuth(authHeader);
    if (credentials) {
      const usernameMatch = secureCompare(credentials.username, authConfig.username);
      const passwordMatch = secureCompare(credentials.password, authConfig.password);
      return usernameMatch && passwordMatch;
    }
  }
  
  return false;
}

/**
 * Express middleware for authentication
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip if auth is disabled
  if (!authConfig.enabled) {
    return next();
  }
  
  // Skip excluded paths (exact match or prefix match)
  if (authConfig.excludePaths.some(path => req.path === path || req.path.startsWith(path))) {
    return next();
  }
  
  // Check authentication
  if (isAuthenticated(req)) {
    return next();
  }
  
  // Request authentication - only show Basic Auth prompt if no API key was attempted
  // (to avoid browser popup when using API key in URL)
  const attemptedApiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!attemptedApiKey) {
    res.setHeader('WWW-Authenticate', `Basic realm="${authConfig.realm}"`);
  }
  res.status(401).json({ 
    error: 'Authentication required',
    hint: attemptedApiKey ? 'Invalid API key' : 'Use ?api_key=YOUR_KEY or X-API-Key header'
  });
}

/**
 * Get current auth config (with password masked)
 */
export function getAuthConfig(): Omit<AuthConfig, 'password'> & { password: string } {
  return {
    ...authConfig,
    password: authConfig.password ? '********' : '(not set)',
  };
}

/**
 * Check if auth is properly configured
 */
export function isAuthConfigured(): boolean {
  return authConfig.enabled && !!authConfig.password;
}

/**
 * Get the API key (for displaying to user)
 */
export function getApiKey(): string {
  return authConfig.apiKey;
}

/**
 * Get the path to the credentials file
 */
export function getCredentialsFilePath(): string {
  return CREDENTIALS_FILE;
}

/**
 * Get the path to the API key file
 */
export function getApiKeyFilePath(): string {
  return API_KEY_FILE;
}

/**
 * Regenerate API key and save to file
 */
export function regenerateApiKey(): string {
  const newKey = generateApiKey();
  authConfig.apiKey = newKey;
  
  try {
    writeFileSync(API_KEY_FILE, newKey + '\n', { mode: 0o600 });
    saveCredentialsFile(authConfig);
    console.log('[Auth] 🔑 Regenerated API key');
  } catch (err) {
    console.warn('[Auth] ⚠️  Could not save new API key:', err);
  }
  
  return newKey;
}
