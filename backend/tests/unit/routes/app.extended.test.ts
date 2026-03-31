import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@src/app';
import { prisma } from '@src/utils/prisma';
import { generateTeacherToken } from '@src/services/auth.service';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    checkTarget: {
      count: vi.fn().mockResolvedValue(5),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
    },
    submission: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe('App API - Extended Coverage', () => {
  const teacherToken = generateTeacherToken();

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
  });

  describe('GET /api/check-targets (DB success)', () => {
    it('should return 3 domains from database when available', async () => {
      (prisma.checkTarget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { url: 'https://www.google.com' },
        { url: 'https://www.github.com' },
        { url: 'https://www.stackoverflow.com' },
        { url: 'https://www.amazon.com' },
        { url: 'https://www.netflix.com' },
      ]);

      const res = await request(app)
        .get('/api/check-targets')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.domains).toHaveLength(3);
      res.body.domains.forEach((domain: string) => {
        expect(domain).toMatch(/^https?:\/\//);
      });
    });

    it('should return fewer domains when DB has less than 3', async () => {
      (prisma.checkTarget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { url: 'https://www.google.com' },
      ]);

      const res = await request(app)
        .get('/api/check-targets')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.domains.length).toBeLessThanOrEqual(3);
    });
  });

  describe('GET /api/session/:code - extended', () => {
    it('should return invalid for ended session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        code: '123456',
        isActive: false,
      });

      const res = await request(app).get('/api/session/123456');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe('Session has ended');
    });
  });

  describe('POST /api/upload - extended', () => {
    it('should reject upload for ended session', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
        isActive: false,
      });

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid or inactive session');
    });

    it('should handle DB error during upload gracefully', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
        isActive: true,
      });
      (prisma.student.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'uuid-1',
        studentId: 'stu1',
      });
      (prisma.submission.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB write error')
      );

      const res = await request(app)
        .post('/api/upload')
        .field('sessionCode', '123456')
        .field('studentId', 'stu1')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Upload failed');
    });
  });

  describe('GET /api/submissions/:sessionCode - extended', () => {
    it('should reject with expired teacher token', async () => {
      vi.useFakeTimers();
      const token = generateTeacherToken();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      const res = await request(app)
        .get('/api/submissions/123456')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      vi.useRealTimers();
    });

    it('should handle DB error when fetching submissions', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
      });
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB error')
      );

      const res = await request(app)
        .get('/api/submissions/123456')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Internal Server Error');
    });

    it('should return empty array when session has no submissions', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sess-1',
        code: '123456',
      });
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/submissions/123456')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('POST /api/auth/teacher - extended', () => {
    it('should reject non-string password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return token with correct structure', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'Proctor2026!' });

      expect(res.status).toBe(200);
      const parts = res.body.data.token.split('.');
      expect(parts).toHaveLength(2);

      // Verify payload is valid JSON
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(payload.role).toBe('teacher');
      expect(payload.iat).toBeDefined();
    });
  });

  describe('GET /health', () => {
    it('should include timestamp in health response', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(new Date(res.body.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Route not found');
    });

    it('should return 404 for unknown POST routes', async () => {
      const res = await request(app)
        .post('/api/nonexistent')
        .send({ data: 'test' });

      expect(res.status).toBe(404);
    });
  });
});
