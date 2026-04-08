# Warden

A secure exam monitoring system designed to be deployed on local networks. The teacher runs the application on a local machine interconnected via Wi-Fi/LAN, allowing students to connect their browsers to the teacher's machine. The system monitors students in real-time for internet access violations, connection drops, camera focus, and session bounds.

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

Depending on your role, we have two dedicated setup guides:

### 1. 🎓 [User Setup Guide](prod/USER_SETUP.md)
If you are an **educator, teacher, or administrator** who just wants to run the Warden for your classroom, click the link above. It will guide you on how to start the pre-built application in minutes using Docker without downloading any source code.

### 2. 💻 [Developer Setup Guide](DEV_SETUP.md)
If you are a **software engineer or contributor** who wants to modify the source code, test new features, and build your own version of the Warden, click the link above. It will guide you through cloning the repository, installing dependencies, and running the hot-reloading Docker stack.