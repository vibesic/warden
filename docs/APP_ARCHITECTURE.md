# Proctor App - System Architecture

## Overview

Proctor App is a **secure exam proctoring system** deployed via **Docker Compose**. The teacher runs the app on a machine connected to a local network (exam Wi-Fi). Students connect their browsers to the teacher's machine via the network. The system monitors students for internet access violations, connection drops, and session timing.

## Deployment Topology

```
┌──────────────────────────────────────────────┐
│          Teacher Machine (Docker)            │
│  ┌────────────────────────────────────────┐  │
│  │  Express + Socket.io (port 3333)       │  │
│  │  - REST API endpoints                  │  │
│  │  - Real-time WebSocket gateway         │  │
│  │  - Serves frontend static files        │  │
│  ├────────────────────────────────────────┤  │
│  │  SQLite (Prisma ORM)                   │  │
│  │  - Sessions, Students, Violations      │  │
│  │  - Submissions, CheckTargets           │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
         │ HTTP + WebSocket (LAN)
         ▼
┌──────────────────┐  ┌──────────────────┐
│  Student Browser  │  │  Student Browser  │  ...
│  (React SPA)      │  │  (React SPA)      │
└──────────────────┘  └──────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite | Student and teacher UI |
| Backend | Express.js, Socket.io, TypeScript | REST API + real-time gateway |
| Database | SQLite via Prisma ORM | Persistent storage (single-file DB) |
| Auth | Custom HMAC-SHA256 tokens | Teacher authentication |
| Testing | Vitest, v8 coverage, supertest, socket.io-client | Backend + frontend tests |
| Deployment | Docker Compose | Development and production |

## Backend Architecture (Layered)

```
HTTP Request ──► Routes ──► Middleware ──► Controllers ──► Services ──► Prisma ──► SQLite
                              (auth)        (thin/HTTP)    (thick/logic)

WebSocket ──► Gateway ──► Handlers ──► Services ──► Prisma ──► SQLite
               (socket.ts)  (student/teacher)  (business logic)

Background ──► Jobs ──► Services ──► Prisma ──► SQLite
               (backgroundJobs.ts)
```

### Directory Structure

```
backend/src/
├── app.ts                  # Express app: middleware, routes, static serving
├── server.ts               # HTTP server entry, Socket.io init, port binding
├── gateway/
│   ├── socket.ts           # Socket.io initialization, room management
│   ├── studentHandlers.ts  # Student events: register, heartbeat, violations, sniffer
│   ├── teacherHandlers.ts  # Teacher events: dashboard, session CRUD
│   └── backgroundJobs.ts   # Heartbeat checker, sniffer challenger, timer checker
├── services/
│   ├── auth.service.ts     # HMAC-SHA256 token generation/verification
│   ├── session.service.ts  # Session CRUD, code generation, expiration
│   ├── student.service.ts  # Student registration, heartbeat, offline detection
│   ├── violation.service.ts# Violation recording, check target selection
│   └── submission.service.ts# File submission CRUD
├── middleware/
│   └── errorHandler.ts     # Custom error classes, error middleware
├── types/
│   └── auth.ts             # Zod schemas, auth interfaces
├── utils/
│   ├── logger.ts           # Pino structured logger
│   ├── prisma.ts           # Prisma client singleton
│   └── domainList.ts       # Default check target URLs
└── __tests__/              # 19 test files (unit + integration + e2e)
```

### Socket.io Room Structure

| Room Pattern | Audience | Events Emitted |
|-------------|----------|----------------|
| `teacher:session:<sessionId>` | Teacher dashboard only | `dashboard:update`, `dashboard:alert`, `dashboard:session_state` |
| `student:session:<sessionId>` | Students in session | `session:ended`, `violation:detected` |
| `session:<sessionId>` | All participants | Shared broadcast events |

### Background Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| Heartbeat Checker | 30s | Detects students with stale heartbeats (>45s), marks offline, creates `DISCONNECTION` violation |
| Sniffer Challenger | 60s | Phase 1: flags unanswered challenges (>15s) as `SNIFFER_TIMEOUT`. Phase 2: sends new challenge to all students |
| Timer Checker | 10s | Auto-ends expired sessions (duration elapsed) |

## Frontend Architecture

```
frontend/src/
├── main.tsx                # Entry point: React root, ErrorBoundary wrapper
├── App.tsx                 # BrowserRouter, route definitions, auth guards
├── index.css               # Tailwind CSS directives
├── config/
│   └── api.ts              # API_BASE_URL and SOCKET_URL resolution
├── hooks/
│   ├── useExamSocket.ts    # Student socket connection (register, heartbeat, violations)
│   ├── useTeacherSocket.ts # Teacher socket connection (dashboard, session management)
│   └── useInternetSniffer.ts # Client-side internet detection via image probing
├── components/
│   ├── ErrorBoundary.tsx   # React class error boundary with fallback UI
│   ├── StudentLogin.tsx    # Student login form (validates session code via API)
│   ├── TeacherLogin.tsx    # Teacher login form (HMAC password auth)
│   ├── SecureExamMonitor.tsx # Main student view: monitoring, file upload, violation display
│   ├── TeacherDashboard.tsx # Teacher overview: session list, create session
│   ├── SessionDetail.tsx   # Session detail: student grid, violations, submissions
│   ├── common/             # Reusable UI primitives
│   │   ├── Button.tsx      # 6 variants: primary, secondary, danger, outline, ghost, link
│   │   ├── Card.tsx        # Container with title/subtitle/footer/padding options
│   │   ├── Input.tsx       # Form input with label, error, accessibility
│   │   ├── Modal.tsx       # Overlay dialog with size/close/scroll lock
│   │   ├── ConfirmationModal.tsx # Confirm/cancel dialog with danger mode
│   │   ├── FullScreenAlert.tsx   # Full-viewport status display (4 variants)
│   │   ├── StatusBadge.tsx # Status indicator (7 variants with optional pulse)
│   │   └── Table.tsx       # Generic data table with row click support
│   └── layout/
│       └── Header.tsx      # App header with connection status, back/logout
└── context/                # (empty - future use)
```

## Database Schema (Prisma/SQLite)

```
┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Session  │────<│   Student    │────<│  Violation  │
│           │     │              │     └────────────┘
│ id (uuid) │     │ id (uuid)    │
│ code (6)  │     │ studentId    │     ┌────────────┐
│ isActive  │     │ name         │────<│ Submission  │
│ duration  │     │ isOnline     │     └────────────┘
│ createdAt │     │ lastHeartbeat│
│ endedAt   │     │ sessionId FK │     ┌─────────────┐
└──────────┘     └──────────────┘     │ CheckTarget  │
      │                                │ url (unique) │
      └───────────────────────────────<│ isEnabled    │
              (Submission.sessionId)   └─────────────┘
