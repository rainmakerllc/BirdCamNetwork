#!/bin/bash
# BirdCam Pi Bridge - Installation Script
# For Raspberry Pi OS (Debian-based)

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         BirdCam Network - Pi Bridge Installer                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

INSTALL_DIR="/opt/birdcam"
SERVICE_NAME="birdcam-bridge"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

# Check for Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
  echo "Warning: This doesn't appear to be a Raspberry Pi"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "[1/6] Updating system packages..."
apt-get update
apt-get install -y curl git ffmpeg

echo "[2/6] Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js version: $(node -v)"

echo "[3/6] Installing cloudflared..."
if ! command -v cloudflared &> /dev/null; then
  # Detect architecture
  ARCH=$(dpkg --print-architecture)
  case $ARCH in
    arm64|aarch64)
      CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
      ;;
    armhf|arm)
      CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
      ;;
    amd64|x86_64)
      CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
      ;;
    *)
      echo "Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac
  curl -L "$CLOUDFLARED_URL" -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi
echo "cloudflared version: $(cloudflared --version)"

echo "[4/6] Setting up BirdCam Bridge..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download or clone the package
if [ -d "$INSTALL_DIR/pi-bridge" ]; then
  echo "Updating existing installation..."
  cd pi-bridge
  git pull || true
else
  echo "Downloading pi-bridge..."
  # For now, we'll assume it's available locally or via npm
  # In production, this would clone from GitHub
  mkdir -p pi-bridge
  cd pi-bridge
fi

# If package.json doesn't exist, create minimal setup
if [ ! -f "package.json" ]; then
  cat > package.json << 'EOF'
{
  "name": "@birdcam/pi-bridge",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": { "start": "node dist/index.js" }
}
EOF
fi

npm install --omit=dev 2>/dev/null || npm install

echo "[5/6] Creating configuration..."
if [ ! -f ".env" ]; then
  cat > .env << 'EOF'
# BirdCam Pi Bridge Configuration
# Edit these values for your setup

# Your camera's RTSP URL (required)
CAMERA_RTSP_URL=rtsp://admin:password@192.168.1.100:554/stream1

# Camera name
CAMERA_NAME=My Bird Feeder

# Firebase service account path
FIREBASE_SERVICE_ACCOUNT_PATH=/opt/birdcam/firebase-service-account.json

# Cloudflare tunnel (recommended for external access)
USE_CLOUDFLARE_TUNNEL=true
CLOUDFLARE_TUNNEL_TOKEN=

# HLS settings
HLS_PORT=8080
EOF

  echo ""
  echo "⚠️  Configuration file created at: $INSTALL_DIR/pi-bridge/.env"
  echo "   Please edit it with your camera's RTSP URL and Firebase credentials"
  echo ""
fi

echo "[6/6] Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=BirdCam Pi Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/pi-bridge
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                 Installation Complete!                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit the configuration file:"
echo "   sudo nano $INSTALL_DIR/pi-bridge/.env"
echo ""
echo "2. Add your Firebase service account JSON:"
echo "   sudo nano $INSTALL_DIR/firebase-service-account.json"
echo ""
echo "3. (Optional) Set up Cloudflare Tunnel for external access:"
echo "   - Go to https://one.dash.cloudflare.com"
echo "   - Create a tunnel and get the token"
echo "   - Add the token to your .env file"
echo ""
echo "4. Start the service:"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo ""
echo "5. Check the logs:"
echo "   sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "Your stream will be available at: http://$(hostname -I | awk '{print $1}'):8080"
echo ""
