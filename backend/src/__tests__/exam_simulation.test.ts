import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';

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
    cleanupSocket = initializeSocket(io);
    httpServer.listen(port);
  });

  afterAll(() => {
    cleanupSocket();
    io.close();
    httpServer.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully complete the full Register -> Report -> Alert flow', () => {
    return new Promise<void>(async (resolve, reject) => {
      // Setup successful DB responses
      prismaMock.student.upsert.mockResolvedValue({ studentId: 'sim_student_01' } as any);
      prismaMock.violation.create.mockResolvedValue({
        id: 'v_123',
        type: 'INTERNET_ACCESS',
        studentId: 'sim_student_01'
      } as any);

      // 1. Teacher Connects
      const teacherSocket = Client(`http://localhost:${port}`);
      const studentSocket = Client(`http://localhost:${port}`);

      const teardown = () => {
        teacherSocket.disconnect();
        studentSocket.disconnect();
      };

      // Handle Timeout (Fail test if flow takes too long)
      const timeout = setTimeout(() => {
        teardown();
        reject(new Error('Simulation timed out: Alert not received'));
      }, 2000);

      // Teacher Logic
      teacherSocket.on('connect', () => {
        teacherSocket.emit('dashboard:join');
      });

      teacherSocket.on('dashboard:alert', (data) => {
        try {
          expect(data).toBeDefined();
          expect(data.violation.type).toBe('INTERNET_ACCESS');
          expect(data.studentId).toBe('sim_student_01');

          clearTimeout(timeout);
          teardown();
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          teardown();
          reject(error);
        }
      });

      // Student Logic
      studentSocket.on('connect', () => {
        studentSocket.emit('register', {
          studentId: 'sim_student_01',
          name: 'Simulation Student'
        });
      });

      // The Critical Fix Verification: Wait for 'registered'
      studentSocket.on('registered', () => {
        studentSocket.emit('report_violation', {
          studentId: 'sim_student_01',
          type: 'INTERNET_ACCESS',
          details: 'Simulation Script Violation'
        });
      });
    });
  });
});
