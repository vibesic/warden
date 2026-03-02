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

/**
 * Cooldown period (ms) for DISCONNECTION violations per student.
 * Prevents the heartbeat checker and socket-disconnect handler from
 * spamming DISCONNECTION events when WiFi flaps repeatedly.
 */
const DISCONNECTION_COOLDOWN_MS = 300_000; // 5 minutes

/**
 * Tracks the last DISCONNECTION violation timestamp per sessionStudentId.
 * This prevents duplicate DISCONNECTION violations from both the heartbeat
 * checker and the socket disconnect handler within the cooldown window.
 */
const lastDisconnectionTime = new Map<string, number>();

/**
 * Check whether a DISCONNECTION violation was recently recorded for a
 * student, and if not, update the timestamp.
 * Returns `true` when the violation should be **suppressed**.
 */
export const isDisconnectionOnCooldown = (sessionStudentId: string): boolean => {
  const now = Date.now();
  const last = lastDisconnectionTime.get(sessionStudentId);
  if (last && now - last < DISCONNECTION_COOLDOWN_MS) {
    return true;
  }
  lastDisconnectionTime.set(sessionStudentId, now);
  return false;
};

/** Clear all cooldown entries. Intended for test teardown. */
export const clearDisconnectionCooldowns = (): void => {
  lastDisconnectionTime.clear();
};

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
  // Rate-limit DISCONNECTION violations to avoid flooding the teacher
  // dashboard when a student's WiFi flaps repeatedly.
  if (params.type === 'DISCONNECTION') {
    if (isDisconnectionOnCooldown(params.sessionStudentId)) {
      logger.info(
        { studentId, type: params.type },
        'DISCONNECTION violation suppressed — cooldown active',
      );
      return;
    }
  }

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
 * Determine a human-readable disconnect reason from the Socket.io
 * disconnect reason string and the `tabClosing` flag (set when the
 * client emits `student:tab-closing` via the beforeunload handler).
 *
 * Socket.io reason values:
 *   - "client namespace disconnect"   → client called socket.disconnect()
 *   - "transport close"               → underlying transport was closed (WiFi drop)
 *   - "transport error"               → transport encountered an error
 *   - "ping timeout"                  → server did not receive a pong in time
 *   - "server namespace disconnect"   → server forced disconnection
 */
export const resolveDisconnectReason = (
  socketReason: string,
  tabClosing: boolean,
): string => {
  if (tabClosing) {
    return 'Student closed the browser tab or window (intentional)';
  }

  switch (socketReason) {
    case 'transport close':
      return 'Student lost network connection (WiFi drop or network change)';
    case 'transport error':
      return 'Student connection failed due to a network error';
    case 'ping timeout':
      return 'Student connection timed out (no response from client)';
    case 'client namespace disconnect':
      return 'Student disconnected from client side';
    case 'server namespace disconnect':
      return 'Student was disconnected by the server';
    default:
      return `Student disconnected (reason: ${socketReason})`;
  }
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
