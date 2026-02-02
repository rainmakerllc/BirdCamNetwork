#!/usr/bin/env node

/**
 * Camera Discovery CLI
 * 
 * Scans the network for ONVIF cameras and helps you connect them.
 * 
 * Usage:
 *   npx ts-node src/discover.ts          # Scan and list cameras
 *   npx ts-node src/discover.ts --setup  # Interactive setup wizard
 */

import { discoverCameras, connectCamera, getBestStreamUrl, type DiscoveredCamera, type OnvifDevice } from './onvif.js';
import { createInterface } from 'readline';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    
    // Hide input
    if (process.stdin.isTTY) {
      const stdin = process.stdin as any;
      stdin.setRawMode(true);
    }
    
    let input = '';
    const onData = (char: Buffer) => {
      const c = char.toString();
      if (c === '\n' || c === '\r') {
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          const stdin = process.stdin as any;
          stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        resolve(input);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (c === '\u007F') {
        // Backspace
        input = input.slice(0, -1);
      } else {
        input += c;
        process.stdout.write('*');
      }
    };
    
    process.stdin.on('data', onData);
  });
}

async function listCameras(): Promise<DiscoveredCamera[]> {
  console.log('\n🔍 Scanning network for ONVIF cameras...\n');
  
  const cameras = await discoverCameras(5000);
  
  if (cameras.length === 0) {
    console.log('❌ No ONVIF cameras found on the network.\n');
    console.log('Tips:');
    console.log('  • Make sure your camera supports ONVIF');
    console.log('  • Check that the camera is on the same network/VLAN');
    console.log('  • Some cameras need ONVIF enabled in settings\n');
    return [];
  }
  
  console.log(`✅ Found ${cameras.length} camera(s):\n`);
  console.log('┌────┬─────────────────┬──────────────────────────────────────────┐');
  console.log('│ #  │ IP Address      │ Camera Info                              │');
  console.log('├────┼─────────────────┼──────────────────────────────────────────┤');
  
  cameras.forEach((cam, i) => {
    const num = String(i + 1).padEnd(2);
    const ip = cam.ip.padEnd(15);
    const info = `${cam.manufacturer} ${cam.model}`.slice(0, 40).padEnd(40);
    console.log(`│ ${num} │ ${ip} │ ${info} │`);
  });
  
  console.log('└────┴─────────────────┴──────────────────────────────────────────┘\n');
  
  return cameras;
}

async function testConnection(
  camera: DiscoveredCamera,
  username: string,
  password: string
): Promise<OnvifDevice | null> {
  console.log(`\n🔌 Connecting to ${camera.ip}...`);
  
  try {
    const device = await connectCamera(camera.ip, camera.port, username, password);
    
    console.log(`✅ Connected to ${device.manufacturer} ${device.model}\n`);
    console.log('Available streams:');
    console.log('┌────┬────────────────────┬──────────────┬───────────────────────────────────────────┐');
    console.log('│ #  │ Profile            │ Resolution   │ Stream URL                                │');
    console.log('├────┼────────────────────┼──────────────┼───────────────────────────────────────────┤');
    
    device.profiles.forEach((profile, i) => {
      const num = String(i + 1).padEnd(2);
      const name = profile.name.slice(0, 18).padEnd(18);
      const res = `${profile.resolution.width}x${profile.resolution.height}`.padEnd(12);
      const url = (profile.streamUri || 'N/A').slice(0, 41).padEnd(41);
      console.log(`│ ${num} │ ${name} │ ${res} │ ${url} │`);
    });
    
    console.log('└────┴────────────────────┴──────────────┴───────────────────────────────────────────┘\n');
    
    return device;
  } catch (err) {
    console.log(`❌ Connection failed: ${(err as Error).message}\n`);
    return null;
  }
}

