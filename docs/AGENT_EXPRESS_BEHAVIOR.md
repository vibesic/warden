# AI Agent Express Behavior - Quick Reference

**Project**: Proctor App (proctor-app)  
**Framework**: Express.js + Socket.io + TypeScript + Prisma  
**Architecture**: Layered (Routes → Middleware → Controllers → Services → Database) + Socket.io Gateway

## Architecture Pattern

```
HTTP Routes (REST endpoints)
  ↓
Middleware (Auth, validation)
  ↓
Controllers (Request handling)
  ↓
Services (Business logic)
  ↓
Database (Prisma ORM → SQLite)

Socket.io Gateway (Real-time)
  ↓
Handlers (studentHandlers, teacherHandlers)
  ↓
Services (Business logic)
  ↓
Database (Prisma ORM → SQLite)

Background Jobs (backgroundJobs.ts)
  ↓
Heartbeat checker, Sniffer challenger, Timer checker
```

## File Structure

```
backend/src/
├── app.ts            # Express app + Socket.io setup
├── server.ts         # Entry point (starts HTTP server)
├── controllers/      # HTTP request handlers
├── services/         # Business logic (auth, session, student, violation)
├── gateway/          # Socket.io layer
│   ├── socket.ts     # Socket.io initialization + room management
│   ├── studentHandlers.ts  # Student events (register, heartbeat, violations)
│   ├── teacherHandlers.ts  # Teacher events (dashboard, session management)
│   └── backgroundJobs.ts   # Periodic jobs (heartbeat check, sniffer challenge)
├── middleware/        # Auth middleware (HMAC token verification)
├── routes/            # API route definitions
├── types/             # TypeScript type definitions
├── utils/             # Logger, Prisma client, error classes
└── __tests__/         # Vitest test files
```

## Controller Pattern

### Responsibilities

- Handle HTTP request/response **ONLY**
- Extract data from request
- Call service methods
- Format response
- **NO business logic**

### Template

```typescript
export const sessionController = {
  async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { durationMinutes } = req.body;
      const session = await sessionService.createSession(durationMinutes);

      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  },
};
```

### Response Format

```typescript
// Success (200, 201)
{ success: true, data: { ... }, message?: "Optional" }

// Error (400, 401, 403, 404, 500)
{ success: false, message: "Error message", errors?: [...] }
```

## Service Pattern

### Responsibilities

- Implement **ALL business logic**
- Database operations via Prisma
- Validate business rules
- **NO HTTP concerns**

### Template

```typescript
export const sessionService = {
  async createSession(durationMinutes?: number): Promise<Session> {
    const code = generateSessionCode();

    return await prisma.session.create({
      data: { code, durationMinutes },
    });
  },

  async validateSession(code: string): Promise<Session> {
    const session = await prisma.session.findUnique({
      where: { code },
    });

    if (!session || !session.isActive) {
      throw new AppError('Invalid or inactive session', 400);
    }

    return session;
  },
};
```

## Socket.io Gateway Pattern

### Room Structure

```
teacher:session:<sessionId>   → Dashboard events (violations, student status)
student:session:<sessionId>   → Student events (session:ended only)
session:<sessionId>           → Shared events
```

### Student Handler Pattern

```typescript
export const registerStudentHandlers = (io: Server, socket: Socket): void => {
  socket.on('register', async (data: unknown) => {
    const parsed = RegisterSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { message: 'Invalid registration data' });
      return;
    }

    // Business logic via services
    const session = await validateSession(parsed.data.sessionCode);
    const student = await registerStudent(parsed.data, session.id);

    // Join rooms
    socket.join(`session:${session.id}`);
    socket.join(`student:session:${session.id}`);

    // Notify teacher dashboard
    io.to(`teacher:session:${session.id}`).emit('student:joined', studentData);
  });
};
```

### Teacher Handler Pattern

```typescript
export const registerTeacherHandlers = (io: Server, socket: Socket): void => {
  socket.on('teacher:join_session', async (data: unknown) => {
    // Join teacher-specific room for dashboard events
    socket.join(`teacher:session:${sessionId}`);
  });

  socket.on('session:end', async () => {
    // Notify students via student-specific room
    io.to(`student:session:${sessionId}`).emit('session:ended');
  });
};
```

## Background Jobs Pattern

```typescript
// Periodic tasks running on intervals
export const startBackgroundJobs = (io: Server): NodeJS.Timeout[] => {
  const heartbeatChecker = setInterval(() => checkHeartbeats(io), 10000);
  const snifferChallenger = setInterval(() => issueSniffer(io), 30000);

  return [heartbeatChecker, snifferChallenger];
};
```

## Middleware Pattern

### Authentication (HMAC-SHA256)

```typescript
export const requireTeacherAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  const payload = verifyToken(token);
  if (payload.role !== 'teacher') {
    res.status(403).json({ success: false, message: 'Teacher access required' });
    return;
  }

  next();
};
```

## API Routes

```typescript
// Current API endpoints
app.post('/api/auth/login', authController.login);
app.get('/api/check-targets', requireTeacherAuth, checkTargetController.getAll);
app.post('/api/sessions', requireTeacherAuth, sessionController.create);
app.post('/api/upload', uploadMiddleware, uploadController.upload);
app.get('/api/submissions/:sessionCode', requireTeacherAuth, submissionController.list);
app.get('/api/submissions/:sessionCode/download/:storedName', submissionController.download);
```

## Database Patterns (Prisma + SQLite)

### Use Transactions

```typescript
await prisma.$transaction(async (tx) => {
  await tx.session.update({
    where: { id: sessionId },
    data: { isActive: false, endedAt: new Date() },
  });
  await tx.student.updateMany({
    where: { sessionId },
    data: { isOnline: false },
  });
});
```

### Use Includes for Relations

```typescript
const session = await prisma.session.findUnique({
  where: { code },
  include: {
    students: { include: { violations: true } },
  },
});
```

## HTTP Status Codes

| Code | Usage                                |
| ---- | ------------------------------------ |
| 200  | Success (GET, PUT)                   |
| 201  | Created (POST)                       |
| 400  | Bad Request (validation errors)      |
| 401  | Unauthorized (no/invalid token)      |
| 403  | Forbidden (insufficient role)        |
| 404  | Not Found                            |
| 500  | Internal Server Error                |

## Critical Rules

1. **Separation**: Controllers handle HTTP, services handle business logic
2. **Socket isolation**: Dashboard events go to `teacher:session:*` rooms only
3. **Zod validation**: All Socket.io and HTTP inputs validated with Zod
4. **Transactions**: Use for multi-step DB operations
5. **HMAC auth**: Teacher endpoints require valid HMAC-SHA256 token
6. **No Redis**: No caching layer — SQLite handles all data
7. **Port 3333**: Backend binds to 0.0.0.0:3333 for LAN access
8. **Consistent responses**: Always use `{ success, data?, message?, errors? }`
