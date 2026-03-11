import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '@src/gateway/socket';
import { generateTeacherToken } from '@src/services/auth.service';
import { clearAllPendingDisconnects } from '@src/gateway/studentHandlers';

// 1. Mock Prisma (Simulation of DB)
const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  violation: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  session: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  checkTarget: {
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn(),
  },
}));

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Exam Simulation (E2E Flow)', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };
  let port: number;

  // Setup Server
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
  });

  it('should successfully complete the full Register -> Report -> Alert flow', () => {
    return new Promise<void>(async (resolve, reject) => {
      // Mock Data
      const sessionMock = { id: 'sess_1', code: '123456', isActive: true, createdAt: new Date(), durationMinutes: 60 };

      // Mock session retrieval (for all calls)
      prismaMock.session.findUnique.mockResolvedValue(sessionMock as never);
      prismaMock.session.findFirst.mockResolvedValue(sessionMock as never);
      prismaMock.session.findMany.mockResolvedValue([]);

      // Mock student upsert (normalized schema)
      prismaMock.student.upsert.mockResolvedValue({
        id: 'stu-uuid-1',
        studentId: 'sim_student_01',
        name: 'Sim User',
      } as never);

      // Mock sessionStudent upsert
      prismaMock.sessionStudent.upsert.mockResolvedValue({
        id: 'ss-uuid-1',
        studentId: 'stu-uuid-1',
        sessionId: 'sess_1',
        isOnline: true,
        student: { studentId: 'sim_student_01', name: 'Sim User' },
      } as never);

      // Mock session students for dashboard
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      // Mock violation create
      prismaMock.violation.create.mockResolvedValue({
        id: 'v_123',
        type: 'INTERNET_ACCESS',
        sessionStudentId: 'ss-uuid-1',
        timestamp: new Date(),
      } as never);

      // 1. Connect Clients
      const token = generateTeacherToken();
      const teacherSocket = Client(`http://localhost:${port}`, {
        auth: { token },
      });
      const studentSocket = Client(`http://localhost:${port}`);

      const teardown = () => {
        teacherSocket.disconnect();
        studentSocket.disconnect();
      };

      // Handle Timeout
      const timeout = setTimeout(() => {
        teardown();
        reject(new Error('Simulation timed out: Alert not received'));
      }, 5000);

      // 2. Teacher Logic
      teacherSocket.on('connect', () => {
        teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });
      });

      teacherSocket.on('dashboard:alert', (data) => {
        try {
          expect(data).toBeDefined();
          expect(data.violation.type).toBe('INTERNET_ACCESS');
          expect(data.studentId).toBe('sim_student_01');

          clearTimeout(timeout);
          teardown();
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          teardown();
          reject(e);
        }
      });

      // 3. Student Logic
      studentSocket.on('connect', () => {
        // Wait briefly for teacher to likely be joined
        setTimeout(() => {
          studentSocket.emit('register', {
            studentId: 'sim_student_01',
            name: 'Sim User',
            sessionCode: '123456'
          });
        }, 50);
      });

      studentSocket.on('registered', () => {
        studentSocket.emit('report_violation', {
          type: 'INTERNET_ACCESS',
          details: 'Simulation violation'
        });
      });
    });
  });
});
