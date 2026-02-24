# AI Agent Test Behavior - Quick Reference

**Project**: Proctor App (proctor-app)  
**Framework**: Vitest with v8 coverage  
**Database**: SQLite (mocked via vitest.setup.ts)  
**Approach**: Unit and integration tests with Prisma mocking

## Testing Philosophy

**Test approach:**

- Unit tests for services and utility functions
- Integration tests for Socket.io handlers (real socket connections)
- Security tests for auth, validation, and isolation
- All database calls mocked via Prisma mock
- Real Socket.io server/client for gateway tests

**Why this approach:**

- Fast execution (no real database needed)
- Tests business logic in isolation
- Socket.io integration tests catch real event flow issues
- Coverage thresholds enforce quality (90%+ lines)

## Test Environment

### Architecture

```
Vitest Runner (Node.js)
  ↓
Test Files (*.test.ts)
  ↓ uses
Prisma Mock (vitest.setup.ts)
  ↓ for Socket.io tests
Real Socket.io Server + Client (in-memory)
```

### Prisma Mock Setup

```typescript
// vitest.setup.ts
import { vi } from 'vitest';

vi.mock('./src/utils/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    student: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    violation: { create: vi.fn() },
    submission: { create: vi.fn(), findMany: vi.fn() },
    checkTarget: { findMany: vi.fn() },
  },
}));
```

### Vitest Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      DATABASE_URL: 'file:./data/test.db',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
```

## Test Structure

### File Organization

```
backend/src/__tests__/
├── studentHandlers.test.ts   # Student Socket.io handler tests
├── teacherHandlers.test.ts   # Teacher Socket.io handler tests
├── backgroundJobs.test.ts    # Background job tests (heartbeat, sniffer)
├── security.test.ts          # Security-focused tests (auth, isolation)
├── upload.test.ts            # File upload endpoint tests
├── session.test.ts           # Session service tests
└── auth.test.ts              # Authentication tests
```

### Naming Convention

```
<feature>.test.ts  # Test file
```

## Test Template

### Socket.io Integration Test Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma as prismaMock } from '../utils/prisma';

describe('Student Handlers', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ClientSocket;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    // Register handlers
    registerStudentHandlers(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clientSocket = Client(`http://localhost:${port}`);
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  it('should register student with valid data', async () => {
    // Arrange
    const registerData = { studentId: 'STU001', name: 'John', sessionCode: '123456' };
    (prismaMock.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'session-id',
      isActive: true,
    });
    (prismaMock.student.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'student-id',
      ...registerData,
    });

    // Act
    clientSocket.emit('register', registerData);

    // Assert
    const result = await new Promise((resolve) => {
      clientSocket.once('registered', resolve);
    });
    expect(result).toBeDefined();
  });
});
```

### Service Unit Test Pattern

```typescript
describe('Session Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session with valid code', async () => {
    // Arrange
    const mockSession = { id: 'uuid', code: '123456', isActive: true };
    (prismaMock.session.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

    // Act
    const result = await sessionService.createSession();

    // Assert
    expect(result.code).toHaveLength(6);
    expect(prismaMock.session.create).toHaveBeenCalled();
  });
});
```

### Security Test Pattern

```typescript
describe('Security', () => {
  it('should reject invalid violation types', async () => {
    const socket = await connectStudent();
    await registerStudent(socket);

    socket.emit('report_violation', { type: 'FAKE_TYPE' });
    await new Promise((r) => setTimeout(r, 200));

    expect(prismaMock.violation.create).not.toHaveBeenCalled();
    socket.disconnect();
  });

  it('should isolate dashboard events from student sockets', async () => {
    const teacherSocket = await connectTeacher();
    const studentSocket = await connectStudent();

    // Student should NOT receive teacher dashboard events
    const spy = vi.fn();
    studentSocket.on('student:violation', spy);

    // Trigger a violation
    // ...

    expect(spy).not.toHaveBeenCalled();
  });
});
```

## Running Tests

### Commands

```bash
# Run all tests
cd backend && npx vitest run

# Run with coverage
cd backend && npx vitest run --coverage

# Run specific test file
cd backend && npx vitest run src/__tests__/security.test.ts

# Run in watch mode
cd backend && npx vitest --watch

# Run tests matching pattern
cd backend && npx vitest run -t "should register student"
```

## Test Patterns

### AAA Pattern (Arrange-Act-Assert)

```typescript
it('should create violation record', async () => {
  // Arrange
  const violationData = { type: 'INTERNET_ACCESS', details: 'Reached google.com' };
  (prismaMock.violation.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'v-id',
    ...violationData,
  });

  // Act
  const socket = await connectStudent();
  await registerStudent(socket);
  socket.emit('report_violation', violationData);
  await new Promise((r) => setTimeout(r, 200));

  // Assert
  expect(prismaMock.violation.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ type: 'INTERNET_ACCESS' }),
    })
  );
});
```

### Testing Socket.io Events

```typescript
// Helper to wait for a socket event
const waitForEvent = <T>(socket: ClientSocket, event: string, timeout = 2000): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};
```

### Testing Authentication

```typescript
describe('Auth', () => {
  it('should reject request without token', async () => {
    const response = await request(app)
      .get('/api/check-targets')
      .expect(401);

    expect(response.body.success).toBe(false);
  });

  it('should accept request with valid token', async () => {
    const token = generateToken({ role: 'teacher' });
    const response = await request(app)
      .get('/api/check-targets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Coverage Thresholds

| Metric       | Threshold | Current  |
| ------------ | --------- | -------- |
| Lines        | 90%       | ~98%     |
| Functions    | 90%       | ~95%     |
| Branches     | 80%       | ~90%     |
| Statements   | 90%       | ~98%     |

## Critical Rules

1. **Mock Prisma**: Always use the mock from vitest.setup.ts, never real DB
2. **Real Socket.io**: Use real server/client for gateway integration tests
3. **Clear mocks**: Always `vi.clearAllMocks()` in `beforeEach`
4. **Cleanup**: Close sockets and servers in `afterAll`
5. **AAA pattern**: Arrange → Act → Assert in every test
6. **Descriptive names**: Use `should <behavior>` pattern
7. **Coverage**: Maintain 90%+ lines, 80%+ branches
8. **Security tests**: Always test auth, input validation, and room isolation

## Quick Decision Tree

**Need to test Socket.io handler?**
→ Create real Socket.io server + client, mock Prisma

**Need to test HTTP endpoint?**
→ Use supertest with app, mock Prisma

**Need to test service logic?**
→ Mock Prisma, call service directly

**Need to test security?**
→ Test auth bypass, invalid inputs, room isolation

**Tests timing out?**
→ Increase timeout, check socket cleanup, verify mock return values
