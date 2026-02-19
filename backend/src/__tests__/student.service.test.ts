import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerStudent, updateHeartbeat, markStudentOffline, getStudentsForSession, findDeadHeartbeats } from '../services/student.service';
import prisma from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  default: {
    student: {
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Student Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerStudent', () => {
    it('should upsert a student with correct params', async () => {
      const mockStudent = { id: 'uuid-1', studentId: 'stu1', name: 'Test', sessionId: 'sess1' };
      (prisma.student.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockStudent);

      const result = await registerStudent({
        studentId: 'stu1',
        sessionId: 'sess1',
        name: 'Test',
        ipAddress: '192.168.1.10',
      });

      expect(prisma.student.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId_sessionId: { studentId: 'stu1', sessionId: 'sess1' } },
          create: expect.objectContaining({ studentId: 'stu1', name: 'Test', isOnline: true }),
          update: expect.objectContaining({ isOnline: true }),
        })
      );
      expect(result).toEqual(mockStudent);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat timestamp and set online', async () => {
      (prisma.student.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await updateHeartbeat('uuid-1');

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: expect.objectContaining({ isOnline: true }),
      });
    });
  });

  describe('markStudentOffline', () => {
    it('should mark student offline', async () => {
      (prisma.student.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await markStudentOffline('uuid-1');

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { isOnline: false },
      });
    });
  });

  describe('getStudentsForSession', () => {
    it('should fetch students with violations for a session', async () => {
      const mockStudents = [
        { id: 'uuid-1', studentId: 'stu1', violations: [] },
      ];
      (prisma.student.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockStudents);

      const result = await getStudentsForSession('sess1');

      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess1' },
        include: { violations: { orderBy: { timestamp: 'desc' } } },
      });
      expect(result).toEqual(mockStudents);
    });
  });

  describe('findDeadHeartbeats', () => {
    it('should find students with stale heartbeats', async () => {
      const mockDead = [{ id: 'uuid-1', isOnline: true, session: { code: '123456' } }];
      (prisma.student.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockDead);

      const result = await findDeadHeartbeats();

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isOnline: true,
            lastHeartbeat: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          include: { session: true },
        })
      );
      expect(result).toEqual(mockDead);
    });

    it('should accept custom threshold', async () => {
      (prisma.student.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await findDeadHeartbeats(10000);

      const call = (prisma.student.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const threshold = call.where.lastHeartbeat.lt;
      // Threshold should be ~10s ago (with some tolerance)
      expect(Date.now() - threshold.getTime()).toBeGreaterThanOrEqual(9000);
      expect(Date.now() - threshold.getTime()).toBeLessThan(12000);
    });
  });
});
