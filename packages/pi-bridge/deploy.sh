#!/bin/bash
# BirdCam Pi-Bridge Deployment Script
# Run this on the Raspberry Pi to update the software

set -e

echo "🐦 BirdCam Pi-Bridge Deployment"
echo "================================"

# Navigate to project directory
cd "$(dirname "$0")" || exit 1

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo "⚠️  Not a git repository. Please clone the repo first:"
    echo "   git clone https://github.com/rainmakerllc/BirdCamNetwork.git"
    echo "   cd BirdCamNetwork/packages/pi-bridge"
    exit 1
fi

echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/master

echo "📦 Installing dependencies..."
npm install --production

echo "🔄 Restarting birdcam service..."
if systemctl is-active --quiet birdcam; then
    sudo systemctl restart birdcam
    echo "✅ Service restarted!"
else
    echo "⚠️  birdcam service not running. Starting it..."
    sudo systemctl start birdcam || {
        echo "❌ Failed to start service. You may need to run manually:"
        echo "   npm start"
    }
fi

# Wait a moment for startup
sleep 3

# Check status
echo ""
echo "📊 Service Status:"
systemctl status birdcam --no-pager -l 2>/dev/null || echo "Service status unavailable"

echo ""
echo "✅ Deployment complete!"
echo "   Dashboard: http://$(hostname):8080/"
