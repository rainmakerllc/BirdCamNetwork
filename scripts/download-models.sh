#!/bin/bash
# Download ML models for browser-side bird detection
# Run from project root: bash scripts/download-models.sh

MODELS_DIR="apps/web/public/models"
mkdir -p "$MODELS_DIR"

echo "Downloading bird detection models..."

# YOLOv5n - Bird/object detector (4MB)
if [ ! -f "$MODELS_DIR/yolov5n.onnx" ]; then
  echo "  Downloading YOLOv5n detector..."
  curl -L -o "$MODELS_DIR/yolov5n.onnx" \
    "https://sourceforge.net/projects/yolov5.mirror/files/v7.0/yolov5n.onnx/download"
  echo "  ✓ yolov5n.onnx downloaded"
else
  echo "  ✓ yolov5n.onnx already exists"
fi

# MobileNetV2 - Species classifier (14MB)
if [ ! -f "$MODELS_DIR/mobilenetv2.onnx" ]; then
  echo "  Downloading MobileNetV2 classifier..."
  curl -L -o "$MODELS_DIR/mobilenetv2.onnx" \
    "https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx"
  echo "  ✓ mobilenetv2.onnx downloaded"
else
  echo "  ✓ mobilenetv2.onnx already exists"
fi

# ImageNet labels
if [ ! -f "$MODELS_DIR/imagenet_labels.txt" ]; then
  echo "  Downloading ImageNet labels..."
  curl -L -o "$MODELS_DIR/imagenet_labels.txt" \
    "https://raw.githubusercontent.com/anishathalye/imagenet-simple-labels/master/imagenet-simple-labels.json"
  echo "  ✓ imagenet_labels.txt downloaded"
else
  echo "  ✓ imagenet_labels.txt already exists"
fi

echo ""
echo "Done! Models are in $MODELS_DIR"
echo "  - yolov5n.onnx     (~4MB)  - Bird detection"
echo "  - mobilenetv2.onnx  (~14MB) - Species classification"
echo "  - imagenet_labels.txt       - Class labels"
