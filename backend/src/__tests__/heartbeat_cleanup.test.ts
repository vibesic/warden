import { createServer } from 'http';
import { Server } from 'socket.io';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { initializeSocket } from '../gateway/socket';

// Mock Prisma
const prismaMock = vi.hoisted(() => ({
  sessionStudent: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  violation: {
    create: vi.fn(),
  },
}));

vi.mock('../utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Heartbeat Cleanup Service', () => {
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

  it('should detect and cleanup disconnected students after 30s', async () => {
    // 1. Setup Mock: Return one dead session student (normalized schema)
    const deadStudent = {
      id: 'ss-1',
      student: { studentId: 'public_id_1' },
      isOnline: true,
      lastHeartbeat: new Date(Date.now() - 60000),
      session: {
        code: '123456',
      },
    };

    prismaMock.sessionStudent.findMany.mockResolvedValue([deadStudent] as never[]);
    prismaMock.sessionStudent.update.mockResolvedValue({} as never);
    prismaMock.violation.create.mockResolvedValue({ timestamp: new Date() } as never);

    // 2. Advance time by > 30s (Interval tick is 30s)
    await vi.advanceTimersByTimeAsync(32000);

    // 3. Verify FindMany called (sessionStudent model)
    expect(prismaMock.sessionStudent.findMany).toHaveBeenCalled();
    const whereClause = prismaMock.sessionStudent.findMany.mock.calls[0][0]?.where;
    expect(whereClause).toMatchObject({
      isOnline: true,
    });

    // 4. Verify Update called (Mark offline)
    expect(prismaMock.sessionStudent.update).toHaveBeenCalledWith({
      where: { id: deadStudent.id },
      data: { isOnline: false },
    });

    // 5. Verify Violation created with sessionStudentId
    expect(prismaMock.violation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionStudentId: deadStudent.id,
        type: 'DISCONNECTION',
      }),
    });
  });
});
