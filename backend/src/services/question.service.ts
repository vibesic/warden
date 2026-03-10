import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import type { QuestionFile } from '@prisma/client';

interface CreateQuestionFileParams {
  sessionId: string;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
}

export const createQuestionFile = async (params: CreateQuestionFileParams): Promise<QuestionFile> => {
  const { sessionId, originalName, storedName, mimeType, sizeBytes } = params;

  logger.info({ sessionId, originalName, sizeBytes }, 'Question file uploaded');

  return prisma.questionFile.create({
    data: {
      sessionId,
      originalName,
      storedName,
      mimeType,
      sizeBytes,
    },
  });
};

export const getQuestionFilesForSession = async (sessionId: string): Promise<QuestionFile[]> => {
  return prisma.questionFile.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
};

export const getQuestionFileById = async (id: string): Promise<QuestionFile | null> => {
  return prisma.questionFile.findUnique({
    where: { id },
  });
};

export const deleteQuestionFile = async (id: string): Promise<QuestionFile> => {
  return prisma.questionFile.delete({
    where: { id },
  });
};
