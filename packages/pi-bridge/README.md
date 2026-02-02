# BirdCam Pi Bridge

🐦 **Connect your IP camera to the BirdCam Network** via Raspberry Pi.

This bridge software runs on a Raspberry Pi, connects to your local IP camera's RTSP stream, transcodes it to HLS for web compatibility, and exposes it to the BirdCam Network through a Cloudflare tunnel.

## Features

- 📹 **RTSP → HLS Transcoding** - Converts your camera's RTSP stream to web-compatible HLS
- 🎯 **ONVIF Support** - Auto-discover cameras and get stream URLs automatically
- 🌍 **Cloudflare Tunnel** - Automatic NAT traversal and dynamic DNS (free tier)
- 🔗 **Auto-Registration** - Automatically registers with BirdCam Network
- 💓 **Health Monitoring** - Regular heartbeats and status updates
- 🔄 **Auto-Restart** - Automatically recovers from stream interruptions

## Requirements

- Raspberry Pi 3B+ or newer (4 recommended)
- Raspberry Pi OS (64-bit recommended)
- Node.js 18+
- FFmpeg
- IP Camera with RTSP support

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

# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 \
  -o /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Clone and install
git clone https://github.com/birdcam/pi-bridge.git
cd pi-bridge
npm install
npm run build
```

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

## Manual Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

### Required Settings

```env
# Your camera's RTSP URL
CAMERA_RTSP_URL=rtsp://admin:password@192.168.1.100:554/stream1

# Camera name (shown in dashboard)
CAMERA_NAME=Backyard Feeder Cam

# Firebase service account (download from Firebase Console)
FIREBASE_SERVICE_ACCOUNT_PATH=/home/pi/firebase-service-account.json
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
CLOUDFLARE_TUNNEL_HOSTNAME=camera.yourdomain.com
```

Or use a random URL (no token needed):

```env
USE_CLOUDFLARE_TUNNEL=true
# Leave CLOUDFLARE_TUNNEL_TOKEN empty for random trycloudflare.com URL
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
# Install and enable
sudo cp birdcam-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable birdcam-bridge
sudo systemctl start birdcam-bridge

# View logs
sudo journalctl -u birdcam-bridge -f
```

## Stream Access

Once running, your stream is available at:

- **Local**: `http://<pi-ip>:8080/stream.m3u8`
- **Public** (with tunnel): `https://your-tunnel-url/stream.m3u8`
- **Player page**: `http://<pi-ip>:8080/`

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Simple HLS player page |
| `GET /stream.m3u8` | HLS manifest |
| `GET /segment*.ts` | HLS video segments |
| `GET /health` | Health check with stream stats |
| `GET /info` | Device and stream info |

## Supported Cameras

Most IP cameras with RTSP support work. Tested with:

- Wyze Cam (with RTSP firmware)
- Reolink
- Amcrest
- Hikvision
- Dahua
- Any ONVIF-compatible camera

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

The bridge will:
1. Connect to the ONVIF device
2. List available profiles (main stream, substream, etc.)
3. Auto-select the highest resolution stream
4. Extract the RTSP URL with proper authentication

**Select a specific profile:**

```env
ONVIF_PROFILE_TOKEN=Profile_1
```

Run once with `DEBUG=true` to see available profiles and their tokens.

### Finding Your RTSP URL (Manual)

If ONVIF isn't available, common RTSP URL formats:

```
# Generic
rtsp://username:password@ip:554/stream1

# Wyze
rtsp://username:password@ip:8554/live

# Reolink
rtsp://username:password@ip:554/h264Preview_01_main

# Hikvision
rtsp://username:password@ip:554/Streaming/Channels/101

# Amcrest
rtsp://username:password@ip:554/cam/realmonitor?channel=1&subtype=0
```

## Troubleshooting

### Stream not starting

1. Test RTSP URL with VLC: `vlc rtsp://...`
2. Check FFmpeg can access: `ffprobe rtsp://...`
3. Verify network connectivity between Pi and camera

### High CPU usage

- Reduce output bitrate: `OUTPUT_BITRATE=1500k`
- Lower resolution: `OUTPUT_RESOLUTION=1280x720`
- Use hardware encoding (if available)

### Tunnel not connecting

1. Verify cloudflared is installed: `cloudflared --version`
2. Check token is correct
3. View logs: `journalctl -u birdcam-bridge -f`

## Architecture

```
┌──────────────┐     RTSP      ┌──────────────┐     HLS      ┌──────────────┐
│  IP Camera   │──────────────▶│ Raspberry Pi │─────────────▶│  BirdCam     │
│              │  (local LAN)  │  Pi Bridge   │  (tunnel)    │  Network     │
└──────────────┘               └──────────────┘              └──────────────┘
                                     │
                                     │ Registers &
                                     │ Heartbeats
                                     ▼
                               ┌──────────────┐
                               │   Firebase   │
                               │  Firestore   │
                               └──────────────┘
```

## License

MIT
