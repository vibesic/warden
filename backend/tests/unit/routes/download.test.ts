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
      createMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
    },
    submission: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

const mockSession = { id: 'session-1', code: '123456', isActive: true };

describe('Download API', () => {
  const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', '..', 'uploads'));
  const testFileName = 'test-download-file.txt';
  const testFilePath = path.join(UPLOADS_DIR, testFileName);

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'test file content for download');
  });

  afterEach(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('GET /api/submissions/:sessionCode/download/:storedName', () => {
    it('should reject without teacher token', async () => {
      const res = await request(app)
        .get('/api/submissions/123456/download/somefile.txt');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should reject with invalid teacher token', async () => {
      const res = await request(app)
        .get('/api/submissions/123456/download/somefile.txt')
        .set('Authorization', 'Bearer invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should accept token from query param', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        originalName: 'homework.pdf',
        storedName: testFileName,
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .get(`/api/submissions/123456/download/${testFileName}?token=${token}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent file', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/submissions/123456/download/nonexistent.txt')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should download file with original name from DB', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        originalName: 'homework.pdf',
        storedName: testFileName,
        sessionId: mockSession.id,
      });

      const res = await request(app)
        .get(`/api/submissions/123456/download/${testFileName}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('homework.pdf');
    });

    it('should return 404 if submission not in session', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/submissions/123456/download/${testFileName}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('File not found');
    });

    it('should prevent directory traversal attacks', async () => {
      const token = generateTeacherToken();

      const res = await request(app)
        .get('/api/submissions/123456/download/..%2F..%2Fpackage.json')
        .set('Authorization', `Bearer ${token}`);

      // path.basename strips traversal, so it looks for "package.json" in uploads dir
      // which won't exist there
      expect(res.status).toBe(404);
    });

    it('should return 404 for invalid session', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/submissions/123456/download/${testFileName}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session not found');
    });

    it('should handle DB error gracefully during download', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection error')
      );

      const res = await request(app)
        .get(`/api/submissions/123456/download/${testFileName}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/internal server error/i);
    });
  });

  describe('GET /api/submissions/:sessionCode/download-all', () => {
    const secondFileName = 'second-download-file.txt';
    const secondFilePath = path.join(UPLOADS_DIR, secondFileName);

    beforeEach(() => {
      fs.writeFileSync(secondFilePath, 'second file content');
    });

    afterEach(() => {
      if (fs.existsSync(secondFilePath)) {
        fs.unlinkSync(secondFilePath);
      }
    });

    it('should reject without teacher token', async () => {
      const res = await request(app)
        .get('/api/submissions/123456/download-all');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should accept token via query param', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub1',
          originalName: 'hw.txt',
          storedName: testFileName,
          mimeType: 'text/plain',
          sizeBytes: 30,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S001', name: 'Alice' } },
        },
      ]);

      const res = await request(app)
        .get(`/api/submissions/123456/download-all?token=${token}`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
    });

    it('should return 404 when no submissions exist', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/submissions/123456/download-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('No submissions to download');
    });

    it('should return 404 for invalid session', async () => {
      const token = generateTeacherToken();
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await request(app)
        .get('/api/submissions/123456/download-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session not found');
    });

    it('should stream a ZIP archive with correct headers', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub1',
          originalName: 'alice.txt',
          storedName: testFileName,
          mimeType: 'text/plain',
          sizeBytes: 30,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S001', name: 'Alice' } },
        },
        {
          id: 'sub2',
          originalName: 'bob.txt',
          storedName: secondFileName,
          mimeType: 'text/plain',
          sizeBytes: 19,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S002', name: 'Bob' } },
        },
      ]);

      const res = await request(app)
        .get('/api/submissions/123456/download-all')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toMatch(/submissions_.*\.zip/);

      // ZIP files start with the local file header signature "PK\x03\x04"
      const body = res.body as Buffer;
      expect(body.length).toBeGreaterThan(0);
      expect(body.slice(0, 2).toString()).toBe('PK');
    });

    it('should skip submissions whose files are missing on disk', async () => {
      const token = generateTeacherToken();
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub1',
          originalName: 'alice.txt',
          storedName: testFileName,
          mimeType: 'text/plain',
          sizeBytes: 30,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S001', name: 'Alice' } },
        },
        {
          id: 'sub-missing',
          originalName: 'ghost.txt',
          storedName: 'does-not-exist-on-disk.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S099', name: 'Ghost' } },
        },
      ]);

      const res = await request(app)
        .get('/api/submissions/123456/download-all')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      // Should still succeed with a valid ZIP (containing only the existing file)
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
    });

    it('should dedupe entry names when two submissions share studentId + originalName', async () => {
      // This scenario is rare under the new unique constraint, but the route
      // still defends against duplicate ZIP entry names with a counter suffix.
      const token = generateTeacherToken();
      (prisma.submission.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'sub1',
          originalName: 'answer.txt',
          storedName: testFileName,
          mimeType: 'text/plain',
          sizeBytes: 30,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S001', name: 'Alice' } },
        },
        {
          id: 'sub2',
          originalName: 'answer.txt',
          storedName: secondFileName,
          mimeType: 'text/plain',
          sizeBytes: 19,
          createdAt: new Date(),
          sessionStudent: { student: { studentId: 'S001', name: 'Alice' } },
        },
      ]);

      const res = await request(app)
        .get('/api/submissions/123456/download-all')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      const body = res.body as Buffer;
      expect(body.slice(0, 2).toString()).toBe('PK');
      // Both entry names should appear in the zip directory
      const asString = body.toString('binary');
      expect(asString).toContain('S001_answer.txt');
      expect(asString).toContain('S001_answer_1.txt');
    });
  });
});
