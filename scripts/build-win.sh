#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Proctor App Build Script ==="
echo ""

# Step 1: Install root dependencies (Electron + electron-builder)
echo "[1/6] Installing root dependencies..."
cd "$ROOT_DIR"
npm install --ignore-scripts

# Step 2: Build frontend
echo "[2/6] Building frontend..."
cd "$ROOT_DIR/frontend"
npm install
npm run build

# Step 3: Build backend
echo "[3/6] Building backend..."
cd "$ROOT_DIR/backend"
npm install
npx prisma generate
npx tsc

# Step 4: Generate template database
echo "[4/6] Generating template database..."
cd "$ROOT_DIR/backend"
rm -f prisma/template.db
DATABASE_URL="file:./prisma/template.db" npx prisma db push --accept-data-loss

# Step 5: Build Electron main process
echo "[5/6] Building Electron main process..."
cd "$ROOT_DIR/electron"
npx tsc

# Step 6: Package for Windows
echo "[6/6] Packaging for Windows..."
cd "$ROOT_DIR"
npx electron-builder --win

echo ""
echo "=== Build complete! ==="
echo "Output is in the release/ directory."
