/**
 * Shared gateway helper utilities.
 *
 * Eliminates duplicated patterns across studentHandlers.ts,
 * teacherHandlers.ts, and backgroundJobs.ts:
 *   - Violation creation + teacher broadcast (was repeated 5 times)
 *   - Socket student-data extraction (was repeated 3 times)
 *   - Teacher auth guard (was repeated 4 times)
 */
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { createViolation } from '../services/violation.service';
import { verifyTeacherToken } from '../services/auth.service';
import type { ViolationType } from '../types/schemas';

/** Data stored on a student socket after registration. */
export interface SocketStudentData {
  sessionStudentId: string;
  sessionCode: string;
  studentId: string;
}

/**
 * Extract the student identifiers from `socket.data`.
 * Returns `null` if the socket is not yet fully registered.
 */
export const getSocketStudentData = (socket: Socket): SocketStudentData | null => {
  const { sessionStudentId, sessionCode, studentId } = socket.data as Record<string, unknown>;
  if (
    typeof sessionStudentId !== 'string' ||
    typeof sessionCode !== 'string' ||
    typeof studentId !== 'string'
  ) {
    return null;
  }
  return { sessionStudentId, sessionCode, studentId };
};

/**
 * Create a violation in the database and broadcast it to the teacher
 * dashboard room.  This pattern was duplicated 5 times in the old code.
 */
export const createAndBroadcastViolation = async (
  io: Server,
  sessionCode: string,
  studentId: string,
  params: { sessionStudentId: string; type: ViolationType; details?: string },
): Promise<void> => {
  const violation = await createViolation(params);

  io.to(`teacher:session:${sessionCode}`).emit('dashboard:alert', {
    studentId,
    violation: {
      ...violation,
      timestamp: violation.timestamp.toISOString(),
    },
  });
};

/**
 * Emit a STUDENT_LEFT update to the teacher dashboard room.
 */
export const broadcastStudentLeft = (
  io: Server,
  sessionCode: string,
  studentId: string,
): void => {
  io.to(`teacher:session:${sessionCode}`).emit('dashboard:update', {
    type: 'STUDENT_LEFT',
    studentId,
  });
};

/**
 * Check whether a socket carries a valid teacher token.
 */
export const isTeacherAuthenticated = (socket: Socket): boolean => {
  const token = socket.handshake.auth?.token;
  return typeof token === 'string' && verifyTeacherToken(token);
};

/**
 * Emit a standardised unauthorised error to a teacher socket.
 */
export const emitUnauthorized = (socket: Socket): void => {
  logger.warn({ socketId: socket.id }, 'Unauthorized teacher socket request');
  socket.emit('dashboard:error', {
    message: 'Unauthorized: invalid or missing teacher token',
  });
};
