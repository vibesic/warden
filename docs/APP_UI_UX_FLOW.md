# Proctor App - UI/UX Flow

## User Roles

| Role | Access | Purpose |
|------|--------|---------|
| **Teacher** | Dashboard, session management, violation monitoring, file downloads | Creates exam sessions, monitors students in real-time |
| **Student** | Login, exam view, file upload | Joins exam session, stays monitored, submits work |

## Screen Map

```
                    ┌─────────────────┐
                    │   / (root)       │
                    │  Redirects to    │
                    │  /student/login  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  /student/login   │◄────────│  /teacher/login   │
    │  StudentLogin     │────────►│  TeacherLogin     │
    │                   │ switch   │                   │
    └────────┬─────────┘          └────────┬─────────┘
             │ login                        │ login
             ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  /student/exam    │          │  /teacher          │
    │  StudentExamPage  │          │  TeacherDashboard  │
    │  + SecureExam     │          │                    │
    │    Monitor        │          └────────┬───────────┘
    └──────────────────┘                    │ click session
                                            ▼
                                  ┌──────────────────────┐
                                  │  /teacher/session/:code│
                                  │  SessionDetail         │
                                  └────────────────────────┘
```

## Flow 1: Student Login and Exam

### Step 1 - Student Login (`/student/login`)

**Component:** `StudentLogin`

1. Student enters **Full Name**, **Student ID**, and **Session Code**
2. Form validates all fields are non-empty
3. `GET /api/session/:code` validates the session exists and is active
4. On success: stores `studentId`, `studentName`, `sessionCode` in `localStorage`
5. Navigates to `/student/exam`
6. On failure: shows inline error ("Invalid session code" or "Session has ended")
7. "Are you a Teacher?" link switches to `/teacher/login`

**Validation:**
- All three fields required
- Session code checked against backend (must exist and be active)

### Step 2 - Exam View (`/student/exam`)

**Component:** `StudentExamPage` wrapping `SecureExamMonitor`

**Auth Guard:** Redirects to `/student/login` if `localStorage` is missing `studentId`, `studentName`, or `sessionCode`.

**Header displays:**
- "Exam Portal" title
- Welcome message: "Welcome, {name} ({studentId})"
- Session code badge
- Logout button

**SecureExamMonitor behavior:**

1. **Socket Connection** (`useExamSocket`):
   - Connects to Socket.io server
   - Emits `register` event with student credentials
   - Shows connection status (green badge = connected, red = disconnected)
   - Sends heartbeat every 2 seconds
   - Listens for `session:ended` event (shows end modal)
   - Listens for `sniffer:challenge` (probes target URL via image, responds)
   - Queues violations if not yet registered, flushes on registration

2. **Internet Monitoring** (`useInternetSniffer`):
   - Every 2 seconds, probes 3 random CDN URLs via `<img>` tags
   - If any resolve: sets `isSecure=false`, triggers violation
   - Reports `INTERNET_ACCESS` violation to server via socket

3. **Violation Alerts:**
   - **Violation detected**: Full-screen red alert "Internet Access Detected" - blocks all interaction
   - **All clear**: Full-screen green alert "Secure Connection - No Internet Detected"
   - Violations are reported once (not repeated), reset on reconnect

4. **Session Timer:**
   - If session has `durationMinutes`, shows countdown: "Time Remaining: HH:MM:SS"
   - Derived from `session.createdAt + session.durationMinutes`
   - Updates every 1 second
   - "No time limit" shown if `durationMinutes` is null

5. **File Upload:**
   - Students can upload files (exam submissions)
   - `POST /api/upload/:sessionCode` with multipart form data
   - 50MB limit per file, up to 4 files per upload
   - Shows uploaded file list with name, size, timestamp
   - Upload errors displayed inline

6. **Session Ended:**
   - Modal overlay: "Your exam session has been ended by the teacher"
   - "Return to Login" button clears `localStorage` and navigates to login

7. **Disconnection Handling:**
   - Tracks disconnect duration
   - If disconnected > 10 seconds: reports `CONNECTION_LOST` violation
   - Auto-reconnects (up to 5 attempts)

### Step 3 - Student Logout

- Clears all `localStorage` items
- Navigates to `/student/login`
- Also triggered by registration error from server

## Flow 2: Teacher Login and Dashboard

### Step 1 - Teacher Login (`/teacher/login`)

**Component:** `TeacherLogin`

1. Teacher enters **password**
2. `POST /api/auth/teacher { password }`
3. On success: stores `teacherMode=true` and `teacherToken` in `localStorage`
4. Navigates to `/teacher`
5. On failure: shows error "Invalid password"
6. "Are you a Student?" link switches to `/student/login`

### Step 2 - Teacher Dashboard (`/teacher`)

**Component:** `TeacherDashboard`

**Auth Guard:** `TeacherRoute` checks `localStorage.teacherMode === 'true'`, redirects to `/teacher/login` if not.

**Header:** Shows "Teacher Dashboard", connection status badge, logout button.

**Socket Connection** (`useTeacherSocket` with no `sessionCode`):
- Connects with auth token in handshake
- Emits `dashboard:join_overview`
- Receives `dashboard:overview` with `{ activeSession, history }`
- Listens for `dashboard:session_created` and `dashboard:session_ended`

**Dashboard Content:**

1. **Active Session Card** (if exists):
   - Shows session code (large, mono font)
   - Duration info ("Duration: X min" or "No time limit")
   - Student count
   - "View Details" button navigates to `/teacher/session/:code`

