import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';
import { generateTeacherToken } from '../services/auth.service';
import { clearAllPendingDisconnects } from '../gateway/studentHandlers';

/**
 * Security tests: race conditions, auth edge cases, input validation,
 * event isolation between sessions, Zod schema boundary testing.
 */

const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  violation: {
    create: vi.fn().mockResolvedValue({ id: 'v-1', timestamp: new Date(), type: 'DISCONNECTION', details: '' }),
  },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn(),
  },
}));

vi.mock('../utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Security Tests', () => {
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
    const defaultSession = {
      id: 's1',
      code: '123456',
      isActive: true,
      createdAt: new Date(),
      durationMinutes: 60,
    };
    prismaMock.session.findUnique.mockResolvedValue(defaultSession);
    prismaMock.session.findFirst.mockResolvedValue(defaultSession);
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.sessionStudent.findMany.mockResolvedValue([]);
  });

  describe('Registration Input Validation', () => {
    it('should reject empty studentId', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', { studentId: '', name: 'Test', sessionCode: '123456' });
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');
      expect(prismaMock.student.upsert).not.toHaveBeenCalled();

      socket.disconnect();
    });

    it('should reject empty name', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', { studentId: 'S001', name: '', sessionCode: '123456' });
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject session code that is not 6 characters', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', { studentId: 'S001', name: 'Test', sessionCode: '12345' }); // 5 chars
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject non-object register data', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', 'not-an-object');
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject null register data', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', null);
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });
  });

  describe('Violation Input Validation', () => {
    let registeredSocket: ClientSocket;

    beforeEach(async () => {
      registeredSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => registeredSocket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-sec', studentId: 'SEC01', name: 'Security' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-sec',
        student: { studentId: 'SEC01', name: 'Security' },
      });

      await new Promise<void>((resolve) => {
        registeredSocket.emit('register', { studentId: 'SEC01', name: 'Security', sessionCode: '123456' });
        registeredSocket.once('registered', () => resolve());
      });

      prismaMock.violation.create.mockClear();
    });

    afterEach(() => {
      if (registeredSocket.connected) registeredSocket.disconnect();
    });

    it('should reject violation with invalid type', async () => {
      registeredSocket.emit('report_violation', { type: 'INVALID_TYPE', details: 'test' });
      await new Promise((r) => setTimeout(r, 200));
      expect(prismaMock.violation.create).not.toHaveBeenCalled();
    });

    it('should reject violation without type', async () => {
      registeredSocket.emit('report_violation', { details: 'test' });
      await new Promise((r) => setTimeout(r, 200));
      expect(prismaMock.violation.create).not.toHaveBeenCalled();
    });

    it('should accept violation with valid type and no details', async () => {
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date() });
      registeredSocket.emit('report_violation', { type: 'INTERNET_ACCESS' });
      await new Promise((r) => setTimeout(r, 200));
      expect(prismaMock.violation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionStudentId: 'ss-sec',
          type: 'INTERNET_ACCESS',
        }),
      });
    });
  });

  describe('Teacher Auth Edge Cases', () => {
    it('should reject all teacher actions with empty token', async () => {
      const socket = Client(`http://localhost:${port}`, { auth: { token: '' } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errors: string[] = [];
      socket.on('dashboard:error', (d: { message: string }) => errors.push(d.message));

      socket.emit('dashboard:join_overview');
      socket.emit('teacher:create_session', { durationMinutes: 60 });
      socket.emit('teacher:end_session');
      socket.emit('dashboard:join_session', { sessionCode: '123456' });

      await new Promise((r) => setTimeout(r, 300));

      expect(errors.length).toBe(4);
      errors.forEach((msg) => expect(msg).toContain('Unauthorized'));

      socket.disconnect();
    });

    it('should reject teacher actions with malformed token', async () => {
      const socket = Client(`http://localhost:${port}`, { auth: { token: 'not-a-real-token' } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('dashboard:join_overview');
      const err = await errorPromise;
      expect(err.message).toContain('Unauthorized');

      socket.disconnect();
    });
  });

  describe('Create Session Validation', () => {
    it('should reject session creation without durationMinutes', async () => {
      const token = generateTeacherToken();
      const socket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', {});
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with durationMinutes = 0', async () => {
      const token = generateTeacherToken();
      const socket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 0 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with durationMinutes > 480', async () => {
      const token = generateTeacherToken();
      const socket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 481 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with floating point duration', async () => {
      const token = generateTeacherToken();
      const socket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 60.5 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with negative duration', async () => {
      const token = generateTeacherToken();
      const socket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => socket.on('connect', r));

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: -10 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });
  });

  describe('Event Isolation Between Sessions', () => {
    it('should not leak violation alerts to teachers in different sessions', async () => {
      const token = generateTeacherToken();

      // Teacher 1 joins session 123456
      const teacher1 = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacher1.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
        endedAt: null,
      });
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      teacher1.emit('dashboard:join_session', { sessionCode: '123456' });
      await new Promise((r) => setTimeout(r, 100));

      // Teacher 2 joins a different session 654321
      const teacher2 = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacher2.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's2',
        code: '654321',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
        endedAt: null,
      });

      teacher2.emit('dashboard:join_session', { sessionCode: '654321' });
      await new Promise((r) => setTimeout(r, 100));

      // Student registers in session 123456
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
      });
      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-iso', studentId: 'ISO01', name: 'Isolated' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-iso',
        student: { studentId: 'ISO01', name: 'Isolated' },
      });

      await new Promise<void>((resolve) => {
        studentSocket.emit('register', { studentId: 'ISO01', name: 'Isolated', sessionCode: '123456' });
        studentSocket.once('registered', () => resolve());
      });

      // Track alerts received by each teacher
      let teacher1AlertCount = 0;
      let teacher2AlertCount = 0;
      teacher1.on('dashboard:alert', () => { teacher1AlertCount++; });
      teacher2.on('dashboard:alert', () => { teacher2AlertCount++; });

      // Student reports violation in session 123456
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' });
      studentSocket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'test' });
      await new Promise((r) => setTimeout(r, 300));

      // Teacher 1 (in session 123456) should receive alert
      expect(teacher1AlertCount).toBe(1);
      // Teacher 2 (in different session) should NOT receive the alert
      expect(teacher2AlertCount).toBe(0);

      teacher1.disconnect();
      teacher2.disconnect();
      studentSocket.disconnect();
    });
  });

  describe('Sniffer Challenge Security', () => {
    it('should reject sniffer response with mismatched challengeId', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-sniff', studentId: 'SNIFF01', name: 'Sniffer' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-sniff',
        student: { studentId: 'SNIFF01', name: 'Sniffer' },
      });

      await new Promise<void>((resolve) => {
        socket.emit('register', { studentId: 'SNIFF01', name: 'Sniffer', sessionCode: '123456' });
        socket.once('registered', () => resolve());
      });

      // Set a pending challenge on the server socket
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-sniff');
      expect(targetSocket).toBeDefined();

      targetSocket!.data.pendingChallenge = {
        challengeId: 'real-challenge-id',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      prismaMock.violation.create.mockClear();

      // Respond with wrong challengeId
      socket.emit('sniffer:response', { challengeId: 'wrong-id', reachable: true });
      await new Promise((r) => setTimeout(r, 200));

      // Should NOT create a violation because challengeId doesn't match
      expect(prismaMock.violation.create).not.toHaveBeenCalled();

      // The pending challenge should still be present (not consumed)
      expect(targetSocket!.data.pendingChallenge).toBeDefined();

      socket.disconnect();
    });

    it('should reject sniffer response with invalid schema', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-sniff2', studentId: 'SNIFF02', name: 'Sniffer2' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-sniff2',
        student: { studentId: 'SNIFF02', name: 'Sniffer2' },
      });

      await new Promise<void>((resolve) => {
        socket.emit('register', { studentId: 'SNIFF02', name: 'Sniffer2', sessionCode: '123456' });
        socket.once('registered', () => resolve());
      });

      prismaMock.violation.create.mockClear();

      // Send malformed sniffer response
      socket.emit('sniffer:response', { challengeId: 123, reachable: 'yes' }); // wrong types
      await new Promise((r) => setTimeout(r, 200));

      expect(prismaMock.violation.create).not.toHaveBeenCalled();

      socket.disconnect();
    });
  });

  describe('Concurrent Violation Reports', () => {
    it('should handle rapid consecutive violations from same student', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-rapid', studentId: 'RAPID01', name: 'Rapid' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-rapid',
        student: { studentId: 'RAPID01', name: 'Rapid' },
      });

      await new Promise<void>((resolve) => {
        socket.emit('register', { studentId: 'RAPID01', name: 'Rapid', sessionCode: '123456' });
        socket.once('registered', () => resolve());
      });

      prismaMock.violation.create.mockClear();
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' });

      // Send 5 rapid violations
      for (let i = 0; i < 5; i++) {
        socket.emit('report_violation', { type: 'INTERNET_ACCESS', details: `Rapid violation ${i}` });
      }

      await new Promise((r) => setTimeout(r, 500));

      // All 5 should be processed (no deduplication at socket level)
      expect(prismaMock.violation.create).toHaveBeenCalledTimes(5);

      socket.disconnect();
    });
  });
});
