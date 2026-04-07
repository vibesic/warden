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

1. Clone the repository.
2. Run standard installation or Docker builds:
   ```bash
   npm run dev
   ```
   Or use the production Docker scripts specifically configured in `scripts/`.