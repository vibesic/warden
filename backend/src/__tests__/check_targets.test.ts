import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTeacherToken } from '../services/auth.service';

const prismaMock = vi.hoisted(() => ({
  checkTarget: {
    count: vi.fn(),
    createMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('../utils/prisma', () => ({
  default: prismaMock,
}));

import app from '../app';

describe('Check Targets API', () => {
  const token = generateTeacherToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/check-targets should return 3 domains', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { url: 'https://www.google.com' },
      { url: 'https://www.github.com' },
      { url: 'https://www.stackoverflow.com' },
    ]);

    const response = await request(app)
      .get('/api/check-targets')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('domains');
    expect(Array.isArray(response.body.domains)).toBe(true);
    expect(response.body.domains).toHaveLength(3);

    response.body.domains.forEach((domain: string) => {
      expect(typeof domain).toBe('string');
      expect(domain).toMatch(/^https?:\/\//);
    });
  });

  it('GET /api/check-targets should fallback to PUBLIC_DOMAINS when DB query fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('DB connection failed'));

    const response = await request(app)
      .get('/api/check-targets')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('domains');
    expect(response.body.domains).toHaveLength(3);

    response.body.domains.forEach((domain: string) => {
      expect(typeof domain).toBe('string');
      expect(domain).toMatch(/^https?:\/\//);
    });
  });
});
