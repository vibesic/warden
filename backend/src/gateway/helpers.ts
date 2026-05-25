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
import { createViolation, getLatestDisconnectionTime } from '../services/violation.service';
import { verifyTeacherToken } from '../services/auth.service';
import { getSessionByCode } from '../services/session.service';
import { validateData } from '../utils/validation';
import { checkSocketRateLimit } from './socketRateLimiter';
import { DISCONNECTION_COOLDOWN_MS } from './constants';
import { roomNames } from './roomNames';
import type { ZodSchema } from 'zod';
import type { ViolationType, ViolationReason } from '../types/schemas';

/**
 * Cooldown period (ms) for DISCONNECTION violations per student.
 * Prevents the heartbeat checker and socket-disconnect handler from
 * spamming DISCONNECTION events when WiFi flaps repeatedly.
 * Imported from gateway/constants.ts.
 */

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
 *
 * Falls back to the database when the in-memory map has no entry
 * (e.g. after a server restart) to prevent duplicate violation spam.
 */
export const isDisconnectionOnCooldown = async (sessionStudentId: string): Promise<boolean> => {
  const now = Date.now();
  const last = lastDisconnectionTime.get(sessionStudentId);
  if (last && now - last < DISCONNECTION_COOLDOWN_MS) {
    return true;
  }

  // Fallback: check DB for server restart resilience (#6)
  if (!last) {
    const dbTime = await getLatestDisconnectionTime(sessionStudentId);
    if (dbTime && now - dbTime.getTime() < DISCONNECTION_COOLDOWN_MS) {
      lastDisconnectionTime.set(sessionStudentId, dbTime.getTime());
      return true;
    }
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
  params: { sessionStudentId: string; type: ViolationType; reason?: ViolationReason; details?: string },
): Promise<void> => {
  // Rate-limit DISCONNECTION violations to avoid flooding the teacher
  // dashboard when a student's WiFi flaps repeatedly.
  if (params.type === 'DISCONNECTION') {
    if (await isDisconnectionOnCooldown(params.sessionStudentId)) {
      logger.info(
        { studentId, type: params.type },
        'DISCONNECTION violation suppressed — cooldown active',
      );
      return;
    }
  }

  const violation = await createViolation(params);

  io.to(roomNames.teacherSession(sessionCode)).emit('dashboard:alert', {
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
  io.to(roomNames.teacherSession(sessionCode)).emit('dashboard:update', {
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
export interface DisconnectInfo {
  reason: ViolationReason;
  details: string;
}

export const resolveDisconnectReason = (
  socketReason: string,
  tabClosing: boolean,
): DisconnectInfo => {
  if (tabClosing) {
    return {
      reason: 'TAB_CLOSED',
      details: 'Student closed the browser tab or window',
    };
  }

  switch (socketReason) {
    case 'transport close':
    case 'transport error':
      return {
        reason: 'NETWORK_LOST',
        details: 'Network connectivity lost (WiFi drop or transport failure)',
      };
    case 'ping timeout':
      return {
        reason: 'PING_TIMEOUT',
        details: 'Socket connection timed out (no response from client)',
      };
    case 'client namespace disconnect':
      return {
        reason: 'CLIENT_INITIATED',
        details: 'Student\'s client disconnected explicitly',
      };
    case 'server namespace disconnect':
      return {
        reason: 'SERVER_INITIATED',
        details: 'Server forced the disconnection',
      };
    default:
      return {
        reason: 'CLIENT_INITIATED',
        details: `Student disconnected (reason: ${socketReason})`,
      };
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

/**
 * Options for {@link withStudentEvent}.
 */
interface StudentEventOptions<TSchema> {
  /** Rate-limit bucket key (matches the socket event name by convention). */
  event: string;
  /** Optional Zod schema to validate the event payload. */
  schema?: ZodSchema<TSchema>;
  /** Human-readable label used when validation fails. */
  invalidDataLabel?: string;
  /**
   * If true (default), verify that the student's session is still active
   * before invoking the handler. Disable for events that should fire
   * regardless of session state (e.g. tab-close signals).
   */
  requireActiveSession?: boolean;
}

interface StudentEventContext<T> {
  socket: Socket;
  data: T;
  studentData: SocketStudentData;
}

/**
 * Wrap a student socket event handler with the standard guard chain:
 * rate limit → payload validation → student data lookup → session check.
 *
 * Bails out silently if any guard fails. Errors thrown by the handler are
 * caught and logged so a single bad event cannot tear down the socket.
 *
 * Usage:
 *   socket.on('heartbeat', withStudentEvent(socket, { event: 'heartbeat' },
 *     async ({ studentData }) => { ... }));
 */
export const withStudentEvent = <T = void>(
  socket: Socket,
  options: StudentEventOptions<T>,
  handler: (ctx: StudentEventContext<T>) => Promise<void>,
) => async (rawData?: unknown): Promise<void> => {
  if (!checkSocketRateLimit(socket, options.event)) return;
  try {
    let payload: T = undefined as T;
    if (options.schema) {
      const validated = validateData(
        options.schema,
        rawData,
        options.invalidDataLabel ?? `Invalid ${options.event} data`,
      );
      if (!validated) return;
      payload = validated;
    }

    const studentData = getSocketStudentData(socket);
    if (!studentData) return;

    if (options.requireActiveSession !== false) {
      const session = await getSessionByCode(studentData.sessionCode);
      if (!session?.isActive) return;
    }

    await handler({ socket, data: payload, studentData });
  } catch (error) {
    logger.error({ error, event: options.event }, 'Student socket handler error');
  }
};
