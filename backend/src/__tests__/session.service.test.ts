import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession, endSession, getActiveSession, validateSession, getSessionHistory, getSessionByCode } from '../services/session.service';
import prisma from '../utils/prisma';

// Mock prisma
vi.mock('../utils/prisma', () => ({
  default: {
    session: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    }
  }
}));

describe('Session Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should deactivate active sessions and create a new one', async () => {
      (prisma.session.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma.session.findUnique as any).mockResolvedValue(null); // Code is unique
      (prisma.session.create as any).mockResolvedValue({
        id: 'new-session',
        code: '123456',
        isActive: true
      });

      const session = await createSession();

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: expect.objectContaining({ isActive: false })
      });

      expect(prisma.session.create).toHaveBeenCalled();
      expect(session).toEqual(expect.objectContaining({
        id: 'new-session',
        code: '123456'
      }));
    });

    it('should retry code generation if collision occurs', async () => {
      (prisma.session.updateMany as any).mockResolvedValue({ count: 0 });
      // First call returns existing session, second returns null
      (prisma.session.findUnique as any)
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);

      (prisma.session.create as any).mockResolvedValue({
        id: 'new-session',
        code: '654321',
        isActive: true
      });

      await createSession();

      expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveSession', () => {
    it('should return active session if exists', async () => {
      (prisma.session.findFirst as any).mockResolvedValue({ id: 'active' });
      const session = await getActiveSession();
      expect(session).toEqual({ id: 'active' });
    });
  });

  describe('endSession', () => {
    it('should end active session if one exists', async () => {
      (prisma.session.findFirst as any).mockResolvedValue({ id: 'active' });
      (prisma.session.update as any).mockResolvedValue({ id: 'active', isActive: false });

      const result = await endSession();

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'active' },
        data: expect.objectContaining({ isActive: false })
      });
      expect(result?.isActive).toBe(false);
    });

    it('should return null if no active session', async () => {
      (prisma.session.findFirst as any).mockResolvedValue(null);
      const result = await endSession();
      expect(result).toBeNull();
      expect(prisma.session.update).not.toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    it('should return valid if session exists and is active', async () => {
      (prisma.session.findUnique as any).mockResolvedValue({ isActive: true, code: '123456' });
      const res = await validateSession('123456');
      expect(res.valid).toBe(true);
    });

    it('should return invalid if session does not exist', async () => {
      (prisma.session.findUnique as any).mockResolvedValue(null);
      const res = await validateSession('123456');
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('Invalid session code');
    });

    it('should return invalid if session is ended', async () => {
      (prisma.session.findUnique as any).mockResolvedValue({ isActive: false, code: '123456' });
      const res = await validateSession('123456');
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('Session has ended');
    });
  });

  describe('getSessionByCode', () => {
    it('should return session by code', async () => {
      (prisma.session.findUnique as any).mockResolvedValue({ isActive: true, code: '123456' });
      const res = await getSessionByCode('123456');
      expect(res).toBeDefined();
    });
  });

  describe('getSessionHistory', () => {
    it('should return session history', async () => {
      (prisma.session.findMany as any).mockResolvedValue([]);
      const res = await getSessionHistory();
      expect(res).toEqual([]);
      expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { createdAt: 'desc' }
      }));
    });
  });
});
