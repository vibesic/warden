import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubmission, getSubmissionsForSession, getSubmissionsForStudent } from '@src/services/submission.service';
import { prisma } from '@src/utils/prisma';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    submission: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Submission Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubmission', () => {
    it('should create a submission record', async () => {
      const mockSubmission = {
        id: 'sub1',
        originalName: 'homework.pdf',
        storedName: '1708300000-abc123.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        createdAt: new Date(),
      };
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubmission);

      const result = await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'homework.pdf',
        storedName: '1708300000-abc123.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: {
          sessionStudentId: 'ss-1',
          sessionId: 'sess-1',
          originalName: 'homework.pdf',
          storedName: '1708300000-abc123.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
      });
      expect(result).toEqual(mockSubmission);
    });
  });

  describe('getSubmissionsForSession', () => {
    it('should return submissions with student info', async () => {
      const mockSubs = [
        {
          id: 'sub1',
          originalName: 'file.zip',
          sessionStudent: { student: { studentId: 'stu1', name: 'Alice' } },
        },
      ];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubs);

      const result = await getSubmissionsForSession('sess-1');

      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess-1' },
        include: {
          sessionStudent: {
            include: {
              student: { select: { studentId: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockSubs);
    });
  });

  describe('getSubmissionsForStudent', () => {
    it('should return submissions for a specific session student', async () => {
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await getSubmissionsForStudent('ss-1', 'sess-1');

      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { sessionStudentId: 'ss-1', sessionId: 'sess-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([]);
    });
  });
});
