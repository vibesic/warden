@echo off
setlocal enabledelayedexpansion

echo === Proctor App Build Script (Windows) ===
echo.

set "ROOT_DIR=%~dp0.."

:: Step 1: Install root dependencies
echo [1/5] Installing root dependencies...
cd /d "%ROOT_DIR%"
call npm install --ignore-scripts

:: Step 2: Build frontend
echo [2/5] Building frontend...
cd /d "%ROOT_DIR%\frontend"
call npm install
call npm run build

:: Step 3: Build backend
echo [3/5] Building backend...
cd /d "%ROOT_DIR%\backend"
call npm install
call npx prisma generate
call npx tsc

:: Step 4: Build Electron main process
echo [4/5] Building Electron main process...
cd /d "%ROOT_DIR%\electron"
call npx tsc

:: Step 5: Package for Windows
echo [5/5] Packaging for Windows...
cd /d "%ROOT_DIR%"
call npx electron-builder --win

echo.
echo === Build complete! ===
echo Output is in the release\ directory.
pause
