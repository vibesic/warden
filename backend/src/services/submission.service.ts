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

export const getSubmissionsForSession = async (sessionId: string) => {
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

export const getSubmissionsForStudent = async (sessionStudentId: string, sessionId: string) => {
  return prisma.submission.findMany({
    where: {
      sessionStudentId,
      sessionId,
    },
    orderBy: { createdAt: 'desc' },
  });
};
