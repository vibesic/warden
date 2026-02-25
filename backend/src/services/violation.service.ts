import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

interface CreateViolationParams {
  sessionStudentId: string;
  type: string;
  details?: string;
}

export const createViolation = async (params: CreateViolationParams) => {
  const { sessionStudentId, type, details } = params;

  logger.warn({ sessionStudentId, type, details }, 'Violation created');

  return prisma.violation.create({
    data: {
      sessionStudentId,
      type,
      details,
    },
  });
};

export const getRandomCheckTarget = async (): Promise<string | null> => {
  const count = await prisma.checkTarget.count({ where: { isEnabled: true } });
  if (count === 0) return null;
  const skip = Math.floor(Math.random() * count);
  const target = await prisma.checkTarget.findFirst({
    where: { isEnabled: true },
    skip,
  });
  return target?.url ?? null;
};
