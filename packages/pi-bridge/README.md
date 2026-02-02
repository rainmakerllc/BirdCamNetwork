# BirdCam Pi Bridge

🐦 **Connect your IP camera to the BirdCam Network** via Raspberry Pi.

A feature-rich bridge that connects IP cameras to the cloud with ONVIF support, motion detection, PTZ control, and a beautiful web dashboard.

## ✨ Features

- 📹 **RTSP → HLS Transcoding** - Converts your camera's RTSP stream to web-compatible HLS
- 🎯 **ONVIF Support** - Auto-discover cameras and get stream URLs automatically
- 🔍 **Motion Detection** - Automatic motion sensing with configurable sensitivity
- 🎬 **Clip Recording** - Automatic recording on motion events with storage management
- 📸 **Snapshots** - Manual and automatic snapshot capture
- 🎮 **PTZ Control** - Pan/Tilt/Zoom for supported cameras via ONVIF
- 🖥️ **Web Dashboard** - Beautiful local UI for camera management
- 🌍 **Cloudflare Tunnel** - Automatic NAT traversal and dynamic DNS (free tier)
- 🔗 **Auto-Registration** - Automatically registers with BirdCam Network
- 💓 **Health Monitoring** - Regular heartbeats and status updates
- 🔄 **Auto-Restart** - Automatically recovers from stream interruptions

## 🖼️ Web Dashboard

The built-in dashboard provides:
- Live video stream with HLS.js
- PTZ controls (arrow buttons + zoom)
- Snapshot and recording buttons
- Recent clips gallery with thumbnails
- Storage and status monitoring

Access at `http://<pi-ip>:8080`

## Requirements

- Raspberry Pi 3B+ or newer (4 recommended)
- Raspberry Pi OS (64-bit recommended)
- Node.js 18+
- FFmpeg
- IP Camera with RTSP support (ONVIF recommended)

## Quick Setup (Recommended)

Run the interactive setup wizard to auto-discover and configure your camera:

```bash
npm run setup
```

This will:
1. 🔍 Scan your network for ONVIF cameras
2. 📋 List all discovered cameras
3. 🔐 Prompt for credentials
4. ✅ Test the connection and show available streams
5. 💾 Generate your `.env` config file

**Or just scan for cameras:**

```bash
npm run discover
```

## Quick Install

```bash
# SSH into your Pi, then run:
curl -fsSL https://raw.githubusercontent.com/birdcam/pi-bridge/main/install.sh | sudo bash
```

Or install manually:

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y ffmpeg nodejs npm

# Install cloudflared (optional, for tunnel)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 \
  -o /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Clone and install
git clone https://github.com/rainmakerllc/BirdCamNetwork.git
cd BirdCamNetwork/packages/pi-bridge
npm install
npm run build
npm run setup  # Interactive setup wizard
```

## Manual Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

### Using ONVIF (Recommended)

ONVIF auto-discovers cameras and retrieves RTSP URLs automatically—no need to hunt for URLs!

**Auto-discover cameras on your network:**

```env
USE_ONVIF=true
ONVIF_AUTO_DISCOVER=true
ONVIF_USERNAME=admin
ONVIF_PASSWORD=your-password
```

**Connect to a specific ONVIF camera:**

```env
USE_ONVIF=true
ONVIF_AUTO_DISCOVER=false
ONVIF_HOST=192.168.1.100
ONVIF_PORT=80
ONVIF_USERNAME=admin
ONVIF_PASSWORD=your-password
```

### Motion Detection & Recording

```env
# Enable motion detection
MOTION_DETECTION_ENABLED=true
MOTION_SENSITIVITY=50  # 0-100
MOTION_COOLDOWN_MS=5000

# Recording storage
CLIPS_DIR=/var/birdcam/clips
SNAPSHOTS_DIR=/var/birdcam/snapshots
RETENTION_DAYS=7
MAX_STORAGE_MB=10000
```

### Cloudflare Tunnel (Recommended)

For external access without port forwarding:

1. Create a free Cloudflare account
2. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
3. Create a tunnel → Get the token
4. Add to your `.env`:

```env
USE_CLOUDFLARE_TUNNEL=true
CLOUDFLARE_TUNNEL_TOKEN=your-token-here
```

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### As a Service

```bash
# Create service file
sudo tee /etc/systemd/system/birdcam-bridge.service << EOF
[Unit]
Description=BirdCam Pi Bridge
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/BirdCamNetwork/packages/pi-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable birdcam-bridge
sudo systemctl start birdcam-bridge

