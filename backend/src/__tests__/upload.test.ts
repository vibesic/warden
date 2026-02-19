import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../utils/prisma';
import { generateTeacherToken } from '../services/auth.service';

// Mock prisma
vi.mock('../utils/prisma', () => ({
  default: {
    checkTarget: {
      count: vi.fn().mockResolvedValue(5),
      createMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
    },
    submission: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

describe('Upload & Submissions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
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
      (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

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
      (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'uuid-1',
        studentId: 'stu1',
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
          student: { studentId: 'stu1', name: 'Alice' },
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
});
