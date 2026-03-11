import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import type { ViolationType, ViolationReason } from '../types/schemas';
import type { Violation, CheckTarget } from '@prisma/client';

interface CreateViolationParams {
  sessionStudentId: string;
  type: ViolationType;
  reason?: ViolationReason;
  details?: string;
}

export const createViolation = async (params: CreateViolationParams): Promise<Violation> => {
  const { sessionStudentId, type, reason, details } = params;

  logger.warn({ sessionStudentId, type, reason, details }, 'Violation created');

  return prisma.violation.create({
    data: {
      sessionStudentId,
      type,
      reason,
      details,
    },
  });
};

/**
 * Query the most recent DISCONNECTION violation for a student.
 * Used by isDisconnectionOnCooldown as a DB fallback after server restart.
 */
export const getLatestDisconnectionTime = async (sessionStudentId: string): Promise<Date | null> => {
  const violation = await prisma.violation.findFirst({
    where: {
      sessionStudentId,
      type: 'DISCONNECTION',
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return violation?.timestamp ?? null;
};

export const getRandomCheckTarget = async (): Promise<string | null> => {
  const count = await prisma.checkTarget.count({ where: { isEnabled: true } });
  if (count === 0) return null;
  const skip = Math.floor(Math.random() * count);
  const target: CheckTarget | null = await prisma.checkTarget.findFirst({
    where: { isEnabled: true },
    skip,
  });
  return target?.url ?? null;
};

/**
 * Return all enabled check-target URLs.
 * Used by the /check-targets route to avoid direct Prisma access in routes.
 */
export const getEnabledCheckTargetUrls = async (): Promise<string[]> => {
  const targets = await prisma.checkTarget.findMany({
    where: { isEnabled: true },
    select: { url: true },
  });
  return targets.map((t) => t.url);
};
