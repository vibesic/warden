import { createServer } from 'http';
import { Server } from 'socket.io';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { initializeSocket } from '../gateway/socket';

const prismaMock = vi.hoisted(() => ({
  sessionStudent: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  violation: {
    create: vi.fn(),
  },
  checkTarget: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  session: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

describe('Background Jobs', () => {
  let io: Server;
  let httpServer: ReturnType<typeof createServer>;
  let cleanup: { clearIntervals: () => void };

  beforeAll(() => {
    vi.useFakeTimers();
    httpServer = createServer();
    io = new Server(httpServer);
    cleanup = initializeSocket(io);
  });

  afterAll(() => {
    cleanup.clearIntervals();
    io.close();
    httpServer.close();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sniffer Challenger', () => {
    it('should not issue challenges when no check targets available', async () => {
      prismaMock.checkTarget.count.mockResolvedValue(0);
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(61000);

      // With 0 targets, sniffer should skip broadcasting
      expect(prismaMock.checkTarget.findFirst).not.toHaveBeenCalled();
    });

    it('should fetch a random check target when targets exist', async () => {
      prismaMock.checkTarget.count.mockResolvedValue(5);
      prismaMock.checkTarget.findFirst.mockResolvedValue({ url: 'https://www.google.com' });
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(61000);

      expect(prismaMock.checkTarget.count).toHaveBeenCalledWith({ where: { isEnabled: true } });
      expect(prismaMock.checkTarget.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isEnabled: true },
        })
      );
    });
  });

  describe('Timer Checker', () => {
    it('should auto-end expired sessions', async () => {
      const oldDate = new Date(Date.now() - 120 * 60_000);
      const expiredSession = {
        id: 'expired-1',
        code: '111111',
        isActive: true,
        durationMinutes: 60,
        createdAt: oldDate,
      };

      prismaMock.session.findMany.mockResolvedValue([expiredSession]);
      prismaMock.session.update.mockResolvedValue({
        ...expiredSession,
        isActive: false,
        endedAt: new Date(),
      });
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(11000);

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: 'expired-1' },
        data: expect.objectContaining({ isActive: false }),
      });
    });

    it('should not end sessions that still have time left', async () => {
      const recentSession = {
        id: 'active-1',
        code: '222222',
        isActive: true,
        durationMinutes: 120,
        createdAt: new Date(),
      };

      prismaMock.session.findMany.mockResolvedValue([recentSession]);
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(11000);

      // session.update should not be called for timer ending
      const timerEndCalls = prismaMock.session.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { where: { id: string } }).where.id === 'active-1'
      );
      expect(timerEndCalls).toHaveLength(0);
    });

    it('should handle errors in timer checker gracefully', async () => {
      prismaMock.session.findMany.mockRejectedValue(new Error('DB error'));
      prismaMock.sessionStudent.findMany.mockResolvedValue([]);

      // Should not throw - errors are caught internally
      await vi.advanceTimersByTimeAsync(11000);
    });
  });

  describe('Heartbeat Checker - additional cases', () => {
    it('should handle errors in heartbeat checker gracefully', async () => {
      prismaMock.sessionStudent.findMany.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await vi.advanceTimersByTimeAsync(32000);
    });

    it('should handle multiple dead students', async () => {
      const deadStudents = [
        {
          id: 'dead-1',
          student: { studentId: 'stu-1' },
          isOnline: true,
          lastHeartbeat: new Date(Date.now() - 60000),
          session: { code: '123456' },
        },
        {
          id: 'dead-2',
          student: { studentId: 'stu-2' },
          isOnline: true,
          lastHeartbeat: new Date(Date.now() - 90000),
          session: { code: '123456' },
        },
      ];

      prismaMock.sessionStudent.findMany.mockResolvedValue(deadStudents as never[]);
      prismaMock.sessionStudent.update.mockResolvedValue({} as never);
      prismaMock.violation.create.mockResolvedValue({ timestamp: new Date() } as never);

      await vi.advanceTimersByTimeAsync(32000);

      // Both students should be marked offline
      const offlineCalls = prismaMock.sessionStudent.update.mock.calls.filter(
        (args: unknown[]) => (args[0] as { data: { isOnline: boolean } }).data.isOnline === false
      );
      expect(offlineCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
