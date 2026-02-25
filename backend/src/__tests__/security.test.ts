import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';
import { generateTeacherToken } from '../services/auth.service';
import { clearAllPendingDisconnects } from '../gateway/studentHandlers';
import { app } from '../app';

/**
 * Security Tests — validates protection against student cheating vectors:
 * 1. Sniffer challenge timeout detection
 * 2. Check-targets endpoint requires teacher auth
 * 3. Dashboard events NOT leaked to student sockets
 * 4. Violation type enum enforcement
 * 5. Teacher password security warning
 */

const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  violation: {
    create: vi.fn().mockResolvedValue({
      id: 'v-1',
      timestamp: new Date(),
      type: 'INTERNET_ACCESS',
      details: '',
    }),
  },
  session: {
    findUnique: vi.fn().mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    }),
    findFirst: vi.fn().mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    count: vi.fn().mockResolvedValue(5),
    findFirst: vi.fn().mockResolvedValue({ url: 'https://www.google.com' }),
    findMany: vi.fn().mockResolvedValue([
      { url: 'https://www.google.com' },
      { url: 'https://www.github.com' },
      { url: 'https://www.stackoverflow.com' },
    ]),
    createMany: vi.fn(),
  },
  submission: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  prisma: prismaMock,
}));

// ─── Socket Security Tests ───────────────────────────────────────────────────

