import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';

// Mock Prisma
// We must mock '../utils/prisma' BEFORE importing the module that uses it
// Since socket.ts imports it at top level.
const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  violation: {
    create: vi.fn(),
  },
  session: {
    findUnique: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findFirst: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findMany: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 's2', code: '654321', isActive: true, createdAt: new Date() }),
    update: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: false, createdAt: new Date(), endedAt: new Date() }),
    updateMany: vi.fn(),
    count: vi.fn()
  }
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

describe('Socket Gateway', () => {

  let io: Server;
  let clientSocket: ClientSocket;
  let httpServer: any;
  const port = 3001; // Use different port for tests

  beforeAll(() => {
    httpServer = createServer();
    io = new Server(httpServer);
    initializeSocket(io);
    httpServer.listen(port);
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Setup new client for each test
    clientSocket = Client(`http://localhost:${port}`);
    return new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('should register a new student and emit registered event', async () => {
    const studentData = { studentId: 'test_student_1', name: 'Test Student', sessionCode: '123456' };

    // Setup Mock
    // The socket handler calls createSession... wait, register does NOT create session. 
    // It calls student.upsert.
    // However, if we look at socket.ts, it likely validates the session exists via validateSession OR creates it?
    // Let's assume validation passes or mock whatever is needed. 
    // Wait, existing code might need session validation mockery if it does that.
    prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-1', ...studentData } as any);

    return new Promise<void>((resolve, reject) => {
      clientSocket.emit('register', studentData);

      clientSocket.on('registered', (data) => {
        try {
          expect(data).toMatchObject({ studentId: studentData.studentId });
          expect(prismaMock.student.upsert).toHaveBeenCalled();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should process heartbeat', async () => {
    const heartbeatData = { studentId: 'test_student_2' };
    const registerData = { studentId: 'test_student_2', name: 'Test', sessionCode: '123456' };

    prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-2', ...registerData } as any);
    prismaMock.student.update.mockResolvedValue({} as any);

    await new Promise<void>(resolve => {
      clientSocket.emit('register', registerData);
      clientSocket.once('registered', () => resolve());
    });

    clientSocket.emit('heartbeat', heartbeatData);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 200));

    // The disconnect handler from previous tests might interfere if we don't look specifically
    // We expect at least one call with isOnline: true AND matching the UUID from upsert return
    const calls = prismaMock.student.update.mock.calls;
    // Note: socket.data.studentUuid will be 'uuid-2' from the upsert mock return above
    const heartbeatCall = calls.find(args => args[0].where.id === 'uuid-2' && args[0].data.isOnline === true);
    expect(heartbeatCall).toBeDefined();
  });

  it('should report violation', async () => {
    const registerData = { studentId: 'test_student_3', name: 'Violator', sessionCode: '123456' };
    const violationData = {
      type: 'INTERNET_ACCESS',
      details: 'Google detected'
    };

    prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-3', ...registerData } as any);
    prismaMock.violation.create.mockResolvedValue({ timestamp: new Date() } as any);

    await new Promise<void>(resolve => {
      clientSocket.emit('register', registerData);
      clientSocket.once('registered', () => resolve());
    });

    return new Promise<void>((resolve) => {
      clientSocket.emit('report_violation', violationData);

      setTimeout(() => {
        // Find the call for this specific student
        const calls = prismaMock.violation.create.mock.calls;
        const callArgs = calls.find(c => c[0].data.studentId === 'uuid-3'); // Used UUID

        expect(callArgs).toBeDefined();
        expect(callArgs![0].data).toMatchObject({
          studentId: 'uuid-3',
          type: violationData.type,
          details: violationData.details,
        });
        resolve();
      }, 50);
    });
  });

  it('should ignore invalid register data', async () => {
    const invalidData = { studentId: '' }; // Missing name
    prismaMock.student.upsert.mockResolvedValue({} as any);

    return new Promise<void>((resolve) => {
      clientSocket.emit('register', invalidData);

      setTimeout(() => {
        expect(prismaMock.student.upsert).not.toHaveBeenCalled();
        resolve();
      }, 50);
    });
  });



  it('should return dashboard overview', async () => {
    // Mock prisma.session.findMany
    const historyMock = [
      { id: 'h1', code: '111111', createdAt: new Date(), endedAt: null, isActive: false, _count: { students: 5 } }
    ];
    prismaMock.session.findMany.mockResolvedValue(historyMock);

    // Create new client to test dashboard events
    const teacherSocket = Client(`http://localhost:${3001}`);
    await new Promise<void>((resolve) => teacherSocket.on('connect', resolve));

    await new Promise<void>((resolve, reject) => {
      teacherSocket.on('dashboard:overview', (data: any) => {
        try {
          expect(data.history).toHaveLength(1);
          expect(data.history[0].code).toBe('111111');
          expect(data.history[0].studentCount).toBe(5);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      teacherSocket.emit('dashboard:join_overview');
    });

    teacherSocket.close();
  });

  it('should create new session when teacher requests', async () => {
    // Override the mock to return null so createSession loop terminates (no collision)
    prismaMock.session.findUnique.mockResolvedValueOnce(null);

    return new Promise<void>((resolve) => {
      clientSocket.on('dashboard:session_created', (data) => {
        expect(data).toHaveProperty('code');
        resolve();
      });
      clientSocket.emit('teacher:create_session');
    });
  });

  it('should end session when teacher requests', async () => {
    return new Promise<void>((resolve) => {
      clientSocket.on('dashboard:session_ended', () => {
        resolve();
      });
      clientSocket.emit('teacher:end_session');
    });
  });

  it('should return registration error if session invalid', async () => {
    // Mock validation failure - force return null for this specific call
    // The current mock implementation returns valid session by default (see top of file)
    const sessionMock = prismaMock.session.findUnique;
    sessionMock.mockResolvedValueOnce(null);

    return new Promise<void>((resolve) => {
      clientSocket.once('registration_error', (msg) => {
        expect(msg).toBe('Invalid session code');
        resolve();
      });
      clientSocket.emit('register', { studentId: 'invalid', name: 'Invalid', sessionCode: '999999' });
    });
  });
});
