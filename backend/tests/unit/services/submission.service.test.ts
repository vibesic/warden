import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
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
        select: { id: true, storedName: true, createdAt: true },
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
      expect(result.submission).toEqual(mockSubmission);
      expect(result.replaced).toEqual({ count: 0, previousCreatedAt: null });
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
      const previousCreatedAt = new Date('2026-05-25T10:00:00Z');
      const previous = [{ id: 'old-1', storedName: 'old-stored-1.pdf', createdAt: previousCreatedAt }];
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
      expect(result.submission.id).toBe('new-sub');
      expect(result.replaced).toEqual({
        count: 1,
        previousCreatedAt: previousCreatedAt.toISOString(),
      });
    });

    it('should delete files for multiple previous submissions', async () => {
      const previous = [
        { id: 'old-1', storedName: 'old-1.txt', createdAt: new Date('2026-05-25T09:00:00Z') },
        { id: 'old-2', storedName: 'old-2.txt', createdAt: new Date('2026-05-25T10:00:00Z') },
        { id: 'old-3', storedName: 'old-3.txt', createdAt: new Date('2026-05-25T08:00:00Z') },
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
      const previous = [{ id: 'old-1', storedName: 'same.txt', createdAt: new Date() }];
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
      const previous = [{ id: 'old-1', storedName: 'old.txt', createdAt: new Date() }];
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
      ).resolves.toMatchObject({ submission: { id: 'new-sub' } });
    });

    it('should retry on Prisma P2002 unique-constraint violation (concurrent overwrite)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

      const createdSubmission = {
        id: 'retry-sub',
        originalName: 'race.txt',
        storedName: 'race-stored.txt',
        sizeBytes: 10,
        createdAt: new Date(),
      };

      const transactionMock = prisma.$transaction as ReturnType<typeof vi.fn>;
      transactionMock.mockReset();
      transactionMock
        .mockRejectedValueOnce(p2002)
        .mockImplementationOnce(async (cb: any) => cb({ submission: prisma.submission }));

      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue(createdSubmission);

      const result = await createSubmission({
        sessionStudentId: 'ss-1',
        sessionId: 'sess-1',
        originalName: 'race.txt',
        storedName: 'race-stored.txt',
        mimeType: null,
        sizeBytes: 10,
      });

      expect(transactionMock).toHaveBeenCalledTimes(2);
      expect(result.submission.id).toBe('retry-sub');
    });

    it('should give up after exceeding the P2002 retry budget', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

      const transactionMock = prisma.$transaction as ReturnType<typeof vi.fn>;
      transactionMock.mockReset();
      transactionMock.mockRejectedValue(p2002);

      await expect(
        createSubmission({
          sessionStudentId: 'ss-1',
          sessionId: 'sess-1',
          originalName: 'race.txt',
          storedName: 'race-stored.txt',
          mimeType: null,
          sizeBytes: 10,
        }),
      ).rejects.toBe(p2002);

      // 1 initial attempt + 2 retries = 3 calls
      expect(transactionMock).toHaveBeenCalledTimes(3);
    });

    it('should rethrow non-P2002 errors without retrying', async () => {
      const boom = new Error('boom');
      const transactionMock = prisma.$transaction as ReturnType<typeof vi.fn>;
      transactionMock.mockReset();
      transactionMock.mockRejectedValue(boom);

      await expect(
        createSubmission({
          sessionStudentId: 'ss-1',
          sessionId: 'sess-1',
          originalName: 'x.txt',
          storedName: 'x.txt',
          mimeType: null,
          sizeBytes: 1,
        }),
      ).rejects.toBe(boom);

      expect(transactionMock).toHaveBeenCalledTimes(1);
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
          include: {
            sessionStudent: {
              include: {
                student: true,
              },
            },
          },
        });
    });
  });
});
