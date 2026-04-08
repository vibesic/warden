# Warden - Developer Setup Guide

This guide is for software engineers and contributors who want to modify the source code, test new features, and build their own version of the Warden. 

If you are a teacher or administrator just looking to *run* the app for an exam, please see the [User Setup Guide](USER_SETUP.md) instead!

---

## 1. Prerequisites

To develop on this project, ensure you have installed:
- **Git** (to clone the repository)
- **Node.js** (v18+ recommended)
- **npm** (v9+ recommended)
- **Docker & Docker Compose** (for running the isolated environment)
- **VS Code** (recommended editor)

## 2. Clone the Repository

First, clone the repository to your local machine and navigate into the folder:

```bash
git clone git@github.com:vibesic/warden.git
cd warden
```

## 3. Install Dependencies

The project uses a root `package.json` to help manage the full stack. Run the single `install` command from the root directory. 

```bash
npm install
```

*(This triggers a `postinstall` script that automatically runs `npm install` inside both the `/backend` and `/frontend` folders for you).*

## 4. Run the Development Environment

You don't need to start the frontend and backend separately. We use Docker to spin up a simulated production-like environment with hot-reloading enabled.

```bash
npm run dev
```

**What this does:**
1. Starts the SQLite database, Express backend (port `3333`), and Vite frontend (port `5174` internal, mapped to `80` external).
2. Mounts your local `./frontend` and `./backend` folders directly into the Docker containers as volumes.
3. Automatically runs Prisma migrations (`npx prisma generate && npx prisma migrate deploy`).
4. Watches for file changes. If you edit a React file in `frontend/src`, Vite instantly hot-reloads it. If you edit a Node.js file in `backend/src`, `nodemon` restarts the server automatically!

### Debugging & Logs
To view the output of your running application (backend console logs, frontend build errors, etc.), open a second terminal tab and run:
```bash
npm run dev:logs
```

### Stopping the Environment
When you are done coding, shut down the containers cleanly to free up system resources:
```bash
npm run dev:down
```

## 5. Testing and Validation (Pre-Commit)

Before you commit code, you should make sure your changes are structurally sound.

### Run Unit & Integration Tests
The application is tested using [Vitest](https://vitest.dev/). We maintain unit tests for services and integration tests for our Socket.io gateway handlers.
You can run all tests across the entire codebase with a single command from the root folder:
```bash
npm run test
```
*(You can also run tests individually by running `npm run test:frontend` or `npm run test:backend`).*

### Build and Type-Check
Although hot-reloading handles live updates, it does not strictly fail on TypeScript errors. Always verify your build works:
```bash
npm run build
```
*(This runs `tsc` on the backend and the Vite optimized build on the frontend).*

## 6. Publishing a Release

When your code is merged to `master` and ready for release to normal users, you need to build the highly-optimized production Docker images and push them to Docker Hub.

You can do this in one command:
```bash
npm run docker:publish
```
*(This uses the `Dockerfile.prod` files to build `dockazawa/warden-backend:latest` and `dockazawa/warden-frontend:latest` and immediately pushes them to the public registry).*

---

## Codebase Navigation

- **/frontend:** React 18 frontend (Tailwind CSS, Vite).
- **/backend:** Express.js & Socket.io server with Prisma ORM.
- **/docs:** Extensive guidelines on [Architecture](docs/APP_ARCHITECTURE.md) and [Coding Behaviors](docs/AGENT_CODE_BEHAVIOR.md).
- **/scripts:** Helper scripts for LAN port-forwarding (WSL/Windows).