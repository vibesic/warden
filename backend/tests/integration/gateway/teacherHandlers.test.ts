import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';
import { applyDefaultMocks, mockStudentRegistration, type PrismaMock } from '../../helpers/prisma';
import { connectClient, connectTeacher, registerStudent } from '../../helpers/socketClient';

const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
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
  $transaction: vi.fn(async (cb) => cb(prismaMock)),
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Teacher Handlers - Extended', () => {
  let serverCtx: TestServerContext;
  let port: number;

  beforeAll(async () => {
    serverCtx = await createTestSocketServer();
    port = serverCtx.port;
  });

  afterAll(() => {
    cleanupTestServer(serverCtx);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    applyDefaultMocks(prismaMock);
  });

  describe('dashboard:join_session', () => {
    it('should silently ignore without auth token (#16 connection-level auth)', async () => {
      const socket = await connectClient(port);

      const errorSpy = vi.fn();
      socket.on('dashboard:error', errorSpy);

      socket.emit('dashboard:join_session', { sessionCode: '123456' });

      await new Promise(r => setTimeout(r, 200));

      // Teacher handlers not registered for unauthenticated sockets
      expect(errorSpy).not.toHaveBeenCalled();

      socket.close();
    });

    it('should return error for non-existent session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);

      const socket = await connectTeacher(port);

      await new Promise<void>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => {
          expect(data.message).toBe('Session not found');
          resolve();
        });
        socket.emit('dashboard:join_session', { sessionCode: '999999' });
      });

      socket.close();
    });

    it('should return session state with students', async () => {
      const sessionData = {
        id: 's1', code: '123456', isActive: true,
        createdAt: new Date(), durationMinutes: null, endedAt: null,
      };
      const mockSessionStudents = [
        {
          id: 'ss-1',
          studentId: 'stu-uuid-1',
          sessionId: 's1',
          isOnline: true,
          createdAt: new Date(),
          lastHeartbeat: new Date(),
          student: { studentId: 'stu1', name: 'Alice' },
          violations: [
            { type: 'INTERNET_ACCESS', details: 'Google', timestamp: new Date() },
          ],
        },
      ];

      // getSessionByCode uses findUnique, getSessionStudentsForSession uses sessionStudent.findMany
      prismaMock.session.findUnique.mockResolvedValue(sessionData);
      prismaMock.sessionStudent.findMany.mockResolvedValue(mockSessionStudents as never[]);

      const socket = await connectTeacher(port);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for session_state')), 4000);

        socket.on('dashboard:session_state', (data: { session: { code: string }; students: Array<{ studentId: string; violations: unknown[] }> }) => {
          clearTimeout(timeout);
          expect(data.session).toBeDefined();
          expect(data.students).toHaveLength(1);
          expect(data.students[0].studentId).toBe('stu1');
          expect(data.students[0].violations).toHaveLength(1);
          resolve();
        });

        socket.on('dashboard:error', (data: { message: string }) => {
          clearTimeout(timeout);
          reject(new Error(`Received dashboard:error: ${data.message}`));
        });

        // Small delay to ensure listener registration before emit
        setTimeout(() => {
          socket.emit('dashboard:join_session', { sessionCode: '123456' });
        }, 50);
      });

      socket.close();
    });

    it('should handle missing sessionCode gracefully', async () => {
      const socket = await connectTeacher(port);

      // Emit with no data — shouldn't crash
      socket.emit('dashboard:join_session', {});

      // Give it time to process
      await new Promise((r) => setTimeout(r, 100));

      socket.close();
    });
  });

  describe('teacher:create_session with duration', () => {
    it('should create session with custom duration', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.session.create.mockResolvedValue({
        id: 's-new', code: '654321', isActive: true,
        durationMinutes: 90, createdAt: new Date(),
      });

      const socket = await connectTeacher(port);

      await new Promise<void>((resolve) => {
        socket.on('dashboard:session_created', (data: { code: string; durationMinutes: number }) => {
          expect(data.code).toBe('654321');
          expect(data.durationMinutes).toBe(90);
          resolve();
        });
        socket.emit('teacher:create_session', { durationMinutes: 90 });
      });

      socket.close();
    });

    it('should emit error when duration not provided', async () => {
      const socket = await connectTeacher(port);

      await new Promise<void>((resolve) => {
        socket.on('dashboard:error', (data: { message: string }) => {
          expect(data.message).toBe('Duration is required (1-480 minutes)');
          resolve();
        });
        socket.emit('teacher:create_session');
      });

      socket.close();
    });
  });

  describe('teacher:end_session - edge cases', () => {
    it('should do nothing when no active session exists', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      const socket = await connectTeacher(port);

      socket.emit('teacher:end_session');
      await new Promise((r) => setTimeout(r, 200));

      // endSession should not have been called when getActiveSession returns null
      expect(prismaMock.session.update).not.toHaveBeenCalled();

      socket.close();
    });

    it('should notify students when session ends', async () => {
      prismaMock.session.update.mockResolvedValue({
        id: 's1', code: '123456', isActive: false,
        createdAt: new Date(), endedAt: new Date(),
      });

      const teacherSocket = await connectTeacher(port);
      const studentSocket = await connectClient(port);

      // Register student first
      mockStudentRegistration(prismaMock, 'stu1', 'Test');
      await registerStudent(studentSocket, { studentId: 'stu1', name: 'Test', sessionCode: '123456' });

      await new Promise<void>((resolve) => {
        studentSocket.on('session:ended', (data: { message: string }) => {
          expect(data.message).toContain('ended by the teacher');
          resolve();
        });
        teacherSocket.emit('teacher:end_session');
      });

      teacherSocket.close();
      studentSocket.close();
    });
  });

  describe('dashboard:join_overview - extended', () => {
    it('should return session history with student counts', async () => {
      const historyMock = [
        {
          id: 'h1',
          code: '111111',
          isActive: false,
          createdAt: new Date(),
          endedAt: new Date(),
          durationMinutes: 60,
          _count: { sessionStudents: 10 },
        },
        {
          id: 'h2',
          code: '222222',
          isActive: false,
          createdAt: new Date(),
          endedAt: null,
          durationMinutes: null,
          _count: { sessionStudents: 0 },
        },
      ];
      prismaMock.session.findMany.mockResolvedValue(historyMock);

      const socket = await connectTeacher(port);

      await new Promise<void>((resolve) => {
        socket.on('dashboard:overview', (data: { history: Array<{ code: string; studentCount: number }>; activeSession: unknown }) => {
          expect(data.history).toHaveLength(2);
          expect(data.history[0].studentCount).toBe(10);
          expect(data.history[1].studentCount).toBe(0);
          resolve();
        });
        socket.emit('dashboard:join_overview');
      });

      socket.close();
    });

    it('should include active session in overview', async () => {
      const activeSession = {
        id: 'active-1',
        code: '333333',
        isActive: true,
        createdAt: new Date(),
        durationMinutes: 120,
      };
      prismaMock.session.findMany.mockResolvedValue([]);
      prismaMock.session.findFirst.mockResolvedValue(activeSession);

      const socket = await connectTeacher(port);

      await new Promise<void>((resolve) => {
        socket.on('dashboard:overview', (data: { activeSession: { code: string } }) => {
          expect(data.activeSession).toBeDefined();
          expect(data.activeSession.code).toBe('333333');
          resolve();
        });
        socket.emit('dashboard:join_overview');
      });

      socket.close();
    });
  });
});
