import type { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';
import { connectClient, connectTeacher, registerStudent } from '../../helpers/socketClient';
import { mockStudentRegistration, applyDefaultMocks, type PrismaMock } from '../../helpers/prisma';

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
    findFirst: vi.fn(),
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
  $transaction: vi.fn(async (cb) => cb(prismaMock)),
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Security Tests', () => {
  let serverCtx: TestServerContext;
  let io: InstanceType<typeof import('socket.io').Server>;
  let port: number;

  beforeAll(async () => {
    serverCtx = await createTestSocketServer();
    io = serverCtx.io;
    port = serverCtx.port;
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    cleanupTestServer(serverCtx);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    applyDefaultMocks(prismaMock, { durationMinutes: 60 });
  });

  describe('Registration Input Validation', () => {
    it('should reject empty studentId', async () => {
      const socket = await connectClient(port);

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
      const socket = await connectClient(port);

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', { studentId: 'S001', name: '', sessionCode: '123456' });
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject session code that is not 6 characters', async () => {
      const socket = await connectClient(port);

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', { studentId: 'S001', name: 'Test', sessionCode: '12345' }); // 5 chars
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject non-object register data', async () => {
      const socket = await connectClient(port);

      const errorPromise = new Promise<string>((resolve) => {
        socket.on('registration_error', (msg: string) => resolve(msg));
      });

      socket.emit('register', 'not-an-object');
      const msg = await errorPromise;
      expect(msg).toBe('Invalid data format');

      socket.disconnect();
    });

    it('should reject null register data', async () => {
      const socket = await connectClient(port);

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
      registeredSocket = await connectClient(port);
      mockStudentRegistration(prismaMock, 'SEC01', 'Security', 'stu-sec', 'ss-sec');
      await registerStudent(registeredSocket, { studentId: 'SEC01', name: 'Security', sessionCode: '123456' });
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
    it('should silently ignore all teacher actions with empty token (#16 connection-level auth)', async () => {
      const socket = await connectClient(port, { auth: { token: '' } });

      const errors: string[] = [];
      socket.on('dashboard:error', (d: { message: string }) => errors.push(d.message));

      socket.emit('dashboard:join_overview');
      socket.emit('teacher:create_session', { durationMinutes: 60 });
      socket.emit('teacher:end_session');
      socket.emit('dashboard:join_session', { sessionCode: '123456' });

      await new Promise((r) => setTimeout(r, 300));

      // Teacher handlers are not registered for invalid tokens — events are silently ignored
      expect(errors.length).toBe(0);

      socket.disconnect();
    });

    it('should silently ignore teacher actions with malformed token (#16)', async () => {
      const socket = await connectClient(port, { auth: { token: 'not-a-real-token' } });

      const errorSpy = vi.fn();
      const overviewSpy = vi.fn();
      socket.on('dashboard:error', errorSpy);
      socket.on('dashboard:overview', overviewSpy);

      socket.emit('dashboard:join_overview');

      await new Promise((r) => setTimeout(r, 300));

      expect(errorSpy).not.toHaveBeenCalled();
      expect(overviewSpy).not.toHaveBeenCalled();

      socket.disconnect();
    });
  });

  describe('Create Session Validation', () => {
    it('should reject session creation without durationMinutes', async () => {
      const socket = await connectTeacher(port);

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', {});
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with durationMinutes = 0', async () => {
      const socket = await connectTeacher(port);

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 0 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with durationMinutes > 480', async () => {
      const socket = await connectTeacher(port);

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 481 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with floating point duration', async () => {
      const socket = await connectTeacher(port);

      const errorPromise = new Promise<{ message: string }>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => resolve(data));
      });

      socket.emit('teacher:create_session', { durationMinutes: 60.5 });
      const err = await errorPromise;
      expect(err.message).toContain('Duration is required');

      socket.disconnect();
    });

    it('should reject session creation with negative duration', async () => {
      const socket = await connectTeacher(port);

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
      // Teacher 1 joins session 123456
      const teacher1 = await connectTeacher(port);

      teacher1.emit('dashboard:join_session', { sessionCode: '123456' });
      await new Promise((r) => setTimeout(r, 100));

      // Teacher 2 joins a different session 654321
      const teacher2 = await connectTeacher(port);

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
      const studentSocket = await connectClient(port);

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
      });
      mockStudentRegistration(prismaMock, 'ISO01', 'Isolated', 'stu-iso', 'ss-iso');
      await registerStudent(studentSocket, { studentId: 'ISO01', name: 'Isolated', sessionCode: '123456' });

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
      const socket = await connectClient(port);
      mockStudentRegistration(prismaMock, 'SNIFF01', 'Sniffer', 'stu-sniff', 'ss-sniff');
      await registerStudent(socket, { studentId: 'SNIFF01', name: 'Sniffer', sessionCode: '123456' });

      // Set a pending challenge on the server socket
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find((s: any) => s.data.sessionStudentId === 'ss-sniff') as any;
      expect(targetSocket).toBeDefined();

      targetSocket.data.pendingChallenge = {
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
      expect(targetSocket.data.pendingChallenge).toBeDefined();

      socket.disconnect();
    });

    it('should reject sniffer response with invalid schema', async () => {
      const socket = await connectClient(port);
      mockStudentRegistration(prismaMock, 'SNIFF02', 'Sniffer2', 'stu-sniff2', 'ss-sniff2');
      await registerStudent(socket, { studentId: 'SNIFF02', name: 'Sniffer2', sessionCode: '123456' });

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
      const socket = await connectClient(port);
      mockStudentRegistration(prismaMock, 'RAPID01', 'Rapid', 'stu-rapid', 'ss-rapid');
      await registerStudent(socket, { studentId: 'RAPID01', name: 'Rapid', sessionCode: '123456' });

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
