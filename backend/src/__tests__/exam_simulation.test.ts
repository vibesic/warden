import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';
import { generateTeacherToken } from '../services/auth.service';

// 1. Mock Prisma (Simulation of DB)
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
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  }
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

describe('Exam Simulation (E2E Flow)', () => {
  let io: Server;
  let serverSocket: any;
  let httpServer: any;
  let cleanupSocket: () => void;
  const port = 3002; // Different port from other tests

  // Setup Server
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
    vi.clearAllMocks();
  });

  it('should successfully complete the full Register -> Report -> Alert flow', () => {
    return new Promise<void>(async (resolve, reject) => {
      // Mock Data
      const sessionMock = { id: 'sess_1', code: '123456', isActive: true, createdAt: new Date() };

      // Mock session retrieval (for all calls)
      prismaMock.session.findUnique.mockResolvedValue(sessionMock as any);
      prismaMock.session.findFirst.mockResolvedValue(sessionMock as any);

      // Mock student retrieval for dashboard join
      prismaMock.student.findMany.mockResolvedValue([]);

      // Mock student upsert (register)
      prismaMock.student.upsert.mockResolvedValue({
        id: 'uuid-sim-1',
        studentId: 'sim_student_01',
        name: 'Sim User',
        sessionId: 'sess_1'
      } as any);

      // Mock violation create
      prismaMock.violation.create.mockResolvedValue({
        id: 'v_123',
        type: 'INTERNET_ACCESS',
        studentId: 'uuid-sim-1',
        timestamp: new Date()
      } as any);

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
