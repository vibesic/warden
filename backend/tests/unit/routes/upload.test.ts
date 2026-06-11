import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@src/app';
import { prisma } from '@src/utils/prisma';
import { generateTeacherToken } from '@src/services/auth.service';

// Mock prisma
vi.mock('@src/utils/prisma', () => {
  const submissionMock = {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  return {
    prisma: {
      checkTarget: {
        count: vi.fn().mockResolvedValue(5),
        createMany: vi.fn(),
      },
      session: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      sessionStudent: {
        findFirst: vi.fn(),
      },
      submission: submissionMock,
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (callback) => callback({ submission: submissionMock })),
    },
  };
});

describe('Upload & Submissions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.submission.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
  });

  describe('POST /api/upload', () => {
    it('should reject when no file provided', async () => {
      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('No file provided');
    });

    it('should reject when sessionCode or studentId missing', async () => {
      const res = await request(app)
        .post('/api/upload')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('sessionCode and studentId are required');
    });

    it('should reject for invalid or inactive session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '999999')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid or inactive session');
    });

    it('should reject when student not found in session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
        isActive: true,
      });
      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Student not found in session');
    });

    it('should successfully upload a file', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
        isActive: true,
      });
      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
        studentId: 'uuid-1',
      });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub1',
        originalName: 'test.txt',
        storedName: 'stored.txt',
        sizeBytes: 12,
        createdAt: new Date('2026-02-19T00:00:00Z'),
      });

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.originalName).toBe('test.txt');
    });

    it('should overwrite a previous submission from the same student', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
        isActive: true,
      });
      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
        studentId: 'uuid-1',
      });
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'old-1', storedName: 'old-stored.txt', createdAt: new Date('2026-02-19T01:00:00Z') },
      ]);
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sub-new',
        originalName: 'replacement.txt',
        storedName: 'new-stored.txt',
        sizeBytes: 20,
        createdAt: new Date('2026-02-19T02:00:00Z'),
      });

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('replacement'), 'replacement.txt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.replaced).toEqual({
        count: 1,
        previousCreatedAt: '2026-02-19T01:00:00.000Z',
      });
      expect(prisma.submission.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1'] } },
      });
      expect(prisma.submission.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/submissions/:sessionCode', () => {
    it('should reject without teacher token', async () => {
      const res = await request(app).get('/api/submissions/123456');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for unknown session', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/submissions/999999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return submissions for a valid session', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
      });
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub1',
          originalName: 'hw.pdf',
          storedName: 'stored.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          createdAt: new Date('2026-02-19T01:00:00Z'),
          sessionStudent: { student: { studentId: 'stu1', name: 'Alice' } },
        },
      ]);

      const res = await request(app)
        .get('/api/submissions/123456')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].originalName).toBe('hw.pdf');
      expect(res.body.data[0].student.name).toBe('Alice');
    });
  });


  describe('GET /api/upload/:sessionCode/:studentId/download', () => {
    it('should allow a student to download their own submission', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        isActive: true,
      });

      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
      });

      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub-1',
          storedName: 'fake-stored-name.txt',
          originalName: 'answer.txt',
          sizeBytes: 10,
          createdAt: new Date(),
        }
      ]);

      const fsMock = require('fs');
      vi.spyOn(fsMock, 'existsSync').mockReturnValue(true);

      const res = await request(app).get('/api/upload/session-123/studentABC/download');
    });
  });

  describe('GET /api/upload/:sessionCode/:studentId', () => {
    it('should return metadata if submission exists', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        isActive: true,
      });

      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
      });

      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub-1',
          storedName: 'fake-stored-name.txt',
          originalName: 'answer.txt',
          sizeBytes: 10,
          createdAt: new Date(),
        }
      ]);

      const res = await request(app).get('/api/upload/session-123/studentABC');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.originalName).toBe('answer.txt');
    });

    it('should return null data if no submission exists', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        isActive: true,
      });

      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
      });

      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await request(app).get('/api/upload/session-123/studentABC');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });
  });
});
