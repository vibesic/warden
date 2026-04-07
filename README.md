# Proctor App

A secure exam proctoring system designed to be deployed on local networks. The teacher runs the application on a local machine interconnected via Wi-Fi/LAN, allowing students to connect their browsers to the teacher's machine. The system monitors students in real-time for internet access violations, connection drops, camera focus, and session bounds.

## Key Features

- **Real-Time Dashboards:** Real-time visibility of student statuses, warnings, and violations using WebSockets.
- **Network & Focus Monitoring:** Tracks active connections, focus loss, and external internet availability to detect cheating.
- **Local Network Deployment:** Runs efficiently offline on a dedicated local network.
- **Session & File Management:** Integrated exam session creation, student file uploads (up to 50MB limits), and submission tracking.

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Backend:** Express.js, Socket.io
- **Database:** SQLite via Prisma ORM
- **Deployment:** Docker Compose
- **Testing:** Vitest + Supertest

## Architecture Overview

The app is built as a dual monolithic container system designed for Docker. 

- **Teacher Machine (Docker Host):** Runs Express + Socket.io backend to serve API endpoints, WebSocket gateway, and the frontend static app. 
- **Student Connecting:** Students connect via network (HTTP + WebSocket).

For more details on the architecture and codebase rules, check the `docs/` folder.

## Getting Started

### Development Workflow

For active development with hot-reloading and live database mounts:

1. Clone the repository:
   ```bash
   git clone git@github.com:mrkazawa/proctor-app.git
   cd proctor-app
   ```
2. Start the development environment:
   ```bash
   npm run dev
   # (This runs: docker compose -f docker-compose.dev.yml up --build)
   ```
3. Access the app locally:
   - Frontend: `http://localhost:5174`
   - Backend API: `http://localhost:3333`

### Production / Classroom Workflow (BYOD)

In production mode, the app uses pre-built, highly optimized Docker images (`dockazawa/proctor-frontend` and `dockazawa/proctor-backend`) so the teacher's laptop can easily handle an entire classroom's traffic over a local Wi-Fi network.

1. Ensure Docker is running.
2. Download the published production images (requires internet):
   ```bash
   # On WSL/Linux
   bash scripts/lan-wsl.sh build
   
   # On Windows PowerShell
   .\scripts\lan-win.ps1 build
   ```
3. Start the classroom server (no internet required from this point onward):
   ```bash
   # On WSL/Linux
   bash scripts/lan-wsl.sh
   
   # On Windows PowerShell
   .\scripts\lan-win.ps1
   ```
4. **Student Access:**
   The script will detect and display your machine's local IP address. Students simply type your IP directly into their web browser (e.g., `http://192.168.1.100`) to connect! Port `80` is used by default.