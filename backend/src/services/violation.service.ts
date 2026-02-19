import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

interface CreateViolationParams {
  studentUuid: string;
  type: string;
  details?: string;
}

export const createViolation = async (params: CreateViolationParams) => {
  const { studentUuid, type, details } = params;

  logger.warn({ studentUuid, type, details }, 'Violation created');

  return prisma.violation.create({
    data: {
      studentId: studentUuid,
      type,
      details,
    },
  });
};

export const getRandomCheckTarget = async (): Promise<string | null> => {
  const targets = await prisma.$queryRaw<Array<{ url: string }>>`
    SELECT url FROM "CheckTarget"
    WHERE "isEnabled" = true
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (targets.length === 0) return null;
  return targets[0].url;
};