# View logs
sudo journalctl -u birdcam-bridge -f
```

## API Reference

### Stream

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web dashboard |
| `GET /stream.m3u8` | HLS manifest |
| `GET /segment*.ts` | HLS video segments |

### Status

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with stats |
| `GET /info` | Device and camera info |

### Snapshots

| Endpoint | Description |
|----------|-------------|
| `POST /api/snapshot` | Capture snapshot |
| `GET /api/snapshot/latest` | Get latest snapshot image |
| `GET /api/snapshots` | List all snapshots |
| `GET /api/snapshots/:id` | Get specific snapshot |

### Recording

| Endpoint | Description |
|----------|-------------|
| `POST /api/recording/start` | Start recording |
| `POST /api/recording/stop` | Stop recording |
| `GET /api/recording/status` | Recording status |
| `GET /api/clips` | List all clips |
| `GET /api/clips/:id/video` | Download clip video |
| `GET /api/clips/:id/thumbnail` | Get clip thumbnail |
| `DELETE /api/clips/:id` | Delete a clip |

### Motion Detection

| Endpoint | Description |
|----------|-------------|
| `GET /api/motion/config` | Get motion config |
| `POST /api/motion/config` | Update motion config |
| `GET /api/motion/status` | Motion detection status |

### PTZ Control

| Endpoint | Description |
|----------|-------------|
| `GET /api/ptz/capabilities` | Camera PTZ capabilities |
| `GET /api/ptz/status` | Current position |
| `POST /api/ptz/move` | Move camera (pan, tilt, zoom) |
| `POST /api/ptz/stop` | Stop movement |
| `POST /api/ptz/home` | Go to home position |
| `GET /api/ptz/presets` | List presets |
| `POST /api/ptz/presets/:token` | Go to preset |
| `PUT /api/ptz/presets` | Save new preset |

### PTZ Move Body

```json
{
  "pan": 0.5,    // -1 to 1 (left to right)
  "tilt": 0.5,   // -1 to 1 (down to up)
  "zoom": 0.0,   // -1 to 1 (out to in)
  "type": "continuous"  // or "absolute", "relative"
}
```

## Supported Cameras

Most IP cameras with RTSP support work. Tested with:

- Wyze Cam (with RTSP firmware)
- Reolink
- Amcrest
- Hikvision
- Dahua
- Any ONVIF-compatible camera

PTZ control requires an ONVIF-compatible camera with PTZ support.

## Architecture

```
┌──────────────┐     RTSP      ┌──────────────┐     HLS      ┌──────────────┐
│  IP Camera   │──────────────▶│ Raspberry Pi │─────────────▶│  BirdCam     │
│   (ONVIF)    │  (local LAN)  │  Pi Bridge   │  (tunnel)    │  Network     │
└──────────────┘               └──────────────┘              └──────────────┘
       ▲                              │
       │ PTZ                          │ Motion Detection
       │ Control                      │ Clip Recording
       │                              │ Web Dashboard
       └──────────────────────────────┘
```

## Troubleshooting

### Stream not starting

1. Test RTSP URL with VLC: `vlc rtsp://...`
2. Check FFmpeg can access: `ffprobe rtsp://...`
3. Verify network connectivity between Pi and camera

### ONVIF discovery not finding cameras

1. Ensure camera ONVIF is enabled (check camera settings)
2. Camera must be on the same network/VLAN as the Pi
3. Try specifying ONVIF_HOST directly instead of auto-discover

### PTZ not working

1. Verify camera supports PTZ via ONVIF
2. Check PTZ capabilities endpoint: `GET /api/ptz/capabilities`
3. Some cameras require specific ONVIF profile versions

### High CPU usage

- Reduce output bitrate: `OUTPUT_BITRATE=1500k`
- Lower resolution: `OUTPUT_RESOLUTION=1280x720`
- Disable motion detection if not needed

## License

MIT
