import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createQuestionFile,
  getQuestionFilesForSession,
  getQuestionFileById,
  deleteQuestionFile,
} from '@src/services/question.service';
import { prisma } from '@src/utils/prisma';

vi.mock('@src/utils/prisma', () => ({
  prisma: {
    questionFile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  questionFile: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};
const mockCreate = mockPrisma.questionFile.create;
const mockFindMany = mockPrisma.questionFile.findMany;
const mockFindUnique = mockPrisma.questionFile.findUnique;
const mockDelete = mockPrisma.questionFile.delete;

describe('Question Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createQuestionFile', () => {
    it('should create a question file record', async () => {
      const mockFile = {
        id: 'qf-1',
        sessionId: 'sess-1',
        originalName: 'exam.pdf',
        storedName: 'q-123-abc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        createdAt: new Date(),
      };
      mockCreate.mockResolvedValue(mockFile);

      const result = await createQuestionFile({
        sessionId: 'sess-1',
        originalName: 'exam.pdf',
        storedName: 'q-123-abc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          sessionId: 'sess-1',
          originalName: 'exam.pdf',
          storedName: 'q-123-abc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4096,
        },
      });
      expect(result).toEqual(mockFile);
    });
  });

  describe('getQuestionFilesForSession', () => {
    it('should return question files ordered by createdAt asc', async () => {
      const mockFiles = [
        { id: 'qf-1', originalName: 'q1.pdf' },
        { id: 'qf-2', originalName: 'q2.pdf' },
      ];
      mockFindMany.mockResolvedValue(mockFiles);

      const result = await getQuestionFilesForSession('sess-1');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(mockFiles);
    });
  });

  describe('getQuestionFileById', () => {
    it('should return a question file by id', async () => {
      const mockFile = { id: 'qf-1', originalName: 'exam.pdf' };
      mockFindUnique.mockResolvedValue(mockFile);

      const result = await getQuestionFileById('qf-1');

      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'qf-1' } });
      expect(result).toEqual(mockFile);
    });

    it('should return null for non-existent id', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getQuestionFileById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteQuestionFile', () => {
    it('should delete a question file record', async () => {
      const mockFile = { id: 'qf-1', originalName: 'exam.pdf' };
      mockDelete.mockResolvedValue(mockFile);

      const result = await deleteQuestionFile('qf-1');

      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'qf-1' } });
      expect(result).toEqual(mockFile);
    });
  });
});
