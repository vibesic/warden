# Proctor App - Deployment Guide

This guide is for educators or administrators who want to deploy and run the Proctor App without downloading the source code or compiling it themselves. You will use pre-built Docker images to get the application running in minutes.

## Prerequisites

You need **Docker** installed on the computer that will host the application (the "Teacher's Laptop" or Server).

1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop).
2. Ensure Docker Desktop is running.

## Step 1: Create a Project Directory

Create a dedicated folder on your computer for the application files.

1. Open a terminal (Command Prompt/PowerShell on Windows, Terminal on Mac/Linux).
2. Run the following commands:
   ```bash
   mkdir proctor-app
   cd proctor-app
   ```

## Step 2: Create the Configuration File

You need a `docker-compose.yml` file to tell Docker how to run the frontend and backend services together.

1. In your new `proctor-app` folder, create a file named `docker-compose.yml`.
2. Open the file in a text editor (like Notepad, TextEdit, or VS Code) and paste the following configuration:

```yaml
version: '3.8'

services:
  backend:
    image: dockazawa/proctor-backend:latest
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
      - TEACHER_PASSWORD=Proctor2026
    networks:
      - exam-network
    restart: unless-stopped

  frontend:
    image: dockazawa/proctor-frontend:latest
    ports:
      - "80:80"
    environment:
      # Change localhost to your computer's IP address on the network if students 
      # connect from other devices. E.g., http://192.168.1.100:3333
      - VITE_API_URL=http://localhost:3333 
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

*(Note: If students are going to access the app from their own devices on a local network, you will need to replace `localhost` in `VITE_API_URL=http://localhost:3333` with your host computer's local IP address, e.g., `http://192.168.1.100:3333`)*

## Step 3: Start the Application

*(Note: If you are using **WSL2 (Windows Subsystem for Linux)** instead of Docker Desktop, please **SKIP to the Special Instructions for WSL Users** at the bottom of this page before starting).*

Once your configuration file is saved, you can start the application using Docker Compose.

1. Go back to your terminal (ensure you are still in the `proctor-app` folder).
2. Run this command to start the app in the background:
   ```bash
   docker compose up -d
   ```

Docker will now download the latest pre-built images for the frontend and backend directly from the container registry and start them.

## Step 4: Access the Dashboard

Once the containers are running:
- Open your web browser and go to: `http://localhost`
- You can monitor the exams from the Teacher Dashboard page. (The default password from the config above is **Proctor2026**)

## Step 5: Student Access (LAN Setup)

To allow students to connect to your exam session:
1. Ensure your host machine and student devices are connected to the same Local Area Network (Wi-Fi or LAN).
2. Find your computer's local IP address (e.g., typically `192.168.x.x` or `10.x.x.x`). You can find this out via `ipconfig` (Windows) or `ifconfig` (macOS/Linux).
3. Have the students open a browser on their devices and go to `http://<YOUR_IP_ADDRESS>`.
4. (Remember to update the `VITE_API_URL` environment variable in the `docker-compose.yml` to use your actual IP if students face connection issues, and run `docker compose up -d` again).

## Stopping the Application

To turn off the application and close the server:
1. Open up your terminal in the `proctor-app` folder.
2. Run:
   ```bash
   docker compose down
   ```
Your exam data is safely persisisted on your computer disk in the Docker volumes until the next time you run `docker compose up -d`.

---

## Special Instructions for WSL (Windows) Users

If you are running Docker natively inside Windows Subsystem for Linux (WSL2) without using Docker Desktop, your computer's local network (LAN) will not automatically route traffic to your Docker containers. You must set up port forwarding (WSL -> Local Windows Host -> Internet/LAN).

To do this, we provide two helper scripts you can download and run.

### 1. Download the Networking Scripts

Inside your `proctor-app` folder in WSL, run:
```bash
mkdir scripts
curl -o scripts/lan-wsl.sh https://raw.githubusercontent.com/mrkazawa/proctor-app/master/scripts/lan-wsl.sh
curl -o scripts/lan-win.ps1 https://raw.githubusercontent.com/mrkazawa/proctor-app/master/scripts/lan-win.ps1
chmod +x scripts/lan-wsl.sh
```

### 2. Start the App via WSL Script

Instead of running `docker compose up -d` manually like in Step 3, use the WSL script. This will automatically detect your Windows IP and configure the application:
```bash
bash scripts/lan-wsl.sh
```

### 3. Apply Windows Port Forwarding

Open a **PowerShell** window as **Administrator** on your Windows host, and run the Windows script to map the ports:
```powershell
# Tip: You may need to bypass execution policies first:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Navigate to your WSL folder (replace 'Ubuntu' and 'YOUR_USERNAME' based on your system)
cd \\wsl$\Ubuntu\home\YOUR_USERNAME\proctor-app

# Run the forwarding script
.\scripts\lan-win.ps1
```

Now, other devices on your local network will be able to access the exam application!

### Stopping the App via Scripts

To shut everything down and remove the associated network forwarding rules:

1. In your WSL terminal:
   ```bash
   bash scripts/lan-wsl.sh stop
   ```
2. In your Administrator PowerShell terminal:
   ```powershell
   .\scripts\lan-win.ps1 -Stop
   ```
