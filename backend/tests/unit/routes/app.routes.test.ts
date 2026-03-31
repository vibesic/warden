import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@src/app';
import { prisma } from '@src/utils/prisma';
import { generateTeacherToken } from '@src/services/auth.service';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    checkTarget: {
      count: vi.fn().mockResolvedValue(0),
      createMany: vi.fn().mockResolvedValue({ count: 10 }),
    },
    $queryRaw: vi.fn(),
    session: {
      findUnique: vi.fn(),
    }
  }
}));

describe('App Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/teacher', () => {
    it('should return token with correct password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'Proctor2026!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.split('.')).toHaveLength(2);
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid password');
    });

    it('should reject empty password', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({ password: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing password field', async () => {
      const res = await request(app)
        .post('/api/auth/teacher')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/session/:code', () => {
    it('should return valid true for active session', async () => {
      (prisma.session.findUnique as any).mockResolvedValue({
        code: '123456',
        isActive: true
      });

      const res = await request(app).get('/api/session/123456');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('should return valid false for invalid session', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(null);

      const res = await request(app).get('/api/session/999999');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe('Invalid session code');
    });

    it('should handle errors gracefully', async () => {
      (prisma.session.findUnique as any).mockRejectedValue(new Error('DB Error'));

      const res = await request(app).get('/api/session/123456');
      expect(res.status).toBe(500);
      expect(res.body.reason).toBe('Internal Server Error');
    });
  });

  describe('GET /api/check-targets (Fallback)', () => {
    it('should use fallback domains if DB fails', async () => {
      // Mock $queryRaw to throw
      (prisma.$queryRaw as any).mockRejectedValue(new Error('DB Failed'));

      const token = generateTeacherToken();
      const res = await request(app)
        .get('/api/check-targets')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.domains).toHaveLength(3);
      expect(res.body.domains[0]).toMatch(/^https?:\/\//);
    });
  });
});
