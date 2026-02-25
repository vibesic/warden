import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';
import { generateTeacherToken } from '../services/auth.service';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '../gateway/studentHandlers';

/**
 * Scalability tests: multiple concurrent students, rapid heartbeats,
 * burst violations, teacher receiving updates from many students.
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

describe('Scalability Tests', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };
  let port: number;

  beforeAll(async () => {
    setDisconnectGraceMs(100);
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

  describe('Multiple Concurrent Students', () => {
    it('should register 10 students concurrently without errors', async () => {
      const STUDENT_COUNT = 10;
      const sockets: ClientSocket[] = [];

      // Create and connect all sockets
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const socket = Client(`http://localhost:${port}`);
        sockets.push(socket);
      }

      await Promise.all(sockets.map((s) => new Promise<void>((r) => s.on('connect', r))));

      // Setup mocks for each student
      for (let i = 0; i < STUDENT_COUNT; i++) {
        prismaMock.student.upsert.mockResolvedValueOnce({
          id: `stu-${i}`,
          studentId: `STU${i.toString().padStart(3, '0')}`,
          name: `Student ${i}`,
        });
        prismaMock.sessionStudent.upsert.mockResolvedValueOnce({
          id: `ss-${i}`,
          student: { studentId: `STU${i.toString().padStart(3, '0')}`, name: `Student ${i}` },
        });
      }

      // Register all students concurrently
      const registrationPromises = sockets.map((socket, i) =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Student ${i} registration timed out`)), 5000);
          socket.on('registered', () => {
            clearTimeout(timeout);
            resolve();
          });
          socket.on('registration_error', (msg: string) => {
            clearTimeout(timeout);
            reject(new Error(`Student ${i} registration error: ${msg}`));
          });
          socket.emit('register', {
            studentId: `STU${i.toString().padStart(3, '0')}`,
            name: `Student ${i}`,
            sessionCode: '123456',
          });
        }),
      );

      await Promise.all(registrationPromises);

      // All should have registered
      expect(prismaMock.student.upsert).toHaveBeenCalledTimes(STUDENT_COUNT);
      expect(prismaMock.sessionStudent.upsert).toHaveBeenCalledTimes(STUDENT_COUNT);

      // Cleanup
      sockets.forEach((s) => s.disconnect());
    });

    it('should deliver teacher alerts from multiple students concurrently', async () => {
      const STUDENT_COUNT = 5;
      const token = generateTeacherToken();

      // Connect teacher
      const teacherSocket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacherSocket.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
        endedAt: null,
      });
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });
      await new Promise((r) => setTimeout(r, 100));

      // Connect and register students
      const sockets: ClientSocket[] = [];
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const socket = Client(`http://localhost:${port}`);
        sockets.push(socket);
        await new Promise<void>((r) => socket.on('connect', r));

        prismaMock.student.upsert.mockResolvedValueOnce({
          id: `stu-multi-${i}`,
          studentId: `MULTI${i}`,
          name: `Multi ${i}`,
        });
        prismaMock.sessionStudent.upsert.mockResolvedValueOnce({
          id: `ss-multi-${i}`,
          student: { studentId: `MULTI${i}`, name: `Multi ${i}` },
        });

        await new Promise<void>((resolve) => {
          socket.emit('register', {
            studentId: `MULTI${i}`,
            name: `Multi ${i}`,
            sessionCode: '123456',
          });
          socket.once('registered', () => resolve());
        });
      }

      // Track teacher alerts
      let alertCount = 0;
      const alertStudentIds: string[] = [];
      teacherSocket.on('dashboard:alert', (data: { studentId: string }) => {
        alertCount++;
        alertStudentIds.push(data.studentId);
      });

      // All students report violations concurrently
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' });

      sockets.forEach((socket) => {
        socket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'concurrent test' });
      });

      await new Promise((r) => setTimeout(r, 500));

      // Teacher should receive alerts from all students
      expect(alertCount).toBe(STUDENT_COUNT);
      for (let i = 0; i < STUDENT_COUNT; i++) {
        expect(alertStudentIds).toContain(`MULTI${i}`);
      }

      // Cleanup
      teacherSocket.disconnect();
      sockets.forEach((s) => s.disconnect());
    });
  });

  describe('Rapid Heartbeats', () => {
    it('should handle 20 rapid heartbeats from a single student', async () => {
      const socket = Client(`http://localhost:${port}`);
      await new Promise<void>((r) => socket.on('connect', r));

      prismaMock.student.upsert.mockResolvedValue({ id: 'stu-hb', studentId: 'HB01', name: 'Heartbeat' });
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-hb',
        student: { studentId: 'HB01', name: 'Heartbeat' },
      });
      prismaMock.sessionStudent.update.mockResolvedValue({});

      await new Promise<void>((resolve) => {
        socket.emit('register', { studentId: 'HB01', name: 'Heartbeat', sessionCode: '123456' });
        socket.once('registered', () => resolve());
      });

      prismaMock.sessionStudent.update.mockClear();

      // Send 20 rapid heartbeats
      for (let i = 0; i < 20; i++) {
        socket.emit('heartbeat');
      }

      await new Promise((r) => setTimeout(r, 500));

      // All heartbeats should be processed
      const heartbeatCalls = prismaMock.sessionStudent.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { isOnline: boolean } }).data.isOnline === true,
      );
      expect(heartbeatCalls.length).toBe(20);

      socket.disconnect();
    });
  });

  describe('Teacher Dashboard Under Load', () => {
    it('should receive STUDENT_JOINED updates from multiple simultaneous connections', async () => {
      const STUDENT_COUNT = 5;
      const token = generateTeacherToken();

      const teacherSocket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacherSocket.on('connect', r));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's1',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 60,
        endedAt: null,
      });
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });
      await new Promise((r) => setTimeout(r, 100));

      // Track STUDENT_JOINED updates
      const joinedStudents: string[] = [];
      teacherSocket.on('dashboard:update', (data: { type: string; studentId: string }) => {
        if (data.type === 'STUDENT_JOINED') {
          joinedStudents.push(data.studentId);
        }
      });

      // Register students one by one (each triggers a STUDENT_JOINED event)
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const socket = Client(`http://localhost:${port}`);
        await new Promise<void>((r) => socket.on('connect', r));

        prismaMock.student.upsert.mockResolvedValueOnce({
          id: `stu-load-${i}`,
          studentId: `LOAD${i}`,
          name: `Load ${i}`,
        });
        prismaMock.sessionStudent.upsert.mockResolvedValueOnce({
          id: `ss-load-${i}`,
          student: { studentId: `LOAD${i}`, name: `Load ${i}` },
        });

        await new Promise<void>((resolve) => {
          socket.emit('register', {
            studentId: `LOAD${i}`,
            name: `Load ${i}`,
            sessionCode: '123456',
          });
          socket.once('registered', () => resolve());
        });

        socket.disconnect();
      }

      await new Promise((r) => setTimeout(r, 300));

      // Teacher should have received all STUDENT_JOINED updates
      expect(joinedStudents.length).toBe(STUDENT_COUNT);
      for (let i = 0; i < STUDENT_COUNT; i++) {
        expect(joinedStudents).toContain(`LOAD${i}`);
      }

      teacherSocket.disconnect();
    });

    it('should handle session_state with many students', async () => {
      const token = generateTeacherToken();
      const teacherSocket = Client(`http://localhost:${port}`, { auth: { token } });
      await new Promise<void>((r) => teacherSocket.on('connect', r));

      // Mock a session with 20 students
      const manyStudents = Array.from({ length: 20 }, (_, i) => ({
        id: `ss-big-${i}`,
        student: { studentId: `BIG${i.toString().padStart(3, '0')}`, name: `BigStudent ${i}` },
        isOnline: i < 15, // 15 online, 5 offline
        createdAt: new Date(),
        lastHeartbeat: new Date(),
        violations: i % 3 === 0 ? [
          { type: 'INTERNET_ACCESS', details: 'test', timestamp: new Date() },
        ] : [],
      }));

      prismaMock.session.findUnique.mockResolvedValue({
        id: 's-big',
        code: '123456',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 120,
        endedAt: null,
      });
      prismaMock.sessionStudent.findMany.mockResolvedValue(manyStudents);

      const statePromise = new Promise<{
        students: Array<{ studentId: string; isOnline: boolean; violations: unknown[] }>;
      }>((resolve) => {
        teacherSocket.on('dashboard:session_state', (data) => resolve(data));
      });

      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });

      const state = await statePromise;

      expect(state.students).toHaveLength(20);
      const onlineCount = state.students.filter((s) => s.isOnline).length;
      const offlineCount = state.students.filter((s) => !s.isOnline).length;
      expect(onlineCount).toBe(15);
      expect(offlineCount).toBe(5);

      // Students with index divisible by 3 should have violations
      const withViolations = state.students.filter((s) => s.violations.length > 0);
      expect(withViolations.length).toBe(7); // 0,3,6,9,12,15,18

      teacherSocket.disconnect();
    });
  });

  describe('Burst Disconnections', () => {
    it('should handle multiple students disconnecting simultaneously', async () => {
      const STUDENT_COUNT = 5;
      const sockets: ClientSocket[] = [];

      // Register students
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const socket = Client(`http://localhost:${port}`);
        sockets.push(socket);
        await new Promise<void>((r) => socket.on('connect', r));

        prismaMock.student.upsert.mockResolvedValueOnce({
          id: `stu-burst-${i}`,
          studentId: `BURST${i}`,
          name: `Burst ${i}`,
        });
        prismaMock.sessionStudent.upsert.mockResolvedValueOnce({
          id: `ss-burst-${i}`,
          student: { studentId: `BURST${i}`, name: `Burst ${i}` },
        });

        await new Promise<void>((resolve) => {
          socket.emit('register', {
            studentId: `BURST${i}`,
            name: `Burst ${i}`,
            sessionCode: '123456',
          });
          socket.once('registered', () => resolve());
        });
      }

      prismaMock.sessionStudent.update.mockClear();
      prismaMock.violation.create.mockClear();
      prismaMock.sessionStudent.update.mockResolvedValue({});
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'DISCONNECTION' });

      // Disconnect all at once
      sockets.forEach((s) => s.disconnect());

      await new Promise((r) => setTimeout(r, 500));

      // All should be marked offline
      const offlineCalls = prismaMock.sessionStudent.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { isOnline: boolean } }).data.isOnline === false,
      );
      expect(offlineCalls.length).toBe(STUDENT_COUNT);

      // All should have DISCONNECTION violations
      const violationCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
      );
      expect(violationCalls.length).toBe(STUDENT_COUNT);
    });
  });
});
