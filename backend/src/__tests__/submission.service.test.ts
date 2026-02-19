import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubmission, getSubmissionsForSession, getSubmissionsForStudent } from '../services/submission.service';
import prisma from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  default: {
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
        studentId: 'uuid-1',
        sessionId: 'sess-1',
        createdAt: new Date(),
      };
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubmission);

      const result = await createSubmission({
        studentUuid: 'uuid-1',
        sessionId: 'sess-1',
        originalName: 'homework.pdf',
        storedName: '1708300000-abc123.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: {
          studentId: 'uuid-1',
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
          student: { studentId: 'stu1', name: 'Alice' },
        },
      ];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubs);

      const result = await getSubmissionsForSession('sess-1');

      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess-1' },
        include: {
          student: { select: { studentId: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockSubs);
    });
  });

  describe('getSubmissionsForStudent', () => {
    it('should return submissions for a specific student in a session', async () => {
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await getSubmissionsForStudent('uuid-1', 'sess-1');

      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { studentId: 'uuid-1', sessionId: 'sess-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([]);
    });
  });
});
