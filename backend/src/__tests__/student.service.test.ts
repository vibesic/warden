import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerStudent, updateHeartbeat, markStudentOffline, getSessionStudentsForSession, findDeadHeartbeats } from '../services/student.service';
import prisma from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  default: {
    student: {
      upsert: vi.fn(),
    },
    sessionStudent: {
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
    it('should upsert a student and session student with correct params', async () => {
      const mockStudent = { id: 'stu-1', studentId: 'stu1', name: 'Test' };
      const mockSessionStudent = { id: 'ss-1', studentId: 'stu-1', sessionId: 'sess1', student: mockStudent };
      (prisma.student.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockStudent);
      (prisma.sessionStudent.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionStudent);

      const result = await registerStudent({
        studentId: 'stu1',
        sessionId: 'sess1',
        name: 'Test',
        ipAddress: '192.168.1.10',
      });

      expect(prisma.student.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'stu1' },
          create: expect.objectContaining({ studentId: 'stu1', name: 'Test' }),
          update: expect.objectContaining({ name: 'Test' }),
        })
      );
      expect(prisma.sessionStudent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId_sessionId: { studentId: 'stu-1', sessionId: 'sess1' } },
          create: expect.objectContaining({ studentId: 'stu-1', isOnline: true }),
          update: expect.objectContaining({ isOnline: true }),
        })
      );
      expect(result).toEqual(mockSessionStudent);
    });
  });

  describe('updateHeartbeat', () => {
    it('should update heartbeat timestamp and set online', async () => {
      (prisma.sessionStudent.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await updateHeartbeat('ss-1');

      expect(prisma.sessionStudent.update).toHaveBeenCalledWith({
        where: { id: 'ss-1' },
        data: expect.objectContaining({ isOnline: true }),
      });
    });
  });

  describe('markStudentOffline', () => {
    it('should mark session student offline', async () => {
      (prisma.sessionStudent.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await markStudentOffline('ss-1');

      expect(prisma.sessionStudent.update).toHaveBeenCalledWith({
        where: { id: 'ss-1' },
        data: { isOnline: false },
      });
    });
  });

  describe('getSessionStudentsForSession', () => {
    it('should fetch session students with student and violations for a session', async () => {
      const mockSessionStudents = [
        { id: 'ss-1', student: { studentId: 'stu1', name: 'Test' }, violations: [] },
      ];
      (prisma.sessionStudent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessionStudents);

      const result = await getSessionStudentsForSession('sess1');

      expect(prisma.sessionStudent.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess1' },
        include: {
          student: true,
          violations: { orderBy: { timestamp: 'desc' } },
        },
      });
      expect(result).toEqual(mockSessionStudents);
    });
  });

  describe('findDeadHeartbeats', () => {
    it('should find session students with stale heartbeats', async () => {
      const mockDead = [{ id: 'ss-1', isOnline: true, student: { studentId: 'stu1' }, session: { code: '123456' } }];
      (prisma.sessionStudent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockDead);

      const result = await findDeadHeartbeats();

      expect(prisma.sessionStudent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isOnline: true,
            lastHeartbeat: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          include: { student: true, session: true },
        })
      );
      expect(result).toEqual(mockDead);
    });

    it('should accept custom threshold', async () => {
      (prisma.sessionStudent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await findDeadHeartbeats(10000);

      const call = (prisma.sessionStudent.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const threshold = call.where.lastHeartbeat.lt;
      // Threshold should be ~10s ago (with some tolerance)
      expect(Date.now() - threshold.getTime()).toBeGreaterThanOrEqual(9000);
      expect(Date.now() - threshold.getTime()).toBeLessThan(12000);
    });
  });
});
