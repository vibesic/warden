import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { validateSession, getSessionByCode } from '../services/session.service';
import { registerStudent, updateHeartbeat, markStudentOffline } from '../services/student.service';
import { RegisterSchema, ViolationSchema, SnifferResponseSchema } from '../types/schemas';
import {
  getSocketStudentData,
  createAndBroadcastViolation,
  broadcastStudentLeft,
} from './helpers';
import { createViolation } from '../services/violation.service';

/**
 * Grace period (ms) before a disconnect is recorded as a violation.
 * Allows students to refresh the page without triggering a false
 * DISCONNECTION violation. If the same studentId re-registers within
 * this window the pending violation is cancelled.
 */
let disconnectGraceMs = 5_000;

/**
 * Override the grace period duration. Intended for tests so they do not
 * have to wait the full 5 s.
 */
export const setDisconnectGraceMs = (ms: number): void => {
  disconnectGraceMs = ms;
};

/** Pending disconnect timers keyed by studentId. */
const pendingDisconnects = new Map<string, NodeJS.Timeout>();

/**
 * Cancel a pending disconnect violation for a student.
 * Called when the student re-registers within the grace window.
 */
export const cancelPendingDisconnect = (studentId: string): boolean => {
  const timer = pendingDisconnects.get(studentId);
  if (timer) {
    clearTimeout(timer);
    pendingDisconnects.delete(studentId);
    logger.info({ studentId }, 'Reconnected within grace period — disconnect violation cancelled');
    return true;
  }
  return false;
};

/**
 * Cancel ALL pending disconnect timers.
 * Intended for test teardown.
 */
export const clearAllPendingDisconnects = (): void => {
  for (const timer of pendingDisconnects.values()) {
    clearTimeout(timer);
  }
  pendingDisconnects.clear();
};

export const registerStudentHandlers = (io: Server, socket: Socket): void => {
  socket.on('register', async (data: unknown) => {
    try {
      const result = RegisterSchema.safeParse(data);
      if (!result.success) {
        logger.error({ error: result.error.issues }, 'Invalid register data');
        socket.emit('registration_error', 'Invalid data format');
        return;
      }
      const { studentId, sessionCode } = result.data;
      const name = result.data.name.trim();

      // Cancel any pending disconnect violation from a previous socket
      cancelPendingDisconnect(studentId);

      const sessionCheck = await validateSession(sessionCode);
      if (!sessionCheck.valid || !sessionCheck.session) {
        socket.emit('registration_error', sessionCheck.reason);
        return;
      }

      const sessionStudent = await registerStudent({
        studentId,
        sessionId: sessionCheck.session.id,
        name,
        ipAddress: socket.handshake.address,
      });

      socket.data.sessionStudentId = sessionStudent.id;
      socket.data.studentId = studentId;
      socket.data.sessionCode = sessionCode;

      socket.join(`session:${sessionCode}`);
      socket.join(`student:session:${sessionCode}`);

      logger.info({ studentId, name, sessionCode }, 'Student registered');

      io.to(`teacher:session:${sessionCode}`).emit('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId,
        name,
        isOnline: true,
      });

      socket.emit('registered', {
        studentId,
        session: {
          createdAt: sessionCheck.session.createdAt.toISOString(),
          durationMinutes: sessionCheck.session.durationMinutes ?? null,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Registration error');
      socket.emit('registration_error', 'Internal server error');
    }
  });

  socket.on('heartbeat', async () => {
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) return;

      const session = await getSessionByCode(studentData.sessionCode);
      if (!session?.isActive) return;

      await updateHeartbeat(studentData.sessionStudentId);
    } catch (error) {
      logger.error({ error, sessionStudentId: socket.data.sessionStudentId }, 'Heartbeat update error');
    }
  });

  socket.on('report_violation', async (data: unknown) => {
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) {
        logger.warn('Violation reported but socket not fully registered');
        return;
      }

      const session = await getSessionByCode(studentData.sessionCode);
      if (!session?.isActive) return;

      const result = ViolationSchema.safeParse(data);
      if (!result.success) {
        logger.warn({ error: result.error.issues }, 'Invalid violation data');
        return;
      }

      logger.warn({ studentId: studentData.studentId, type: result.data.type }, 'VIOLATION DETECTED');

      await createAndBroadcastViolation(io, studentData.sessionCode, studentData.studentId, {
        sessionStudentId: studentData.sessionStudentId,
        type: result.data.type,
        details: result.data.details,
      });
    } catch (error) {
      logger.error({ error }, 'Violation report error');
    }
  });

  socket.on('sniffer:response', async (data: unknown) => {
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) return;

      const result = SnifferResponseSchema.safeParse(data);
      if (!result.success) return;

      const { challengeId, reachable } = result.data;

      const pending = socket.data.pendingChallenge;
      if (!pending || pending.challengeId !== challengeId) return;

      delete socket.data.pendingChallenge;

      // Reset timeout counter on any valid response
      socket.data.snifferTimeoutCount = 0;

      if (reachable) {
        const violation = await createViolation({
          sessionStudentId: studentData.sessionStudentId,
          type: 'INTERNET_ACCESS',
          details: `Server-side sniffer challenge confirmed: student reached ${pending.targetUrl}`,
        });

        io.to(`teacher:session:${studentData.sessionCode}`).emit('dashboard:alert', {
          studentId: studentData.studentId,
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString(),
          },
        });

        // Push violation to student — forces their UI into violation state
        socket.emit('violation:detected', { type: 'INTERNET_ACCESS' });
      }
    } catch (error) {
      logger.error({ error }, 'Sniffer response error');
    }
  });

  socket.on('disconnect', async () => {
    const studentData = getSocketStudentData(socket);
    if (!studentData) return;

    logger.info({ studentId: studentData.studentId }, 'Student disconnected');
    await markStudentOffline(studentData.sessionStudentId);

    // Only record a DISCONNECTION violation if the session is still active
    const session = await getSessionByCode(studentData.sessionCode);
    if (!session?.isActive) return;

    broadcastStudentLeft(io, studentData.sessionCode, studentData.studentId);

    // Delay the violation to allow page-refresh reconnects within the grace period
    const timer = setTimeout(async () => {
      pendingDisconnects.delete(studentData.studentId);

      // Re-check session — it may have ended during the grace window
      const currentSession = await getSessionByCode(studentData.sessionCode);
      if (!currentSession?.isActive) return;

      await createAndBroadcastViolation(io, studentData.sessionCode, studentData.studentId, {
        sessionStudentId: studentData.sessionStudentId,
        type: 'DISCONNECTION',
        details: 'Student disconnected from server (closed tab or lost connection)',
      });
    }, disconnectGraceMs);

    pendingDisconnects.set(studentData.studentId, timer);
  });
};
