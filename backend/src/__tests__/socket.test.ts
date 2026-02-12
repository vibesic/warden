import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';

// Mock Prisma
// We must mock '../utils/prisma' BEFORE importing the module that uses it
// Since socket.ts imports it at top level.
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

describe('Socket Gateway', () => {
  let io: Server;
  let clientSocket: ClientSocket;
  let httpServer: any;
  let cleanupSocket: () => void;
  const port = 3001; // Use different port for tests

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
    // Clear mocks
    vi.clearAllMocks();

    // Setup new client for each test
    clientSocket = Client(`http://localhost:${port}`);
    return new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('should register a new student and emit registered event', async () => {
    const studentData = { studentId: 'test_student_1', name: 'Test Student' };

    // Setup Mock
    prismaMock.student.upsert.mockResolvedValue({} as any);

    return new Promise<void>((resolve, reject) => {
      clientSocket.emit('register', studentData);

      clientSocket.on('registered', (data) => {
        try {
          expect(data).toMatchObject({ studentId: studentData.studentId });
          expect(prismaMock.student.upsert).toHaveBeenCalled();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should process heartbeat', async () => {
    const heartbeatData = { studentId: 'test_student_2' };
    prismaMock.student.update.mockResolvedValue({} as any);

    clientSocket.emit('register', { studentId: 'test_student_2', name: 'Test' });
    // Small delay to ensure registration before heartbeat (though not strictly required by server logic, good for realism)
    await new Promise(r => setTimeout(r, 50));

    clientSocket.emit('heartbeat', heartbeatData);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 200));

    // The disconnect handler from previous tests might interfere if we don't look specifically
    // We expect at least one call with isOnline: true
    const calls = prismaMock.student.update.mock.calls;
    const heartbeatCall = calls.find(args => args[0].where.studentId === heartbeatData.studentId && args[0].data.isOnline === true);
    expect(heartbeatCall).toBeDefined();
  });

  it('should report violation', async () => {
    const violationData = {
      studentId: 'test_student_3',
      type: 'INTERNET_ACCESS',
      details: 'Google detected'
    };
    prismaMock.violation.create.mockResolvedValue({} as any);

    return new Promise<void>((resolve) => {
      clientSocket.emit('report_violation', violationData);

      setTimeout(() => {
        // Find the call for this specific student
        const calls = prismaMock.violation.create.mock.calls;
        const callArgs = calls.find(c => c[0].data.studentId === violationData.studentId)?.[0];

        expect(callArgs).toBeDefined();
        expect(callArgs!.data).toMatchObject({
          studentId: violationData.studentId,
          type: violationData.type,
          details: violationData.details,
        });
        resolve();
      }, 50);
    });
  });

  it('should ignore invalid register data', async () => {
    const invalidData = { studentId: '' }; // Missing name
    prismaMock.student.upsert.mockResolvedValue({} as any);

    return new Promise<void>((resolve) => {
      clientSocket.emit('register', invalidData);

      setTimeout(() => {
        expect(prismaMock.student.upsert).not.toHaveBeenCalled();
        resolve();
      }, 50);
    });
  });
});
