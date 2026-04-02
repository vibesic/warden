import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';
import { mockStudentRegistration, applyDefaultMocks, type PrismaMock } from '../../helpers/prisma';
import { registerStudent } from '../../helpers/socketClient';

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
    create: vi.fn().mockResolvedValue({ id: 'v-1', timestamp: new Date(), type: 'TEST', details: '' }),
    findFirst: vi.fn(),
  },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (cb) => cb(prismaMock)),
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Student Handlers - Edge Cases', () => {
  let serverCtx: TestServerContext;
  let io: InstanceType<typeof import('socket.io').Server>;
  let clientSocket: ClientSocket;
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
    applyDefaultMocks(prismaMock);

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
      mockStudentRegistration(prismaMock, 'sniffer_no_pending', 'No Pending', 'stu-np', 'ss-np');
      await registerStudent(clientSocket, { studentId: 'sniffer_no_pending', name: 'No Pending', sessionCode: '123456' });

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
      mockStudentRegistration(prismaMock, 'sniffer_mismatch', 'Mismatch', 'stu-mm', 'ss-mm');
      await registerStudent(clientSocket, { studentId: 'sniffer_mismatch', name: 'Mismatch', sessionCode: '123456' });

      // Set pending challenge on the server side
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find((s) => s.data.sessionStudentId === 'ss-mm');
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
      mockStudentRegistration(prismaMock, 'sniffer_invalid', 'Invalid', 'stu-inv', 'ss-inv');
      await registerStudent(clientSocket, { studentId: 'sniffer_invalid', name: 'Invalid', sessionCode: '123456' });

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
      mockStudentRegistration(prismaMock, 'violation_invalid', 'Invalid', 'stu-vi', 'ss-vi');
      await registerStudent(clientSocket, { studentId: 'violation_invalid', name: 'Invalid', sessionCode: '123456' });

      // Send invalid violation data (type must be string)
      clientSocket.emit('report_violation', { type: 123 });

      await new Promise((r) => setTimeout(r, 100));

      expect(prismaMock.violation.create).not.toHaveBeenCalled();
    });

    it('should handle violation with details', async () => {
      mockStudentRegistration(prismaMock, 'violation_detail', 'Detail', 'stu-vd', 'ss-vd');
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' } as never);
      await registerStudent(clientSocket, { studentId: 'violation_detail', name: 'Detail', sessionCode: '123456' });

      clientSocket.emit('report_violation', { type: 'INTERNET_ACCESS', details: 'Detected internet access' });

      await new Promise((r) => setTimeout(r, 100));

      const call = prismaMock.violation.create.mock.calls.find(
        (args: unknown[]) => (args[0] as { data: { sessionStudentId: string } }).data.sessionStudentId === 'ss-vd'
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
      const heartbeatCalls = prismaMock.sessionStudent.update.mock.calls.filter(
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