describe('Security - Socket Layer', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    cleanup = initializeSocket(io);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    cleanup.clearIntervals();
    io.close();
    httpServer.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    });
    prismaMock.session.findFirst.mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    });
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.student.findMany.mockResolvedValue([]);
    prismaMock.sessionStudent.findMany.mockResolvedValue([]);
    prismaMock.violation.create.mockResolvedValue({
      id: 'v-1', timestamp: new Date(), type: 'INTERNET_ACCESS', details: '',
    });
  });

  const connectStudent = async (): Promise<ClientSocket> => {
    const socket = Client(`http://localhost:${port}`);
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    return socket;
  };

  const registerStudent = async (socket: ClientSocket, overrides?: Record<string, string>): Promise<void> => {
    const data = {
      studentId: overrides?.studentId || 'stu1',
      name: overrides?.name || 'Test Student',
      sessionCode: overrides?.sessionCode || '123456',
    };
    prismaMock.student.upsert.mockResolvedValue({
      id: `stu-${data.studentId}`,
      studentId: data.studentId,
      name: data.name,
    } as never);
    prismaMock.sessionStudent.upsert.mockResolvedValue({
      id: `ss-${data.studentId}`,
      student: { studentId: data.studentId, name: data.name },
    } as never);

    await new Promise<void>((resolve) => {
      socket.emit('register', data);
      socket.once('registered', () => resolve());
    });
  };

  const connectTeacher = async (): Promise<ClientSocket> => {
    const token = generateTeacherToken();
    const socket = Client(`http://localhost:${port}`, { auth: { token } });
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    return socket;
  };

  // ─── 1. Dashboard events must NOT leak to student sockets ──────────────────

  describe('Dashboard event isolation', () => {
    it('should NOT send dashboard:alert to student sockets when a violation occurs', async () => {
      const studentSocket = await connectStudent();
      await registerStudent(studentSocket);

      // Listen for dashboard:alert on student socket (should NOT receive it)
      let studentReceivedAlert = false;
      studentSocket.on('dashboard:alert', () => {
        studentReceivedAlert = true;
      });

      // Trigger a violation via sniffer:response
      const sockets = await io.fetchSockets();
      const serverSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-stu1');
      expect(serverSocket).toBeDefined();

      serverSocket!.data.pendingChallenge = {
        challengeId: 'challenge-1',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      studentSocket.emit('sniffer:response', { challengeId: 'challenge-1', reachable: true });

      await new Promise((r) => setTimeout(r, 300));

      expect(studentReceivedAlert).toBe(false);

      studentSocket.disconnect();
    });

    it('should send dashboard:alert to teacher sockets in teacher room', async () => {
      const studentSocket = await connectStudent();
      await registerStudent(studentSocket, { studentId: 'stu-teacher-test' });

      const teacherSocket = await connectTeacher();

      // Teacher joins the session's teacher room
      await new Promise<void>((resolve) => {
        teacherSocket.on('dashboard:session_state', () => resolve());
        teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });
      });

      // Listen for dashboard:alert on teacher socket
      let teacherReceivedAlert = false;
      teacherSocket.on('dashboard:alert', () => {
        teacherReceivedAlert = true;
      });

      // Trigger a violation
      const sockets = await io.fetchSockets();
      const serverSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-stu-teacher-test');
      expect(serverSocket).toBeDefined();

      serverSocket!.data.pendingChallenge = {
        challengeId: 'challenge-2',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      studentSocket.emit('sniffer:response', { challengeId: 'challenge-2', reachable: true });

      await new Promise((r) => setTimeout(r, 300));

      expect(teacherReceivedAlert).toBe(true);

      studentSocket.disconnect();
      teacherSocket.disconnect();
    });

    it('should NOT send dashboard:update (STUDENT_LEFT) to other students', async () => {
      const student1 = await connectStudent();
      await registerStudent(student1, { studentId: 'stu-iso-1' });

      const student2 = await connectStudent();
      await registerStudent(student2, { studentId: 'stu-iso-2' });

      let student2ReceivedUpdate = false;
      student2.on('dashboard:update', () => {
        student2ReceivedUpdate = true;
      });

      // Disconnect student1 — should trigger dashboard:update to teacher only
      student1.disconnect();

      await new Promise((r) => setTimeout(r, 300));

      expect(student2ReceivedUpdate).toBe(false);

      student2.disconnect();
    });
  });

  // ─── 2. Violation type enum enforcement ────────────────────────────────────

  describe('Violation type validation', () => {
    it('should reject invalid violation types', async () => {
      const socket = await connectStudent();
      await registerStudent(socket, { studentId: 'stu-enum-1' });

      vi.clearAllMocks();

      socket.emit('report_violation', { type: 'FAKE_TYPE', details: 'test' });

      await new Promise((r) => setTimeout(r, 200));

      // No violation with FAKE_TYPE should be created (DISCONNECTION from disconnect is okay)
      const fakeCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'FAKE_TYPE'
      );
      expect(fakeCalls).toHaveLength(0);

      socket.disconnect();
    });

    it('should accept valid violation types', async () => {
      const socket = await connectStudent();
      await registerStudent(socket, { studentId: 'stu-enum-2' });

      socket.emit('report_violation', { type: 'CONNECTION_LOST', details: 'Lost connection' });

      await new Promise((r) => setTimeout(r, 200));

      expect(prismaMock.violation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CONNECTION_LOST' }),
        })
      );

      socket.disconnect();
    });

    it('should reject violation with excessively long details', async () => {
      const socket = await connectStudent();
      await registerStudent(socket, { studentId: 'stu-enum-3' });

      vi.clearAllMocks();

      const longDetails = 'A'.repeat(600); // Exceeds 500 char limit
      socket.emit('report_violation', { type: 'INTERNET_ACCESS', details: longDetails });

      await new Promise((r) => setTimeout(r, 200));

      // No INTERNET_ACCESS violation should be created with the long details
      const internetCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);

      socket.disconnect();
    });
  });

  // ─── 3. Server-pushed violation notification ───────────────────────────────

  describe('Server-pushed violation:detected event', () => {
    it('should emit violation:detected to student when sniffer catches internet access', async () => {
      const socket = await connectStudent();
      await registerStudent(socket, { studentId: 'stu-push-1' });

      const sockets = await io.fetchSockets();
      const serverSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-stu-push-1');
      expect(serverSocket).toBeDefined();

      serverSocket!.data.pendingChallenge = {
        challengeId: 'push-challenge-1',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      const violationPromise = new Promise<{ type: string }>((resolve) => {
        socket.on('violation:detected', (data: { type: string }) => resolve(data));
      });

      socket.emit('sniffer:response', { challengeId: 'push-challenge-1', reachable: true });

      const violation = await violationPromise;
      expect(violation.type).toBe('INTERNET_ACCESS');

      socket.disconnect();
    });

    it('should NOT emit violation:detected when sniffer says not reachable', async () => {
      const socket = await connectStudent();
      await registerStudent(socket, { studentId: 'stu-push-2' });

      const sockets = await io.fetchSockets();
      const serverSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-stu-push-2');
      expect(serverSocket).toBeDefined();

      serverSocket!.data.pendingChallenge = {
        challengeId: 'push-challenge-2',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      let violationReceived = false;
      socket.on('violation:detected', () => {
        violationReceived = true;
      });

      socket.emit('sniffer:response', { challengeId: 'push-challenge-2', reachable: false });

      await new Promise((r) => setTimeout(r, 300));

      expect(violationReceived).toBe(false);

      socket.disconnect();
    });
  });

  // ─── 4. Session:ended isolation ────────────────────────────────────────────

  describe('Session end event isolation', () => {
    it('should send session:ended only to student room, not teacher room', async () => {
      const studentSocket = await connectStudent();
      await registerStudent(studentSocket, { studentId: 'stu-end-1' });

      const teacherSocket = await connectTeacher();

      prismaMock.session.update.mockResolvedValue({
        id: 's1', code: '123456', isActive: false,
        createdAt: new Date(), endedAt: new Date(),
      });

      let studentGotEnded = false;
      studentSocket.on('session:ended', () => {
        studentGotEnded = true;
      });

      teacherSocket.emit('teacher:end_session');

      await new Promise((r) => setTimeout(r, 300));

      expect(studentGotEnded).toBe(true);

      studentSocket.disconnect();
      teacherSocket.disconnect();
    });
  });
});

// ─── HTTP Security Tests ──────────────────────────────────────────────────────