```

### Models

| Model | Fields | Relationships |
|-------|--------|---------------|
| **Session** | id, code (unique 6-digit), isActive, durationMinutes, createdAt, endedAt | Has many Students, Submissions |
| **Student** | id, studentId, name, ipAddress, isOnline, lastHeartbeat | Belongs to Session; Has many Violations, Submissions |
| **Violation** | id, type, timestamp, details | Belongs to Student |
| **CheckTarget** | id, url (unique), isEnabled | Standalone (sniffer probe targets) |
| **Submission** | id, originalName, storedName, mimeType, sizeBytes | Belongs to Student and Session |

### Violation Types

| Type | Trigger | Source |
|------|---------|--------|
| `INTERNET_ACCESS` | Student's browser can reach external URLs | Client-side sniffer or server-side challenge |
| `DISCONNECTION` | Student socket disconnects or goes offline | Socket `disconnect` event, heartbeat checker, or prolonged absence |
| `SNIFFER_TIMEOUT` | Student does not respond to server challenge within 15s | Sniffer challenger background job |

## Authentication Flow

```
Teacher:
  1. POST /api/auth/teacher { password }
  2. Server verifies against TEACHER_PASSWORD env var
  3. Returns HMAC-SHA256 signed token { role: 'teacher', iat }
  4. Token stored in localStorage, sent in Authorization header + socket auth

Student:
  1. Enter name, studentId, sessionCode in login form
  2. GET /api/session/:code validates session exists and is active
  3. Socket.io connect → emit 'register' { studentId, name, sessionCode }
  4. Server upserts student record, joins rooms, sends 'registered' ack
```

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Health check |
| POST | `/api/auth/teacher` | None | Teacher login (returns token) |
| GET | `/api/session/:code` | None | Validate session code |
| GET | `/api/check-targets` | None | List probe target URLs |
| POST | `/api/upload/:sessionCode` | None | Student file upload (multipart, 50MB limit) |
| GET | `/api/submissions/:sessionCode` | Bearer token | List session submissions |
| GET | `/api/submissions/:sessionCode/download/:storedName` | Bearer token/query | Download specific file |

## Port Strategy

| Mode | Backend Port | Frontend |
|------|-------------|----------|
| Docker (dev) | 4444 | Vite dev server on 5174 |
| Docker (prod) | 3333 | Served by Express static |
