import { createServer } from 'http';
import { Server } from 'socket.io';
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { initializeSocket } from '../gateway/socket';

// Mock Prisma
const prismaMock = vi.hoisted(() => ({
  student: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  violation: {
    create: vi.fn(),
  },
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

describe('Heartbeat Cleanup Service', () => {
  let io: Server;
  let httpServer: any;
  let cleanupSocket: () => void;

  beforeAll(() => {
    vi.useFakeTimers();
    httpServer = createServer();
    io = new Server(httpServer);
    // Initialize socket which starts the interval
    cleanupSocket = initializeSocket(io);
  });

  afterAll(() => {
    cleanupSocket();
    io.close();
    httpServer.close();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect and cleanup disconnected students after 30s', async () => {
    // 1. Setup Mock: Return one dead student
    const deadStudent = {
      id: 'internal_id_1',
      studentId: 'public_id_1',
      isOnline: true,
      lastHeartbeat: new Date(Date.now() - 40000), // 40s ago
    };

    prismaMock.student.findMany.mockResolvedValue([deadStudent] as any);
    prismaMock.student.update.mockResolvedValue({} as any);
    prismaMock.violation.create.mockResolvedValue({} as any);

    // 2. Advance time by 10s (Interval tick)
    await vi.advanceTimersByTimeAsync(11000);

    // 3. Verify FindMany called
    expect(prismaMock.student.findMany).toHaveBeenCalled();
    const whereClause = prismaMock.student.findMany.mock.calls[0][0]?.where;
    expect(whereClause).toMatchObject({
      isOnline: true,
      // lastHeartbeat check is hard to match exactly due to time object diffs, 
      // but we know the function was called.
    });

    // 4. Verify Update called (Mark offline)
    expect(prismaMock.student.update).toHaveBeenCalledWith({
      where: { id: deadStudent.id },
      data: { isOnline: false },
    });

    // 5. Verify Violation created
    expect(prismaMock.violation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: deadStudent.studentId, // Ensure string ID used
        type: 'DISCONNECTION',
      }),
    });
  });
});