2. **Create Session** (if no active session):
   - "Create Exam Session" button
   - Optional duration input (minutes)
   - Emits `teacher:create_session` with optional `{ durationMinutes }`
   - Session auto-navigates to detail page after creation

3. **Session History Table:**
   - Columns: Code, Duration, Students, Created, Ended, Status
   - Each row clickable, navigates to `/teacher/session/:code`
   - Empty state: "No sessions yet"

### Step 3 - Session Detail (`/teacher/session/:code`)

**Component:** `SessionDetail`

**Socket Connection** (`useTeacherSocket` with `sessionCode`):
- Emits `dashboard:join_session { sessionCode }`
- Receives `dashboard:session_state` with full student list and violations
- Real-time updates via `dashboard:update` and `dashboard:alert`

**Header:** Session code in title, back button, connection status, logout.

**Session Info Card:**
- Status: Active (green badge) or Ended (gray badge)
- Duration: "X min" or "No limit"
- Timer: "Elapsed: HH:MM:SS" and "Remaining: HH:MM:SS" (if timed)
- Student count: "X online / Y total"
- "End Session" button (danger, requires confirmation modal)

**Student Monitoring (Active Session):**
- Grid of student cards (responsive: 1 col mobile, 2 sm, 3 lg)
- Each card shows:
  - Student name + ID
  - Online/Offline status (Wifi/WifiOff icon + StatusBadge)
  - Violation count (red badge if > 0, green if clean)
  - Click to open violation detail modal

**Student Table (Ended Session):**
- Table view with columns: Student ID, Name, Status, Violations
- Shows StatusBadge for online/offline
- Violation count as danger/success badge
- Click row for violation detail

**Violation Detail Modal:**
- Student name and ID in header
- List of violations sorted by timestamp (newest first)
- Each violation: type, timestamp, optional details
- Color-coded by type

**File Submissions Table:**
- Fetched via `GET /api/submissions/:sessionCode` every 15 seconds
- Columns: File Name, Student, Size, Uploaded At, Download
- Download button: `GET /api/submissions/:code/download/:storedName`

**Confirmation Modals:**
- End Session: "Are you sure? All students will be disconnected."
- Logout: "Are you sure you want to logout?"

### Step 4 - Teacher Logout

- Removes `teacherMode` and `teacherToken` from `localStorage`
- Navigates to `/teacher/login`

## Shared UI Components

### Common Components

| Component | Usage | Key Props |
|-----------|-------|-----------|
| `Button` | All action buttons | `variant` (6 types), `isLoading`, `icon` |
| `Card` | Content containers | `title`, `subtitle`, `footer`, `padding` |
| `Input` | All form fields | `label`, `error`, accessible IDs |
| `Modal` | Overlays/dialogs | `isOpen`, `size` (5 sizes), `closeOnBackdropClick` |
| `ConfirmationModal` | Confirm actions | `isDanger`, `onConfirm`, `onCancel` |
| `FullScreenAlert` | Full-viewport alerts | `variant` (danger/info/warning/success) |
| `StatusBadge` | Status indicators | `status` (7 types), `pulse` animation |
| `Table` | Data tables (generic) | `data`, `columns`, `keyExtractor`, `onRowClick` |
| `Header` | Page headers | `title`, `isConnected`, `onLogout`, `onBack` |

### Status Color System

| Status | Color | Usage |
|--------|-------|-------|
| Online/Active/Success | Green (green-500/emerald-500) | Connection OK, timer safe, clean students |
| Offline/Inactive | Gray (gray-400) | Disconnected, session ended |
| Violation/Danger | Red (red-600/rose-500) | Internet detected, violations, end session |
| Warning | Amber/Yellow | Time running low, potential issues |
| Info | Blue | Instructions, info notices |
| Primary actions | Indigo (indigo-600) | Buttons, links, session codes |

## Real-Time Event Flow

### Student Registers

```
Student Browser                    Server                     Teacher Dashboard
     │                              │                              │
     │──── connect ─────────────────►│                              │
     │──── register {sid,name,code}─►│                              │
     │                               │── upsert Student ──► DB     │
     │                               │── join rooms                │
     │◄──── registered {session} ────│                              │
     │                               │── dashboard:update ────────►│
     │                               │   {STUDENT_JOINED}          │
```

### Violation Detected

```
Student Browser                    Server                     Teacher Dashboard
     │                              │                              │
     │── report_violation ──────────►│                              │
     │   {type, details}             │── createViolation ──► DB    │
     │                               │── dashboard:alert ─────────►│
     │                               │   {studentId, violation}    │
```

### Session Ended by Teacher

```
Teacher Dashboard                  Server                     Student Browser
     │                              │                              │
     │── teacher:end_session ───────►│                              │
     │                               │── endSession ──► DB         │
     │                               │── session:ended ───────────►│
     │◄── dashboard:session_ended ──│                              │
     │                               │── markAllOffline ──► DB     │
```

### Sniffer Challenge

```
Server (Background Job)           Student Browser              Teacher Dashboard
     │                              │                              │
     │── sniffer:challenge ─────────►│                              │
     │   {challengeId, targetUrl}    │── probe <img> ──► URL       │
     │                               │◄─ onload/onerror            │
     │◄── sniffer:response ─────────│                              │
     │   {challengeId, reachable}    │                              │
     │                               │                              │
     │ (if reachable=true)           │                              │
     │── createViolation ──► DB      │                              │
     │── violation:detected ────────►│                              │
     │── dashboard:alert ───────────────────────────────────────►  │
     │                               │                              │
     │ (if no response in 15s)       │                              │
     │── SNIFFER_TIMEOUT violation ──────────────────────────────►  │
```
