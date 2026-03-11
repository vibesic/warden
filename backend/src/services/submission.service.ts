import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import type { Submission } from '@prisma/client';

interface CreateSubmissionParams {
  sessionStudentId: string;
  sessionId: string;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
}

export const createSubmission = async (params: CreateSubmissionParams): Promise<Submission> => {
  const { sessionStudentId, sessionId, originalName, storedName, mimeType, sizeBytes } = params;

  logger.info({ sessionStudentId, originalName, sizeBytes }, 'File submission created');

  return prisma.submission.create({
    data: {
      sessionStudentId,
      sessionId,
      originalName,
      storedName,
      mimeType,
      sizeBytes,
    },
  });
};

export const getSubmissionsForSession = async (sessionId: string): Promise<Array<Submission & { sessionStudent: { student: { studentId: string; name: string } } }>> => {
  return prisma.submission.findMany({
    where: { sessionId },
    include: {
      sessionStudent: {
        include: {
          student: {
            select: { studentId: true, name: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getSubmissionsForStudent = async (sessionStudentId: string, sessionId: string): Promise<Submission[]> => {
  return prisma.submission.findMany({
    where: {
      sessionStudentId,
      sessionId,
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Find a submission by its stored filename within a session.
 * Used by the download route to verify file ownership.
 */
export const findSubmissionByStoredName = async (
  storedName: string,
  sessionId: string,
): Promise<Submission | null> => {
  return prisma.submission.findFirst({
    where: { storedName, sessionId },
  });
};
