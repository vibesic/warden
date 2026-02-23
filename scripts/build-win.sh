#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Proctor App Build Script ==="
echo ""

# Step 1: Install root dependencies (Electron + electron-builder)
echo "[1/5] Installing root dependencies..."
cd "$ROOT_DIR"
npm install --ignore-scripts

# Step 2: Build frontend
echo "[2/5] Building frontend..."
cd "$ROOT_DIR/frontend"
npm install
npm run build

# Step 3: Build backend
echo "[3/5] Building backend..."
cd "$ROOT_DIR/backend"
npm install
npx prisma generate
npx tsc

# Step 4: Build Electron main process
echo "[4/5] Building Electron main process..."
cd "$ROOT_DIR/electron"
npx tsc

# Step 5: Package for Windows
echo "[5/5] Packaging for Windows..."
cd "$ROOT_DIR"
npx electron-builder --win

echo ""
echo "=== Build complete! ==="
echo "Output is in the release/ directory."
