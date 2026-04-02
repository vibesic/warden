/**
 * Shared Prisma mock factory and integration test helpers.
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
  $transaction: ReturnType<typeof vi.fn>;
}

/**
 * Create a full Prisma mock with all models and methods.
 * All methods are vi.fn() by default — override with mockResolvedValue
 * in individual tests as needed.
 */
export const createPrismaMock = (): PrismaMock => {
  const mock = {
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
  } as unknown as PrismaMock;

  mock.$transaction = vi.fn(async (callback) => {
    return callback(mock);
  });

  return mock;
};

/**
 * Default session object used across most integration tests.
 * Matches the shape returned by `getSessionByCode` / `validateSession`.
 */
export const DEFAULT_SESSION = {
  id: 's1',
  code: '123456',
  isActive: true,
  createdAt: new Date(),
  durationMinutes: null as number | null,
  endedAt: null as Date | null,
};

/**
 * Apply the common default mock values used by most gateway integration
 * tests. Call this in `beforeEach` after `vi.clearAllMocks()`.
 *
 * Sets up:
 *  - session.findUnique / findFirst → DEFAULT_SESSION (or override)
 *  - session.findMany → []
 *  - violation.create → default violation
 *  - sessionStudent.update → {}
 *  - sessionStudent.findMany → []
 */
export const applyDefaultMocks = (
  mock: PrismaMock,
  sessionOverrides?: Partial<typeof DEFAULT_SESSION>,
): void => {
  const session = { ...DEFAULT_SESSION, createdAt: new Date(), ...sessionOverrides };
  mock.session.findUnique.mockResolvedValue(session);
  mock.session.findFirst.mockResolvedValue(session);
  mock.session.findMany.mockResolvedValue([]);
  mock.violation.create.mockResolvedValue({
    id: 'v-default',
    timestamp: new Date(),
    type: 'DISCONNECTION',
    details: '',
    sessionStudentId: '',
  });
  mock.sessionStudent.update.mockResolvedValue({});
  mock.sessionStudent.findMany.mockResolvedValue([]);
};

export const getMockedViolationsByType = (mock: PrismaMock, type: string): any[] => {
  return mock.violation.create.mock.calls.filter(
    (args: any[]) => args[0]?.data?.type === type
  );
};

export const getMockedViolationsByReason = (mock: PrismaMock, reason: string): any[] => {
  return mock.violation.create.mock.calls.filter(
    (args: any[]) => args[0]?.data?.reason === reason
  );
};

/**
 * Set up Prisma mocks for a student registration flow.
 * Eliminates the repeated pattern of mocking student.upsert +
 * sessionStudent.upsert that appears in ~15 integration tests.
 */
export const mockStudentRegistration = (
  mock: PrismaMock,
  studentId: string,
  name: string,
  studentUUID: string = `stu-${studentId}`,
  sessionStudentUUID: string = `ss-${studentId}`,
): void => {
  mock.student.upsert.mockResolvedValue({
    id: studentUUID,
    studentId,
    name,
  });
  mock.sessionStudent.upsert.mockResolvedValue({
    id: sessionStudentUUID,
    student: { studentId, name },
  });
};
