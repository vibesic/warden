import { createServer } from 'http';
import { Server } from 'socket.io';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeSocket } from '../gateway/socket';

const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  violation: {
    create: vi.fn().mockResolvedValue({ id: 'v-1', timestamp: new Date(), type: 'TEST', details: '' }),
  },
  session: {
    findUnique: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findFirst: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

describe('Student Handlers - Edge Cases', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };
  let clientSocket: ClientSocket;
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
    cleanup.clearIntervals();
    io.close();
    httpServer.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({
      id: 's1', code: '123456', isActive: true, createdAt: new Date(),
    });

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

  describe('sniffer:response edge cases', () => {
    it('should ignore sniffer:response when no pending challenge exists', async () => {
      const registerData = { studentId: 'sniffer_no_pending', name: 'No Pending', sessionCode: '123456' };
      prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-np', ...registerData } as never);

      await new Promise<void>((resolve) => {
        clientSocket.emit('register', registerData);
        clientSocket.once('registered', () => resolve());
      });

      // Send sniffer response without a pending challenge
      clientSocket.emit('sniffer:response', { challengeId: 'nonexistent', reachable: true });

      await new Promise((r) => setTimeout(r, 100));

      // Should not create any violation
      const internetCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);
    });

    it('should ignore sniffer:response with mismatched challengeId', async () => {
      const registerData = { studentId: 'sniffer_mismatch', name: 'Mismatch', sessionCode: '123456' };
      prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-mm', ...registerData } as never);

      await new Promise<void>((resolve) => {
        clientSocket.emit('register', registerData);
        clientSocket.once('registered', () => resolve());
      });

      // Set pending challenge on the server side
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find((s) => s.data.studentUuid === 'uuid-mm');
      expect(targetSocket).toBeDefined();

      targetSocket!.data.pendingChallenge = {
        challengeId: 'correct-id',
        targetUrl: 'https://www.google.com',
        issuedAt: Date.now(),
      };

      // Send with wrong challengeId
      clientSocket.emit('sniffer:response', { challengeId: 'wrong-id', reachable: true });

      await new Promise((r) => setTimeout(r, 100));

      const internetCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);
    });

    it('should ignore sniffer:response with invalid data format', async () => {
      const registerData = { studentId: 'sniffer_invalid', name: 'Invalid', sessionCode: '123456' };
      prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-inv', ...registerData } as never);

      await new Promise<void>((resolve) => {
        clientSocket.emit('register', registerData);
        clientSocket.once('registered', () => resolve());
      });

      // Send invalid data
      clientSocket.emit('sniffer:response', { invalid: 'data' });

      await new Promise((r) => setTimeout(r, 100));

      const internetCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);
    });
  });

  describe('report_violation edge cases', () => {
    it('should ignore violation when socket not registered', async () => {
      // Use a fresh socket that has never registered
      const freshSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((resolve) => freshSocket.on('connect', resolve));

      vi.clearAllMocks();

      freshSocket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'test' });

      await new Promise((r) => setTimeout(r, 200));

      // Only DISCONNECTION violations (from other tests) should be present, not INTERNET_ACCESS
      const internetCalls = prismaMock.violation.create.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);

      freshSocket.disconnect();
    });

    it('should ignore invalid violation data', async () => {
      const registerData = { studentId: 'violation_invalid', name: 'Invalid', sessionCode: '123456' };
      prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-vi', ...registerData } as never);

      await new Promise<void>((resolve) => {
        clientSocket.emit('register', registerData);
        clientSocket.once('registered', () => resolve());
      });

      // Send invalid violation data (type must be string)
      clientSocket.emit('report_violation', { type: 123 });

      await new Promise((r) => setTimeout(r, 100));

      expect(prismaMock.violation.create).not.toHaveBeenCalled();
    });

    it('should handle violation with details', async () => {
      const registerData = { studentId: 'violation_detail', name: 'Detail', sessionCode: '123456' };
      prismaMock.student.upsert.mockResolvedValue({ id: 'uuid-vd', ...registerData } as never);
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' } as never);

      await new Promise<void>((resolve) => {
        clientSocket.emit('register', registerData);
        clientSocket.once('registered', () => resolve());
      });

      clientSocket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'Detected internet access' });

      await new Promise((r) => setTimeout(r, 100));

      const call = prismaMock.violation.create.mock.calls.find(
        (args: unknown[]) => (args[0] as { data: { studentId: string } }).data.studentId === 'uuid-vd'
      );
      expect(call).toBeDefined();
      expect((call![0] as { data: { details: string } }).data.details).toBe('Detected internet access');
    });
  });

  describe('heartbeat edge cases', () => {
    it('should ignore heartbeat when socket not registered', async () => {
      // Use a fresh socket that has never registered
      const freshSocket = Client(`http://localhost:${port}`);
      await new Promise<void>((resolve) => freshSocket.on('connect', resolve));

      vi.clearAllMocks();

      freshSocket.emit('heartbeat', {});

      await new Promise((r) => setTimeout(r, 200));

      // heartbeat update sets isOnline: true — check no such call was made
      const heartbeatCalls = prismaMock.student.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { isOnline: boolean } }).data.isOnline === true
      );
      expect(heartbeatCalls).toHaveLength(0);

      freshSocket.disconnect();
    });
  });

  describe('register edge cases', () => {
    it('should reject registration with too-short sessionCode', async () => {
      return new Promise<void>((resolve) => {
        clientSocket.on('registration_error', (msg: string) => {
          expect(msg).toBe('Invalid data format');
          resolve();
        });

        clientSocket.emit('register', {
          studentId: 'test',
          name: 'Test',
          sessionCode: '12345', // 5 chars, needs 6
        });
      });
    });

    it('should reject registration with empty name', async () => {
      return new Promise<void>((resolve) => {
        clientSocket.on('registration_error', (msg: string) => {
          expect(msg).toBe('Invalid data format');
          resolve();
        });

        clientSocket.emit('register', {
          studentId: 'test',
          name: '',
          sessionCode: '123456',
        });
      });
    });

    it('should handle DB error during registration', async () => {
      prismaMock.student.upsert.mockRejectedValue(new Error('DB error'));

      return new Promise<void>((resolve) => {
        clientSocket.on('registration_error', (msg: string) => {
          expect(msg).toBe('Internal server error');
          resolve();
        });

        clientSocket.emit('register', {
          studentId: 'db_error',
          name: 'DB Error',
          sessionCode: '123456',
        });
      });
    });
  });
});
