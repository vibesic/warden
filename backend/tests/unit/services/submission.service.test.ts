import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubmission, getSubmissionsForSession, getSubmissionsForStudent, findSubmissionByStoredName } from '@src/services/submission.service';
import { prisma } from '@src/utils/prisma';
import { deleteUploadedFile } from '@src/utils/fileHelpers';

vi.mock('@src/utils/prisma', () => {
  const submissionMock = {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    prisma: {
      submission: submissionMock,
      $transaction: vi.fn(async (callback) => callback({ submission: submissionMock })),
    },
  };
});

vi.mock('@src/utils/fileHelpers', () => ({
  deleteUploadedFile: vi.fn(),
  getSecureFilePath: vi.fn((name: string) => `/uploads/${name}`),
  serveFileDownload: vi.fn(),
}));

describe('Submission Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubmission', () => {
    it('should create a submission record when none exists', async () => {
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
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSubmission);

      const result = await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'homework.pdf',
        storedName: '1708300000-abc123.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(prisma.submission.findMany).toHaveBeenCalledWith({
        where: { sessionStudentId: 'ss-1', sessionId: 'sess-1' },
        select: { id: true, storedName: true },
      });
      expect(prisma.submission.deleteMany).not.toHaveBeenCalled();
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
      expect(deleteUploadedFile).not.toHaveBeenCalled();
      expect(result).toEqual(mockSubmission);
    });

    it('should sanitize originalName via path.basename', async () => {
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub1',
        originalName: 'evil.pdf',
        storedName: 'stored.pdf',
        sizeBytes: 10,
        createdAt: new Date(),
      });

      await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: '../../../etc/evil.pdf',
        storedName: 'stored.pdf',
        mimeType: null,
        sizeBytes: 10,
      });

      const createArg = (prisma.submission.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createArg.data.originalName).toBe('evil.pdf');
    });

    it('should overwrite a previous submission for the same student+session', async () => {
      const previous = [{ id: 'old-1', storedName: 'old-stored-1.pdf' }];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(previous);
      (prisma.submission.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-sub',
        originalName: 'new.pdf',
        storedName: 'new-stored.pdf',
        sizeBytes: 200,
        createdAt: new Date(),
      });

      const result = await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'new.pdf',
        storedName: 'new-stored.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 200,
      });

      expect(prisma.submission.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1'] } },
      });
      expect(prisma.submission.create).toHaveBeenCalled();
      expect(deleteUploadedFile).toHaveBeenCalledTimes(1);
      expect(deleteUploadedFile).toHaveBeenCalledWith('old-stored-1.pdf');
      expect(result.id).toBe('new-sub');
    });

    it('should delete files for multiple previous submissions', async () => {
      const previous = [
        { id: 'old-1', storedName: 'old-1.txt' },
        { id: 'old-2', storedName: 'old-2.txt' },
        { id: 'old-3', storedName: 'old-3.txt' },
      ];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(previous);
      (prisma.submission.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-sub',
        originalName: 'final.txt',
        storedName: 'final.txt',
        sizeBytes: 1,
        createdAt: new Date(),
      });

      await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'final.txt',
        storedName: 'final.txt',
        mimeType: 'text/plain',
        sizeBytes: 1,
      });

      expect(prisma.submission.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2', 'old-3'] } },
      });
      expect(deleteUploadedFile).toHaveBeenCalledTimes(3);
    });

    it('should not delete the newly uploaded file even if it matches an old storedName', async () => {
      const previous = [{ id: 'old-1', storedName: 'same.txt' }];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(previous);
      (prisma.submission.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-sub',
        originalName: 'same.txt',
        storedName: 'same.txt',
        sizeBytes: 5,
        createdAt: new Date(),
      });

      await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'same.txt',
        storedName: 'same.txt',
        mimeType: null,
        sizeBytes: 5,
      });

      expect(deleteUploadedFile).not.toHaveBeenCalled();
    });

    it('should still resolve even if disk deletion of a stale file fails', async () => {
      const previous = [{ id: 'old-1', storedName: 'old.txt' }];
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(previous);
      (prisma.submission.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-sub',
        originalName: 'new.txt',
        storedName: 'new.txt',
        sizeBytes: 5,
        createdAt: new Date(),
      });
      (deleteUploadedFile as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('disk error');
      });

      await expect(
        createSubmission({
          sessionStudentId: 'ss-1',
          sessionId: 'sess-1',
          originalName: 'new.txt',
          storedName: 'new.txt',
          mimeType: null,
          sizeBytes: 5,
        }),
      ).resolves.toMatchObject({ id: 'new-sub' });
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

  describe('findSubmissionByStoredName', () => {
    it('should query by storedName + sessionId', async () => {
      (prisma.submission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await findSubmissionByStoredName('stored.pdf', 'sess-1');

      expect(prisma.submission.findFirst).toHaveBeenCalledWith({
        where: { storedName: 'stored.pdf', sessionId: 'sess-1' },
      });
    });
  });
});
