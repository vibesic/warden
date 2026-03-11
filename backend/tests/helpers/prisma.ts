/**
 * Shared Prisma mock factory.
 *
 * Creates a comprehensive mock of the Prisma client with all models
 * and methods used across the test suite. Each test file can import
 * and use this instead of duplicating the same vi.hoisted() block.
 *
 * Usage (in a test file):
 *   import { createPrismaMock } from '../../helpers/prisma';
 *   const prismaMock = vi.hoisted(() => createPrismaMock());
 *   vi.mock('@src/utils/prisma', () => ({ prisma: prismaMock }));
 */
import { vi } from 'vitest';

export interface PrismaMock {
  student: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  sessionStudent: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  violation: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  checkTarget: {
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  submission: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
}

/**
 * Create a full Prisma mock with all models and methods.
 * All methods are vi.fn() by default — override with mockResolvedValue
 * in individual tests as needed.
 */
export const createPrismaMock = (): PrismaMock => ({
  student: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  violation: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  submission: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $queryRaw: vi.fn(),
});
