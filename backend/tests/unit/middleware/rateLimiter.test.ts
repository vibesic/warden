import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@src/app';
import { prisma } from '@src/utils/prisma';
import { generateTeacherToken } from '@src/services/auth.service';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    checkTarget: {
      count: vi.fn().mockResolvedValue(5),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        { url: 'https://www.google.com' },
        { url: 'https://www.microsoft.com' },
        { url: 'https://www.apple.com' },
      ]),
    },
    session: {
      findUnique: vi.fn(),
    },
    submission: {
      findFirst: vi.fn(),
    },
    sessionStudent: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

const mockSession = { id: 's1', code: '123456', isActive: true, createdAt: new Date(), durationMinutes: 60, endedAt: null };

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
  });

  describe('Headers', () => {
    it('should include rate limit headers on auth endpoint', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'wrongpass' });

      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('should include rate limit headers on session endpoint', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/session/123456');

      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('should include rate limit headers on general API endpoints', async () => {
      const res = await request(app).get('/api/auth/verify');

      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  /*
   * ──────────────────────────────────────────────────────────────
   * Legitimate Traffic Pattern Tests
   *
   * Simulate the worst-case classroom scenario:
   *   50 students + 1 teacher behind the same NAT (shared IP)
   *
   * Every request below mirrors a real frontend call pattern.
   * None of these must be rate-limited / blocked (status 429).
   * ──────────────────────────────────────────────────────────────
   */

  describe('Legitimate classroom traffic — auth (20 req/15 min)', () => {
    it('should allow 3 teacher login attempts without blocking', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/auth/teacher')
          .send({ password: 'wrongpass' });
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('Legitimate classroom traffic — session validation (200 req/15 min)', () => {
    it('should allow 50 students validating session codes (with retries)', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

      // 50 students × 2 attempts each = 100 requests
      for (let i = 0; i < 100; i++) {
        const res = await request(app).get('/api/session/123456');
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('Legitimate classroom traffic — general API (1000 req/15 min)', () => {
    const token = generateTeacherToken();

    it('should allow full classroom exam flow without being rate-limited', async () => {
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

      // --- Student traffic (50 students) ---

      // 50 students fetch question listing (1 each on mount)
      for (let i = 0; i < 50; i++) {
        const res = await request(app).get('/api/session/123456/questions');
        expect(res.status).not.toBe(429);
      }

      // 50 students each download 3 question files = 150 requests
      for (let i = 0; i < 150; i++) {
        const res = await request(app)
          .get('/api/session/123456/questions/q1/download');
        expect(res.status).not.toBe(429);
      }

      // 50 students each upload 2 submissions = 100 requests
      (prisma.sessionStudent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ss-1',
        student: { studentId: 'STU1' },
      });
      for (let i = 0; i < 100; i++) {
        const res = await request(app)
          .post('/api/upload')
          .field('sessionCode', '123456')
          .field('studentId', `STU${i}`)
          .attach('file', Buffer.from('test content'), 'homework.txt');
        expect(res.status).not.toBe(429);
      }

      // --- Teacher traffic ---

      // Teacher fetches question list (1 on mount)
      const qRes = await request(app)
        .get('/api/session/123456/questions');
      expect(qRes.status).not.toBe(429);

      // Teacher polls submissions every 15s for 15 min = 60 requests
      for (let i = 0; i < 60; i++) {
        const res = await request(app)
          .get('/api/submissions/123456')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).not.toBe(429);
      }

      // Teacher verifies auth on page load
      const verifyRes = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);
      expect(verifyRes.status).not.toBe(429);

      // Teacher fetches check-targets
      const ctRes = await request(app)
        .get('/api/check-targets')
        .set('Authorization', `Bearer ${token}`);
      expect(ctRes.status).not.toBe(429);

      // Total: 50 + 150 + 100 + 1 + 60 + 1 + 1 = 363 requests
      // Well within the 1000 limit
    });
  });
});