async function generateEnv(
  camera: DiscoveredCamera,
  device: OnvifDevice,
  username: string,
  password: string,
  cameraName: string
): Promise<void> {
  const envPath = join(process.cwd(), '.env');
  
  // Read existing .env if present
  let existingEnv = '';
  if (existsSync(envPath)) {
    existingEnv = readFileSync(envPath, 'utf-8');
  }
  
  // Parse existing values we want to preserve
  const getExisting = (key: string): string => {
    const match = existingEnv.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1] : '';
  };
  
  const rtspUrl = getBestStreamUrl(device, username, password);
  
  const newEnv = `# BirdCam Pi Bridge Configuration
# Generated by discovery wizard on ${new Date().toISOString()}

# === Camera Settings ===
CAMERA_NAME=${cameraName}
CAMERA_LOCATION=${getExisting('CAMERA_LOCATION') || ''}

# === ONVIF Settings ===
USE_ONVIF=true
ONVIF_AUTO_DISCOVER=false
ONVIF_HOST=${camera.ip}
ONVIF_PORT=${camera.port}
ONVIF_USERNAME=${username}
ONVIF_PASSWORD=${password}

# Alternative: Direct RTSP URL (auto-detected from ONVIF)
# CAMERA_RTSP_URL=${rtspUrl}

# === Firebase Settings ===
FIREBASE_SERVICE_ACCOUNT_PATH=${getExisting('FIREBASE_SERVICE_ACCOUNT_PATH') || '/home/pi/firebase-service-account.json'}
FIREBASE_PROJECT_ID=${getExisting('FIREBASE_PROJECT_ID') || 'birdwatchnetwork'}

# === Stream Settings ===
HLS_PORT=${getExisting('HLS_PORT') || '8080'}
HLS_SEGMENT_DURATION=${getExisting('HLS_SEGMENT_DURATION') || '2'}
HLS_PLAYLIST_SIZE=${getExisting('HLS_PLAYLIST_SIZE') || '5'}
OUTPUT_RESOLUTION=${getExisting('OUTPUT_RESOLUTION') || ''}
OUTPUT_BITRATE=${getExisting('OUTPUT_BITRATE') || '2000k'}

# === Tunnel Settings ===
USE_CLOUDFLARE_TUNNEL=${getExisting('USE_CLOUDFLARE_TUNNEL') || 'true'}
CLOUDFLARE_TUNNEL_TOKEN=${getExisting('CLOUDFLARE_TUNNEL_TOKEN') || ''}

# === Advanced ===
DEBUG=${getExisting('DEBUG') || 'false'}
`;

  writeFileSync(envPath, newEnv);
  console.log(`✅ Configuration saved to ${envPath}\n`);
}

async function setupWizard(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BirdCam Pi Bridge - Setup Wizard                   ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Step 1: Discover cameras
  const cameras = await listCameras();
  
  if (cameras.length === 0) {
    console.log('Would you like to enter camera details manually? (y/n)');
    const manual = await prompt('> ');
    
    if (manual.toLowerCase() !== 'y') {
      console.log('Exiting setup.');
      rl.close();
      return;
    }
    
    // Manual entry
    const ip = await prompt('Camera IP address: ');
    const port = await prompt('ONVIF port (default 80): ') || '80';
    
    cameras.push({
      ip,
      port: parseInt(port),
      name: 'Manual Entry',
      manufacturer: 'Unknown',
      model: 'Unknown',
      xaddr: `http://${ip}:${port}/onvif/device_service`,
    });
  }
  
  // Step 2: Select camera
  let selectedCamera: DiscoveredCamera;
  
  if (cameras.length === 1) {
    selectedCamera = cameras[0];
    console.log(`Using camera at ${selectedCamera.ip}\n`);
  } else {
    const selection = await prompt(`Select camera (1-${cameras.length}): `);
    const idx = parseInt(selection) - 1;
    
    if (idx < 0 || idx >= cameras.length) {
      console.log('Invalid selection. Exiting.');
      rl.close();
      return;
    }
    
    selectedCamera = cameras[idx];
  }
  
  // Step 3: Get credentials
  console.log('\n📝 Enter camera credentials:\n');
  const username = await prompt('Username (default: admin): ') || 'admin';
  const password = await promptSecret('Password: ');
  
  // Step 4: Test connection
  const device = await testConnection(selectedCamera, username, password);
  
  if (!device) {
    console.log('Would you like to try different credentials? (y/n)');
    const retry = await prompt('> ');
    
    if (retry.toLowerCase() === 'y') {
      const username2 = await prompt('Username: ');
      const password2 = await promptSecret('Password: ');
      const device2 = await testConnection(selectedCamera, username2, password2);
      
      if (!device2) {
        console.log('Connection failed. Please check your camera settings.');
        rl.close();
        return;
      }
    } else {
      rl.close();
      return;
    }
  }
  
  // Step 5: Camera name
  const defaultName = `${device!.manufacturer} ${device!.model}`.trim();
  const cameraName = await prompt(`Camera name (default: ${defaultName}): `) || defaultName;
  
  // Step 6: Generate config
  console.log('\n📄 Generating configuration...');
  await generateEnv(selectedCamera, device!, username, password, cameraName);
  
  console.log('🎉 Setup complete! Start the bridge with:\n');
  console.log('   npm run build');
  console.log('   npm start\n');
  
  rl.close();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--setup') || args.includes('-s')) {
    await setupWizard();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
BirdCam Camera Discovery Tool

Usage:
  npx tsx src/discover.ts           Scan and list ONVIF cameras
  npx tsx src/discover.ts --setup   Interactive setup wizard
  npx tsx src/discover.ts --help    Show this help

Options:
  -s, --setup    Run interactive setup wizard
  -h, --help     Show help
`);
  } else {
    // Just list cameras
    await listCameras();
    console.log('Run with --setup for interactive configuration wizard.\n');
  }
  
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
