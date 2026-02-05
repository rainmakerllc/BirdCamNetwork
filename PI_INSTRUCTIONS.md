# Pi-Bridge Instructions for Bruce

## Quick Fix: Change Stream Mode to HLS

The Pi is currently running with `STREAM_MODE=webrtc` but the web dashboard expects HLS.
Run these commands on the Pi (birdnetwork / 192.168.86.34):

```bash
# SSH into the Pi
ssh admin@birdnetwork

# Edit the .env file
cd ~/birdcam
nano .env

# Find this line:
#   STREAM_MODE=webrtc
# Change it to:
#   STREAM_MODE=hls

# Save (Ctrl+X, Y, Enter)

# Restart the pi-bridge service
sudo systemctl restart birdcam

# Verify it's running
sudo systemctl status birdcam
```

### Why?
- **WebRTC requires a TURN server** for reliable connections (expensive, $$$)
- **HLS works over plain HTTP** - no relay servers needed
- The dashboard at birdwatchnetwork.web.app is built to consume HLS streams
- HLS has 2-8s latency (fine for bird watching), WebRTC has <1s

## Verify Stream is Working

After changing to HLS mode, test the stream:

```bash
# Check if FFmpeg is transcoding
ps aux | grep ffmpeg

# Check if HLS segments are being generated
ls -la /tmp/birdcam-hls/

# Check the pi-bridge logs
journalctl -u birdcam -f --no-pager
```

Then open the dashboard in a browser:
- Local: `http://birdnetwork:8080`
- The stream should play at `http://birdnetwork:8080/stream.m3u8`

## Rebuild After Code Updates

If new code is pushed to GitHub:

```bash
cd ~/birdcam
git pull
npm run build
sudo systemctl restart birdcam
```

## Current Pi Configuration

- **Host:** birdnetwork (192.168.86.34)
- **User:** admin
- **Camera:** Amcrest PTZ at 192.168.86.30
- **Dashboard:** http://birdnetwork:8080
- **API Key:** birdcam_secret_key_2026
- **Service:** systemd unit `birdcam`

---
Last updated: 2026-02-05
