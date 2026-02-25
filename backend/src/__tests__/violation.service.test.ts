import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createViolation, getRandomCheckTarget } from '../services/violation.service';
import { prisma } from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  prisma: {
    violation: {
      create: vi.fn(),
    },
    checkTarget: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe('Violation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createViolation', () => {
    it('should create a violation record', async () => {
      const mockViolation = {
        id: 'v1',
        sessionStudentId: 'ss-1',
        type: 'INTERNET_ACCESS',
        details: 'Google reached',
        timestamp: new Date(),
      };
      (prisma.violation.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockViolation);

      const result = await createViolation({
        sessionStudentId: 'ss-1',
        type: 'INTERNET_ACCESS',
        details: 'Google reached',
      });

      expect(prisma.violation.create).toHaveBeenCalledWith({
        data: {
          sessionStudentId: 'ss-1',
          type: 'INTERNET_ACCESS',
          details: 'Google reached',
        },
      });
      expect(result).toEqual(mockViolation);
    });

    it('should create a violation without details', async () => {
      (prisma.violation.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'v2',
        timestamp: new Date(),
      });

      await createViolation({
        sessionStudentId: 'ss-2',
        type: 'DISCONNECTION',
      });

      expect(prisma.violation.create).toHaveBeenCalledWith({
        data: {
          sessionStudentId: 'ss-2',
          type: 'DISCONNECTION',
          details: undefined,
        },
      });
    });
  });

  describe('getRandomCheckTarget', () => {
    it('should return null when no enabled targets exist', async () => {
      (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await getRandomCheckTarget();

      expect(result).toBeNull();
      expect(prisma.checkTarget.findFirst).not.toHaveBeenCalled();
    });

    it('should return a random target URL when targets exist', async () => {
      (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      (prisma.checkTarget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        url: 'https://www.google.com',
        isEnabled: true,
      });

      const result = await getRandomCheckTarget();

      expect(result).toBe('https://www.google.com');
      expect(prisma.checkTarget.count).toHaveBeenCalledWith({ where: { isEnabled: true } });
      expect(prisma.checkTarget.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isEnabled: true },
          skip: expect.any(Number),
        })
      );
    });

    it('should return null when findFirst returns null', async () => {
      (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (prisma.checkTarget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getRandomCheckTarget();

      expect(result).toBeNull();
    });

    it('should use a skip value less than count', async () => {
      (prisma.checkTarget.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);
      (prisma.checkTarget.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        url: 'https://www.example.com',
      });

      await getRandomCheckTarget();

      const call = (prisma.checkTarget.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.skip).toBeGreaterThanOrEqual(0);
      expect(call.skip).toBeLessThan(10);
    });
  });
});
