import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createViolation } from '../services/violation.service';
import prisma from '../utils/prisma';

vi.mock('../utils/prisma', () => ({
  default: {
    violation: {
      create: vi.fn(),
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
        studentId: 'uuid-1',
        type: 'INTERNET_ACCESS',
        details: 'Google reached',
        timestamp: new Date(),
      };
      (prisma.violation.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockViolation);

      const result = await createViolation({
        studentUuid: 'uuid-1',
        type: 'INTERNET_ACCESS',
        details: 'Google reached',
      });

      expect(prisma.violation.create).toHaveBeenCalledWith({
        data: {
          studentId: 'uuid-1',
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
        studentUuid: 'uuid-2',
        type: 'DISCONNECTION',
      });

      expect(prisma.violation.create).toHaveBeenCalledWith({
        data: {
          studentId: 'uuid-2',
          type: 'DISCONNECTION',
          details: undefined,
        },
      });
    });
  });
});
