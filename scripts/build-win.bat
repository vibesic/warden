@echo off
setlocal enabledelayedexpansion

echo === Proctor App Build Script (Windows) ===
echo.

set "ROOT_DIR=%~dp0.."

:: Step 1: Install root dependencies
echo [1/6] Installing root dependencies...
cd /d "%ROOT_DIR%"
call npm install --ignore-scripts

:: Step 2: Build frontend
echo [2/6] Building frontend...
cd /d "%ROOT_DIR%\frontend"
call npm install
call npm run build

:: Step 3: Build backend
echo [3/6] Building backend...
cd /d "%ROOT_DIR%\backend"
call npm install
call npx prisma generate
call npx tsc

:: Step 4: Generate template database
echo [4/6] Generating template database...
cd /d "%ROOT_DIR%\backend"
set "DATABASE_URL=file:./prisma/template.db"
call npx prisma db push --accept-data-loss
set "DATABASE_URL="

:: Step 5: Build Electron main process
echo [5/6] Building Electron main process...
cd /d "%ROOT_DIR%\electron"
call npx tsc

:: Step 6: Package for Windows
echo [6/6] Packaging for Windows...
cd /d "%ROOT_DIR%"
call npx electron-builder --win

echo.
echo === Build complete! ===
echo Output is in the release\ directory.
pause
