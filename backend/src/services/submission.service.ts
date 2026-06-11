import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { deleteUploadedFile } from '../utils/fileHelpers';
import type { Submission } from '@prisma/client';

interface CreateSubmissionParams {
  sessionStudentId: string;
  sessionId: string;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
}

export interface CreateSubmissionResult {
  submission: Submission;
  replaced: {
    count: number;
    previousCreatedAt: string | null;
  };
}

const MAX_OVERWRITE_RETRIES = 2;

/**
 * Create a submission for a student in a session.
 *
 * Submissions are unique per (sessionStudentId, sessionId): if the student
 * already has a submission for this session, the previous record and its
 * on-disk file are removed and replaced with the new one. Concurrent uploads
 * from the same student that race past the in-transaction lookup are handled
 * by retrying on Prisma unique-constraint violations (P2002).
 */
export const createSubmission = async (params: CreateSubmissionParams): Promise<CreateSubmissionResult> => {
  const { sessionStudentId, sessionId, originalName, storedName, mimeType, sizeBytes } = params;
  const safeOriginalName = path.basename(originalName);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { submission, replacedStoredNames, previousCreatedAt } = await prisma.$transaction(async (tx) => {
        const previous = await tx.submission.findMany({
          where: { sessionStudentId, sessionId },
          select: { id: true, storedName: true, createdAt: true },
        });

        if (previous.length > 0) {
          await tx.submission.deleteMany({
            where: { id: { in: previous.map((p) => p.id) } },
          });
        }

        const created = await tx.submission.create({
          data: {
            sessionStudentId,
            sessionId,
            originalName: safeOriginalName,
            storedName,
            mimeType,
            sizeBytes,
          },
        });

        const latestPrevious = previous.reduce<Date | null>(
          (acc, p) => (!acc || p.createdAt > acc ? p.createdAt : acc),
          null,
        );

        return {
          submission: created,
          replacedStoredNames: previous.map((p) => p.storedName),
          previousCreatedAt: latestPrevious,
        };
      });

      // Remove old files from disk only after the DB transaction succeeds.
      for (const oldStoredName of replacedStoredNames) {
        if (oldStoredName === storedName) continue;
        try {
          deleteUploadedFile(oldStoredName);
        } catch (err) {
          logger.warn({ err, storedName: oldStoredName }, 'Failed to delete replaced submission file');
        }
      }

      logger.info(
        { sessionStudentId, originalName: safeOriginalName, sizeBytes, replaced: replacedStoredNames.length, attempt },
        'File submission created',
      );

      return {
        submission,
        replaced: {
          count: replacedStoredNames.length,
          previousCreatedAt: previousCreatedAt ? previousCreatedAt.toISOString() : null,
        },
      };
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueViolation && attempt < MAX_OVERWRITE_RETRIES) {
        attempt += 1;
        logger.warn(
          { sessionStudentId, sessionId, attempt },
          'Concurrent submission overwrite detected; retrying transaction',
        );
        continue;
      }
      throw err;
    }
  }
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
): Promise<(Submission & { sessionStudent: { student: { studentId: string; name: string } } }) | null> => {
  return prisma.submission.findFirst({
    where: { storedName, sessionId },
    include: {
      sessionStudent: {
        include: {
          student: true,
        },
      },
    },
  });
};
