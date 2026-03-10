import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { app } from '@src/app';
import { prisma } from '@src/utils/prisma';
import { generateTeacherToken } from '@src/services/auth.service';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    checkTarget: {
      count: vi.fn().mockResolvedValue(5),
    },
    session: {
      findUnique: vi.fn(),
    },
    questionFile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

const mockSessionFindUnique = prisma.session.findUnique as ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocked prisma does not match PrismaClient type
const qf = (prisma as any).questionFile;
const mockQfCreate = qf.create as ReturnType<typeof vi.fn>;
const mockQfFindMany = qf.findMany as ReturnType<typeof vi.fn>;
const mockQfFindUnique = qf.findUnique as ReturnType<typeof vi.fn>;
const mockQfDelete = qf.delete as ReturnType<typeof vi.fn>;

const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', '..', 'uploads'),
);
const testFileName = 'q-test-download.txt';
const testFilePath = path.join(UPLOADS_DIR, testFileName);

describe('Question Files API', () => {
  const token = generateTeacherToken();

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
  });

  afterEach(() => {
    // Clean up any test files written to disk by upload tests
    const uploadsDir = UPLOADS_DIR;
    if (fs.existsSync(uploadsDir)) {
      for (const f of fs.readdirSync(uploadsDir)) {
        if (f.startsWith('q-') && f.endsWith('.txt')) {
          fs.unlinkSync(path.join(uploadsDir, f));
        }
      }
    }
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  /* ── POST /api/session/:code/questions ──────────────────────── */

  describe('POST /api/session/:code/questions', () => {
    it('should reject without teacher token', async () => {
      const res = await request(app)
        .post('/api/session/123456/questions')
        .attach('file', Buffer.from('content'), 'exam.txt');

      expect(res.status).toBe(401);
    });

    it('should reject when no file provided', async () => {
      const res = await request(app)
        .post('/api/session/123456/questions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('No file provided');
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/session/999999/questions')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('content'), 'exam.txt');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session not found');
    });

    it('should reject upload to inactive session', async () => {
      mockSessionFindUnique.mockResolvedValue({
        id: 'sess-1', code: '123456', isActive: false,
      });

      const res = await request(app)
        .post('/api/session/123456/questions')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('content'), 'exam.txt');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Session is no longer active');
    });

    it('should successfully upload a question file', async () => {
      mockSessionFindUnique.mockResolvedValue({
        id: 'sess-1', code: '123456', isActive: true,
      });
      mockQfCreate.mockResolvedValue({
        id: 'qf-1',
        originalName: 'exam.txt',
        sizeBytes: 7,
        createdAt: new Date('2026-03-10T00:00:00Z'),
      });

      const res = await request(app)
        .post('/api/session/123456/questions')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('content'), 'exam.txt');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.originalName).toBe('exam.txt');
      expect(res.body.data.id).toBe('qf-1');
    });
  });

  /* ── GET /api/session/:code/questions ───────────────────────── */

  describe('GET /api/session/:code/questions', () => {
    it('should return 404 for non-existent session', async () => {
      mockSessionFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/session/999999/questions');

      expect(res.status).toBe(404);
    });

    it('should return question files for a valid session', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindMany.mockResolvedValue([
        {
          id: 'qf-1',
          originalName: 'exam.pdf',
          sizeBytes: 4096,
          createdAt: new Date('2026-03-10T00:00:00Z'),
        },
      ]);

      const res = await request(app).get('/api/session/123456/questions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].originalName).toBe('exam.pdf');
    });

    it('should return empty array when no question files exist', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindMany.mockResolvedValue([]);

      const res = await request(app).get('/api/session/123456/questions');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  /* ── GET /api/session/:code/questions/:id/download ──────────── */

  describe('GET /api/session/:code/questions/:id/download', () => {
    it('should return 404 for non-existent session', async () => {
      mockSessionFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/session/999999/questions/qf-1/download');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session not found');
    });

    it('should return 404 for non-existent question file', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/session/123456/questions/nonexistent/download');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should return 404 when file belongs to different session', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-other', storedName: testFileName, originalName: 'exam.txt',
      });

      const res = await request(app).get('/api/session/123456/questions/qf-1/download');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should return 404 when file missing from disk', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-1', storedName: 'missing.txt', originalName: 'exam.txt',
      });

      const res = await request(app).get('/api/session/123456/questions/qf-1/download');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found on disk');
    });

    it('should download file with original name', async () => {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'question content');

      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-1', storedName: testFileName, originalName: 'exam.pdf',
      });

      const res = await request(app).get('/api/session/123456/questions/qf-1/download');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('exam.pdf');
    });

    it('should prevent directory traversal', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-1', storedName: '../../package.json', originalName: 'package.json',
      });

      const res = await request(app).get('/api/session/123456/questions/qf-1/download');

      // path.basename strips traversal so it won't find the file in uploads
      expect(res.status).toBe(404);
    });
  });

  /* ── DELETE /api/session/:code/questions/:id ────────────────── */

  describe('DELETE /api/session/:code/questions/:id', () => {
    it('should reject without teacher token', async () => {
      const res = await request(app).delete('/api/session/123456/questions/qf-1');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent session', async () => {
      mockSessionFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/session/999999/questions/qf-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent question file', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/session/123456/questions/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('should delete question file and remove from disk', async () => {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, 'question content');

      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-1', storedName: testFileName, originalName: 'exam.pdf',
      });
      mockQfDelete.mockResolvedValue({ id: 'qf-1' });

      const res = await request(app)
        .delete('/api/session/123456/questions/qf-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockQfDelete).toHaveBeenCalledWith({ where: { id: 'qf-1' } });
      expect(fs.existsSync(testFilePath)).toBe(false);
    });

    it('should succeed even if file already missing from disk', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'sess-1', code: '123456' });
      mockQfFindUnique.mockResolvedValue({
        id: 'qf-1', sessionId: 'sess-1', storedName: 'already-gone.txt', originalName: 'exam.pdf',
      });
      mockQfDelete.mockResolvedValue({ id: 'qf-1' });

      const res = await request(app)
        .delete('/api/session/123456/questions/qf-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
