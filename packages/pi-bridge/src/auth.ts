/**
 * Authentication Module
 * 
 * Provides HTTP Basic Auth and API key authentication for the dashboard and API.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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

/**
 * Initialize auth configuration from environment
 */
export function initAuth(): AuthConfig {
  const password = process.env.AUTH_PASSWORD || process.env.DASHBOARD_PASSWORD;
  const apiKey = process.env.API_KEY;
  
  authConfig = {
    enabled: process.env.AUTH_ENABLED !== 'false',
    username: process.env.AUTH_USERNAME || 'admin',
    password: password || '',
    apiKey: apiKey || generateApiKey(),
    realm: process.env.AUTH_REALM || 'BirdCam',
    excludePaths: ['/health', '/api/health'],
  };
  
  if (authConfig.enabled && !authConfig.password) {
    // Generate a random password if not set
    authConfig.password = generatePassword();
    console.log('[Auth] ⚠️  No AUTH_PASSWORD set - generated random password');
    console.log('[Auth] ════════════════════════════════════════');
    console.log(`[Auth]   Username: ${authConfig.username}`);
    console.log(`[Auth]   Password: ${authConfig.password}`);
    console.log(`[Auth]   API Key:  ${authConfig.apiKey}`);
    console.log('[Auth] ════════════════════════════════════════');
    console.log('[Auth] Add to .env: AUTH_PASSWORD=your_secure_password');
  }
  
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
  
  // Skip excluded paths
  if (authConfig.excludePaths.some(path => req.path === path || req.path.startsWith(path + '/'))) {
    return next();
  }
  
  // Check authentication
  if (isAuthenticated(req)) {
    return next();
  }
  
  // Request authentication
  res.setHeader('WWW-Authenticate', `Basic realm="${authConfig.realm}"`);
  res.status(401).json({ 
    error: 'Authentication required',
    hint: 'Use Basic Auth or X-API-Key header'
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
