import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../app';
import prisma from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  default: {
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
        .send({ password: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.split('.')).toHaveLength(2);
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

      const res = await request(app).get('/api/check-targets');

      expect(res.status).toBe(200);
      expect(res.body.domains).toHaveLength(3);
      expect(res.body.domains[0]).toMatch(/^https?:\/\//);
    });
  });
});
