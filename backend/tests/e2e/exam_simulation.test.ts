import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../helpers/setup';
import { mockStudentRegistration, applyDefaultMocks, type PrismaMock } from '../helpers/prisma';
import { connectClient, connectTeacher } from '../helpers/socketClient';

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
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Exam Simulation (E2E Flow)', () => {
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
  });

  it('should successfully complete the full Register -> Report -> Alert flow', () => {
    return new Promise<void>(async (resolve, reject) => {
      const sessionMock = { id: 'sess_1', code: '123456', isActive: true, createdAt: new Date(), durationMinutes: 60 };

      prismaMock.session.findUnique.mockResolvedValue(sessionMock as never);
      prismaMock.session.findFirst.mockResolvedValue(sessionMock as never);
      prismaMock.session.findMany.mockResolvedValue([]);
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);
      mockStudentRegistration(prismaMock, 'sim_student_01', 'Sim User', 'stu-uuid-1', 'ss-uuid-1');
      prismaMock.violation.create.mockResolvedValue({
        id: 'v_123',
        type: 'INTERNET_ACCESS',
        sessionStudentId: 'ss-uuid-1',
        timestamp: new Date(),
      } as never);

      // 1. Connect Clients
      const teacherSocket = await connectTeacher(port);
      const studentSocket = await connectClient(port);

      const teardown = () => {
        teacherSocket.disconnect();
        studentSocket.disconnect();
      };

      // Handle Timeout
      const timeout = setTimeout(() => {
        teardown();
        reject(new Error('Simulation timed out: Alert not received'));
      }, 5000);

      // 2. Teacher joins session
      teacherSocket.emit('dashboard:join_session', { sessionCode: '123456' });

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

      // 3. Student registers and reports violation
      setTimeout(() => {
        studentSocket.emit('register', {
          studentId: 'sim_student_01',
          name: 'Sim User',
          sessionCode: '123456'
        });
      }, 50);

      studentSocket.on('registered', () => {
        studentSocket.emit('report_violation', {
          type: 'INTERNET_ACCESS',
          details: 'Simulation violation'
        });
      });
    });
  });
});
