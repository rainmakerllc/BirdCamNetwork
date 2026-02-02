import { spawn, ChildProcess } from 'child_process';
import { config } from './config.js';

let tunnelProcess: ChildProcess | null = null;
let publicUrl: string | null = null;

export function getPublicUrl(): string | null {
  return publicUrl;
}

export async function startTunnel(): Promise<string> {
  if (!config.tunnel.enabled) {
    console.log('[Tunnel] Disabled, skipping');
    return `http://localhost:${config.hls.port}`;
  }

  if (!config.tunnel.token) {
    throw new Error('Cloudflare tunnel token not configured');
  }

  console.log('[Tunnel] Starting Cloudflare tunnel...');

  return new Promise((resolve, reject) => {
    // Use cloudflared with tunnel token
    // The token encodes the tunnel configuration including the public hostname
    tunnelProcess = spawn('cloudflared', [
      'tunnel',
      '--no-autoupdate',
      'run',
      '--token',
      config.tunnel.token,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // If we have a configured hostname, use that
        if (config.tunnel.hostname) {
          publicUrl = `https://${config.tunnel.hostname}`;
          console.log(`[Tunnel] Using configured hostname: ${publicUrl}`);
          resolve(publicUrl);
        } else {
          reject(new Error('Tunnel did not establish in time'));
        }
      }
    }, 30000);

    tunnelProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (config.debug) {
        console.log('[Tunnel]', output.trim());
      }

      // Look for connection established message
      if (output.includes('Registered tunnel connection') || output.includes('Connection registered')) {
        if (!resolved && config.tunnel.hostname) {
          resolved = true;
          clearTimeout(timeout);
          publicUrl = `https://${config.tunnel.hostname}`;
          console.log(`[Tunnel] Established: ${publicUrl}`);
          resolve(publicUrl);
        }
      }
    });

    tunnelProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (config.debug || output.includes('ERR')) {
        console.error('[Tunnel Error]', output.trim());
      }
    });

    tunnelProcess.on('error', (err) => {
      console.error('[Tunnel] Failed to start cloudflared:', err.message);
      console.log('[Tunnel] Make sure cloudflared is installed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    tunnelProcess.on('exit', (code) => {
      console.log(`[Tunnel] Process exited with code ${code}`);
      publicUrl = null;
    });
  });
}

export function stopTunnel(): void {
  if (tunnelProcess) {
    console.log('[Tunnel] Stopping...');
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
    publicUrl = null;
  }
}

// Alternative: Quick tunnel (generates random URL)
export async function startQuickTunnel(): Promise<string> {
  console.log('[Tunnel] Starting quick tunnel (random URL)...');

  return new Promise((resolve, reject) => {
    tunnelProcess = spawn('cloudflared', [
      'tunnel',
      '--no-autoupdate',
      '--url',
      `http://localhost:${config.hls.port}`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Quick tunnel did not establish in time'));
      }
    }, 30000);

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      if (config.debug) {
        console.log('[Tunnel]', output.trim());
      }

      // Look for the public URL
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        publicUrl = match[0];
        console.log(`[Tunnel] Quick tunnel established: ${publicUrl}`);
        resolve(publicUrl);
      }
    };

    tunnelProcess.stdout?.on('data', handleOutput);
    tunnelProcess.stderr?.on('data', handleOutput);

    tunnelProcess.on('error', (err) => {
      console.error('[Tunnel] Failed to start cloudflared:', err.message);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    tunnelProcess.on('exit', (code) => {
      console.log(`[Tunnel] Process exited with code ${code}`);
      publicUrl = null;
    });
  });
}
