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
