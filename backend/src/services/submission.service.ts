import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

interface CreateSubmissionParams {
  studentUuid: string;
  sessionId: string;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
}

export const createSubmission = async (params: CreateSubmissionParams) => {
  const { studentUuid, sessionId, originalName, storedName, mimeType, sizeBytes } = params;

  logger.info({ studentUuid, originalName, sizeBytes }, 'File submission created');

  return prisma.submission.create({
    data: {
      studentId: studentUuid,
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
      student: {
        select: { studentId: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getSubmissionsForStudent = async (studentUuid: string, sessionId: string) => {
  return prisma.submission.findMany({
    where: {
      studentId: studentUuid,
      sessionId,
    },
    orderBy: { createdAt: 'desc' },
  });
};
