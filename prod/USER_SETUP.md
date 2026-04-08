# Warden - User Guide

This guide is for educators or administrators who want to deploy and run the Warden without downloading the source code or compiling it themselves. You will use pre-built Docker images to get the application running in minutes.

## Prerequisites

You need **Docker** installed on the computer that will host the application (the "Teacher's Laptop" or Server).

1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop).
2. Ensure Docker Desktop is running.

## Step 1: Create a Project Directory

Create a dedicated folder on your computer for the application files.

1. Open a terminal (Command Prompt/PowerShell on Windows, Terminal on Mac/Linux).
2. Run the following commands:
   ```bash
   mkdir warden
   cd warden
   ```

## Step 2: Create the Configuration File

You need a `docker-compose.yml` file to tell Docker how to run the frontend and backend services together.

1. In your new `warden` folder, create a file named `docker-compose.yml`.
2. Open the file in a text editor (like Notepad, TextEdit, or VS Code) and paste the following configuration:

```yaml
version: '3.8'

services:
  backend:
    image: dockazawa/warden-backend:latest
    ports:
      - "3333:3333"
    volumes:
      - backend_data:/app/data
      - uploads_data:/app/uploads
    environment:
      # Database and application settings
      - DATABASE_URL=file:./data/dev.db?connection_limit=1
      - NODE_ENV=production
      - PORT=3333
      - UPLOADS_DIR=/app/uploads
      # Set your teacher dashboard password here
      - TEACHER_PASSWORD=Warden2026!
    networks:
      - exam-network
    restart: unless-stopped

  frontend:
    image: dockazawa/warden-frontend:latest
    ports:
      - "80:80"
    networks:
      - exam-network
    restart: unless-stopped

networks:
  exam-network:
    driver: bridge

volumes:
  # The volumes ensure your exam data is saved across restarts
  backend_data:
  uploads_data:
```

**🔹 IF YOU ARE USING WSL2 on Windows (WITHOUT Docker Desktop):**
You also need to download our networking helper scripts so your local network can reach your WSL environment. Inside your `warden` folder in WSL, run:
```bash
mkdir scripts
curl -o scripts/lan-wsl.sh https://raw.githubusercontent.com/vibesic/warden/master/scripts/lan-wsl.sh
curl -o scripts/lan-win.ps1 https://raw.githubusercontent.com/vibesic/warden/master/scripts/lan-win.ps1
chmod +x scripts/lan-wsl.sh
```

## Step 3: Start the Application

Once your configuration file is saved, you can start the application and download the latest pre-built images.

**Standard Start (For Mac, Linux, and Windows Docker Desktop Users):**
1. Go back to your terminal (ensure you are still in the `warden` folder).
2. Run this command to start the app in the background:
   ```bash
   docker compose up -d
   ```

**🔹 WSL2 Start (For Windows WSL2 Users WITHOUT Docker Desktop):**
1. Instead of standard Docker Compose, start the app via our helper script which automatically detects your Windows IP:
   ```bash
   bash scripts/lan-wsl.sh
   ```
2. Open a **PowerShell** window as **Administrator** on your Windows host, and run the Windows script to map the ports to WSL:
   ```powershell
   # Tip: You may need to bypass execution policies first:
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   
   # Navigate to your WSL folder (replace 'Ubuntu' and 'YOUR_USERNAME' based on your system)
   cd \\wsl$\Ubuntu\home\YOUR_USERNAME\warden
   
   # Run the forwarding script
   .\scripts\lan-win.ps1
   ```

## Step 4: Access the Dashboard

Once the containers are running:
- Open your web browser and go to: `http://localhost`
- You can monitor the exams from the Teacher Dashboard page. (The default password from the config above is **Warden2026!**)

## Step 5: Student Access (LAN Setup)

To allow students to connect to your exam session:
1. Ensure your host machine and student devices are connected to the same Local Area Network (Wi-Fi or LAN).
2. Find your computer's local IP address (e.g., typically `192.168.x.x` or `10.x.x.x`). You can find this out via `ipconfig` (Windows) or `ifconfig` (macOS/Linux).
3. Have the students open a browser on their devices and go to `http://<YOUR_IP_ADDRESS>`.
4. (Remember to update the `VITE_API_URL` environment variable in the `docker-compose.yml` to use your actual IP if students face connection issues, and restart the app).

## Stopping the Application

To turn off the application and close the server:

**Standard Stop (Mac, Linux, Windows Docker Desktop Users):**
1. Open up your terminal in the `warden` folder.
2. Run:
   ```bash
   docker compose down
   ```

**🔹 WSL2 Stop (For Windows WSL2 Users WITHOUT Docker Desktop):**
1. In your WSL terminal:
   ```bash
   bash scripts/lan-wsl.sh stop
   ```
2. In your Administrator PowerShell terminal:
   ```powershell
   .\scripts\lan-win.ps1 -Stop
   ```

Your exam data is safely persisted on your computer disk in the Docker volumes until the next time you start the application.
