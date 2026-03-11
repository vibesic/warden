/**
 * Unit tests for session validation middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireActiveSession, requireSession } from '@src/middleware/sessionMiddleware';

vi.mock('@src/utils/prisma', () => ({
  prisma: {},
}));

const mockGetSessionByCode = vi.fn();

vi.mock('@src/services/session.service', () => ({
  getSessionByCode: (...args: unknown[]) => mockGetSessionByCode(...args),
}));

const createMockReqRes = (params: Record<string, string> = {}) => {
  const req = { params } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    locals: {},
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
};

describe('sessionMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireActiveSession', () => {
    it('should return 400 when param is missing', async () => {
      const { req, res, next } = createMockReqRes({});
      await requireActiveSession('code')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Session code is required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 when session not found', async () => {
      mockGetSessionByCode.mockResolvedValue(null);
      const { req, res, next } = createMockReqRes({ code: '999999' });
      await requireActiveSession()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Session not found',
      });
    });

    it('should return 400 when session is inactive', async () => {
      mockGetSessionByCode.mockResolvedValue({ id: 's1', isActive: false });
      const { req, res, next } = createMockReqRes({ code: '123456' });
      await requireActiveSession()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Session is no longer active',
      });
    });

    it('should call next and set res.locals.session for active session', async () => {
      const session = { id: 's1', code: '123456', isActive: true };
      mockGetSessionByCode.mockResolvedValue(session);
      const { req, res, next } = createMockReqRes({ code: '123456' });
      await requireActiveSession()(req, res, next);

      expect(res.locals.session).toEqual(session);
      expect(next).toHaveBeenCalledWith();
    });

    it('should use custom param name', async () => {
      mockGetSessionByCode.mockResolvedValue(null);
      const { req, res, next } = createMockReqRes({ sessionCode: 'ABC123' });
      await requireActiveSession('sessionCode')(req, res, next);

      expect(mockGetSessionByCode).toHaveBeenCalledWith('ABC123');
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should pass DB errors to next()', async () => {
      const dbError = new Error('DB connection error');
      mockGetSessionByCode.mockRejectedValue(dbError);
      const { req, res, next } = createMockReqRes({ code: '123456' });
      await requireActiveSession()(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  describe('requireSession', () => {
    it('should return 400 when param is missing', async () => {
      const { req, res, next } = createMockReqRes({});
      await requireSession('code')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Session code is required',
      });
    });

    it('should return 404 when session not found', async () => {
      mockGetSessionByCode.mockResolvedValue(null);
      const { req, res, next } = createMockReqRes({ code: '999999' });
      await requireSession()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should call next for inactive session (requireSession allows it)', async () => {
      const session = { id: 's1', code: '123456', isActive: false };
      mockGetSessionByCode.mockResolvedValue(session);
      const { req, res, next } = createMockReqRes({ code: '123456' });
      await requireSession()(req, res, next);

      expect(res.locals.session).toEqual(session);
      expect(next).toHaveBeenCalledWith();
    });

    it('should pass DB errors to next()', async () => {
      const dbError = new Error('DB error');
      mockGetSessionByCode.mockRejectedValue(dbError);
      const { req, res, next } = createMockReqRes({ code: '123456' });
      await requireSession()(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
