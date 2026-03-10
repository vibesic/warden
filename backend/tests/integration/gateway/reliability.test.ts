import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { generateTeacherToken } from '@src/services/auth.service';
import { clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';

/**
 * Reliability tests: stale session cleanup, timer expiry auto-end,
 * disconnect on session end, heartbeat timeout detection, isActive guards.
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

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Reliability Tests', () => {
  let serverCtx: TestServerContext;
  let port: number;

  beforeAll(async () => {
    serverCtx = await createTestSocketServer();
    port = serverCtx.port;
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    cleanupTestServer(serverCtx);
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default session mock
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

  describe('Session End — Student Notification', () => {
    it('should send session:ended to students when teacher ends session', async () => {
      const token = generateTeacherToken();
      const teacherSocket = Client(`http://localhost:${port}`, { auth: { token } });
      const studentSocket = Client(`http://localhost:${port}`);

      await Promise.all([
        new Promise<void>((r) => teacherSocket.on('connect', r)),
        new Promise<void>((r) => studentSocket.on('connect', r)),
      ]);

      // Mock student registration
      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-1', studentId: 'S001', name: 'Alice' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-1',
        student: { studentId: 'S001', name: 'Alice' },
      });

      // Register student
      await new Promise<void>((resolve) => {
        studentSocket.emit('register', { studentId: 'S001', name: 'Alice', sessionCode: '123456' });
        studentSocket.once('registered', () => resolve());
      });

      // Teacher joins session dashboard
      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });
      await new Promise((r) => setTimeout(r, 100));

      // Mock session end
      const endedSession = {
        id: 's1',
        code: '123456',
        isActive: false,
        createdAt: new Date(),
        endedAt: new Date(),
        durationMinutes: 60,
      };
      prismaMock.session.findFirst.mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date(), durationMinutes: 60 });
      prismaMock.session.update.mockResolvedValue(endedSession);

      // Listen for session:ended on student
      const sessionEndedPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('student never received session:ended')), 3000);
        studentSocket.on('session:ended', (data) => {
          clearTimeout(timeout);
          expect(data.message).toContain('ended by the teacher');
          resolve();
        });
      });

      // Teacher ends session
      teacherSocket.emit('teacher:end_session');
      await sessionEndedPromise;

      teacherSocket.disconnect();
      studentSocket.disconnect();
    });
  });

  describe('Heartbeat — isActive Guard', () => {
    it('should ignore heartbeat if session is no longer active', async () => {
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-2', studentId: 'S002', name: 'Bob' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-2',
        student: { studentId: 'S002', name: 'Bob' },
      });

      // Register student
      await new Promise<void>((resolve) => {
        studentSocket.emit('register', { studentId: 'S002', name: 'Bob', sessionCode: '123456' });
        studentSocket.once('registered', () => resolve());
      });

      // Session becomes inactive after registration
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: false,
        createdAt: new Date(),
        endedAt: new Date(),
        durationMinutes: 60,
      });

      // Clear mocks to track only the heartbeat call
      prismaMock.sessionStudent.update.mockClear();

      // Send heartbeat
      studentSocket.emit('heartbeat');
      await new Promise((r) => setTimeout(r, 200));

      // Update should NOT be called because session is inactive
      expect(prismaMock.sessionStudent.update).not.toHaveBeenCalled();

      studentSocket.disconnect();
    });
  });

  describe('Violation — isActive Guard', () => {
    it('should ignore report_violation if session is no longer active', async () => {
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-3', studentId: 'S003', name: 'Charlie' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-3',
        student: { studentId: 'S003', name: 'Charlie' },
      });

      // Register
      await new Promise<void>((resolve) => {
        studentSocket.emit('register', { studentId: 'S003', name: 'Charlie', sessionCode: '123456' });
        studentSocket.once('registered', () => resolve());
      });

      // Session becomes inactive
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: false,
        createdAt: new Date(),
        endedAt: new Date(),
        durationMinutes: 60,
      });
      prismaMock.violation.create.mockClear();

      studentSocket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'test' });
      await new Promise((r) => setTimeout(r, 200));

      // Violation.create should NOT be called
      expect(prismaMock.violation.create).not.toHaveBeenCalled();

      studentSocket.disconnect();
    });
  });

  describe('Disconnect — isActive Guard', () => {
    it('should not create violation on disconnect if session has ended', async () => {
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-4', studentId: 'S004', name: 'Diana' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-4',
        student: { studentId: 'S004', name: 'Diana' },
      });

      await new Promise<void>((resolve) => {
        studentSocket.emit('register', { studentId: 'S004', name: 'Diana', sessionCode: '123456' });
        studentSocket.once('registered', () => resolve());
      });

      // Set session as inactive before disconnect
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: false,
        createdAt: new Date(),
        endedAt: new Date(),
        durationMinutes: 60,
      });
      prismaMock.violation.create.mockClear();
      prismaMock.sessionStudent.update.mockClear();

      studentSocket.disconnect();
      await new Promise((r) => setTimeout(r, 300));

      // Should still mark offline
      const offlineCalls = prismaMock.sessionStudent.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { isOnline: boolean } }).data.isOnline === false,
      );
      expect(offlineCalls.length).toBeGreaterThanOrEqual(1);

      // But should NOT create a DISCONNECTION violation
      expect(prismaMock.violation.create).not.toHaveBeenCalled();
    });
  });

  describe('Registration — Session Validation', () => {
    it('should reject registration for ended session', async () => {
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: false,
        createdAt: new Date(),
        endedAt: new Date(),
        durationMinutes: 60,
      });

      const errorPromise = new Promise<string>((resolve) => {
        studentSocket.on('registration_error', (msg: string) => resolve(msg));
      });

      studentSocket.emit('register', { studentId: 'S005', name: 'Eve', sessionCode: '123456' });
      const errorMsg = await errorPromise;

      expect(errorMsg).toBe('Session has ended');
      // Student should NOT be upserted
      expect(prismaMock.student.upsert).not.toHaveBeenCalled();

      studentSocket.disconnect();
    });

    it('should reject registration with non-existent session code', async () => {
      const studentSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => studentSocket.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue(null);

      const errorPromise = new Promise<string>((resolve) => {
        studentSocket.on('registration_error', (msg: string) => resolve(msg));
      });

      studentSocket.emit('register', { studentId: 'S006', name: 'Frank', sessionCode: '999999' });
      const errorMsg = await errorPromise;

      expect(errorMsg).toBe('Invalid session code');
      expect(prismaMock.student.upsert).not.toHaveBeenCalled();

      studentSocket.disconnect();
    });
  });

  describe('Student Reconnection', () => {
    it('should allow same student to reconnect and update session student', async () => {
      const socket1 = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket1.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-7', studentId: 'S007', name: 'Grace' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-7',
        student: { studentId: 'S007', name: 'Grace' },
      });

      // First registration
      await new Promise<void>((resolve) => {
        socket1.emit('register', { studentId: 'S007', name: 'Grace', sessionCode: '123456' });
        socket1.once('registered', () => resolve());
      });

      expect(prismaMock.student.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.sessionStudent.upsert).toHaveBeenCalledTimes(1);

      // Disconnect first socket
      socket1.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      // Reset active session for new connection
      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
      });

      // Reconnect with same studentId
      const socket2 = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket2.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-7', studentId: 'S007', name: 'Grace' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-7',
        student: { studentId: 'S007', name: 'Grace' },
      });

      await new Promise<void>((resolve) => {
        socket2.emit('register', { studentId: 'S007', name: 'Grace', sessionCode: '123456' });
        socket2.once('registered', () => resolve());
      });

      // Upsert should be called again (not fail)
      expect(prismaMock.student.upsert).toHaveBeenCalledTimes(2);
      expect(prismaMock.sessionStudent.upsert).toHaveBeenCalledTimes(2);

      socket2.disconnect();
    });
  });

  describe('Unregistered Socket Events', () => {
    it('should ignore heartbeat from unregistered socket', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      // Wait for any lingering disconnect handlers from previous tests
      await new Promise((r) => setTimeout(r, 100));
      prismaMock.sessionStudent.update.mockClear();

      // Send heartbeat without registering first
      socket.emit('heartbeat');
      await new Promise((r) => setTimeout(r, 200));

      expect(prismaMock.sessionStudent.update).not.toHaveBeenCalled();

      socket.disconnect();
    });

    it('should ignore report_violation from unregistered socket', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      socket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'test' });
      await new Promise((r) => setTimeout(r, 200));

      expect(prismaMock.violation.create).not.toHaveBeenCalled();

      socket.disconnect();
    });

    it('should ignore sniffer:response from unregistered socket', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      socket.emit('sniffer:response', { challengeId: 'test', reachable: true });
      await new Promise((r) => setTimeout(r, 200));

      expect(prismaMock.violation.create).not.toHaveBeenCalled();

      socket.disconnect();
    });
  });

  describe('Teacher Session State with Clock Data', () => {
    it('should include serverTime in session_state for clock skew compensation', async () => {
      const token = generateTeacherToken();
      const teacherSocket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacherSocket.on('connect', r));

      const sessionWithStudents = {
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        endedAt: null,
        durationMinutes: 60,
      };
      prismaMock.session.findUnique.mockResolvedValue(sessionWithStudents);
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      const statePromise = new Promise<{ serverTime: number }>((resolve) => {
        teacherSocket.on('dashboard:session_state', (data: { serverTime: number }) => resolve(data));
      });

      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });

      const state = await statePromise;
      expect(state.serverTime).toBeDefined();
      expect(typeof state.serverTime).toBe('number');
      // serverTime should be close to now (within 5s)
      expect(Math.abs(state.serverTime - Date.now())).toBeLessThan(5000);

      teacherSocket.disconnect();
    });
  });
});