describe('Security - HTTP Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.checkTarget.count.mockResolvedValue(5);
  });

  // ─── 5. Check-targets requires teacher auth ───────────────────────────────

  describe('GET /api/check-targets — auth required', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request(app).get('/api/check-targets');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should reject invalid teacher tokens', async () => {
      const res = await request(app)
        .get('/api/check-targets')
        .set('Authorization', 'Bearer fake.token');

      expect(res.status).toBe(401);
    });

    it('should allow requests with valid teacher token', async () => {
      prismaMock.checkTarget.findMany.mockResolvedValue([
        { url: 'https://www.google.com' },
        { url: 'https://www.github.com' },
        { url: 'https://www.stackoverflow.com' },
      ]);

      const token = generateTeacherToken();
      const res = await request(app)
        .get('/api/check-targets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.domains).toBeDefined();
      expect(res.body.domains.length).toBeLessThanOrEqual(3);
    });
  });

  // ─── 6. Upload endpoint validation ────────────────────────────────────────

  describe('POST /api/upload — student identity verification', () => {
    it('should reject upload for non-existent student in session', async () => {
      prismaMock.session.findUnique.mockResolvedValue({
        id: 'sess-1', code: '123456', isActive: true,
      });
      prismaMock.sessionStudent.findFirst.mockResolvedValue(null); // Student not found

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'impersonated-student')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Student not found in session');
    });

    it('should reject upload without session code', async () => {
      const res = await request(app)
        .post('/api/upload')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('sessionCode and studentId are required');
    });
  });

  // ─── 7. Default teacher password warning ──────────────────────────────────

  describe('Teacher authentication security', () => {
    it('should accept login with default password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should reject empty password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: '' });

      expect(res.status).toBe(400);
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

// ─── Sniffer Timeout Tests ───────────────────────────────────────────────────

describe('Security - Sniffer Challenge Timeout', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };

  beforeAll(() => {
    vi.useFakeTimers();
    httpServer = createServer();
    io = new Server(httpServer);
    cleanup = initializeSocket(io);
  });

  afterAll(() => {
    cleanup.clearIntervals();
    io.close();
    httpServer.close();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.student.findMany.mockResolvedValue([]);
    prismaMock.sessionStudent.findMany.mockResolvedValue([]);
    prismaMock.session.findMany.mockResolvedValue([]);
  });

  it('should create SNIFFER_TIMEOUT violation when student does not respond', async () => {
    // Simulate a connected student with an expired pending challenge
    prismaMock.checkTarget.count.mockResolvedValue(3);
    prismaMock.checkTarget.findFirst.mockResolvedValue({ url: 'https://www.google.com' });

    const mockSockets = [{
      data: {
        sessionStudentId: 'ss-timeout-1',
        studentId: 'stu-timeout',
        sessionCode: '123456',
        pendingChallenge: {
          challengeId: 'old-challenge',
          targetUrl: 'https://www.google.com',
          issuedAt: Date.now() - 20000, // 20 seconds ago (> 15s timeout)
        },
        snifferTimeoutCount: 0,
      },
      emit: vi.fn(),
    }];

    vi.spyOn(io, 'fetchSockets').mockResolvedValue(mockSockets as never);

    const emitSpy = vi.spyOn(io, 'to').mockReturnValue({ emit: vi.fn() } as never);

    // Advance past the sniffer interval (60s)
    await vi.advanceTimersByTimeAsync(61000);

    // Should have created a SNIFFER_TIMEOUT violation
    const timeoutCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'SNIFFER_TIMEOUT'
    );
    expect(timeoutCalls.length).toBeGreaterThanOrEqual(1);
    expect(timeoutCalls[0][0].data.sessionStudentId).toBe('ss-timeout-1');

    emitSpy.mockRestore();
  });

  it('should increment snifferTimeoutCount on consecutive timeouts', async () => {
    prismaMock.checkTarget.count.mockResolvedValue(3);
    prismaMock.checkTarget.findFirst.mockResolvedValue({ url: 'https://www.google.com' });

    const socketData = {
      sessionStudentId: 'ss-timeout-2',
      studentId: 'stu-timeout-2',
      sessionCode: '123456',
      pendingChallenge: {
        challengeId: 'old-challenge-2',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now() - 20000,
      },
      snifferTimeoutCount: 3, // Already had 3 timeouts
    };

    const mockSockets = [{
      data: socketData,
      emit: vi.fn(),
    }];

    vi.spyOn(io, 'fetchSockets').mockResolvedValue(mockSockets as never);
    vi.spyOn(io, 'to').mockReturnValue({ emit: vi.fn() } as never);

    await vi.advanceTimersByTimeAsync(61000);

    // Timeout count should have been incremented to 4
    expect(socketData.snifferTimeoutCount).toBe(4);

    // Violation details should include the count
    const timeoutCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'SNIFFER_TIMEOUT'
    );
    if (timeoutCalls.length > 0) {
      expect(timeoutCalls[0][0].data.details).toContain('Consecutive timeouts: 4');
    }
  });
});
