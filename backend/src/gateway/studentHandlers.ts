import { validateData } from "../utils/validation";
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { validateSession, getSessionByCode } from '../services/session.service';
import { registerStudent, updateHeartbeat, markStudentOffline } from '../services/student.service';
import { RegisterSchema, ViolationSchema, SnifferResponseSchema } from '../types/schemas';
import {
  getSocketStudentData,
  createAndBroadcastViolation,
  broadcastStudentLeft,
  resolveDisconnectReason,
} from './helpers';
import { checkSocketRateLimit } from './socketRateLimiter';
import { createViolation } from '../services/violation.service';
import { parseDeviceInfo } from '../utils/device';
import { DISCONNECT_GRACE_MS, PENDING_DISCONNECT_SWEEP_INTERVAL_MS } from './constants';

/**
 * Grace period (ms) before a disconnect is recorded as a violation.
 * Allows students to refresh the page or recover from transient WiFi
 * drops without triggering a false DISCONNECTION violation.  If the
 * same studentId re-registers within this window the pending violation
 * is cancelled.  Set to 45 s to accommodate slow reconnections on
 * congested classroom networks.
 */
let disconnectGraceMs = DISCONNECT_GRACE_MS;

/**
 * Override the grace period duration. Intended for tests so they do not
 * have to wait the full 5 s.
 */
export const setDisconnectGraceMs = (ms: number): void => {
  disconnectGraceMs = ms;
};

interface PendingDisconnect {
  timer: NodeJS.Timeout;
  createdAt: number;
  cancelled: boolean;
}

/** Pending disconnect entries keyed by studentId. */
const pendingDisconnects = new Map<string, PendingDisconnect>();

let sweepInterval: NodeJS.Timeout | null = null;
const SWEEP_INTERVAL_MS = PENDING_DISCONNECT_SWEEP_INTERVAL_MS;

/**
 * Start a periodic sweep that removes stale pendingDisconnect entries.
 * Acts as a safety net if a setTimeout callback never fires.
 */
export const startPendingDisconnectSweep = (): void => {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    const now = Date.now();
    const maxAge = disconnectGraceMs * 2;
    for (const [studentId, entry] of pendingDisconnects) {
      if (now - entry.createdAt > maxAge) {
        entry.cancelled = true;
        clearTimeout(entry.timer);
        pendingDisconnects.delete(studentId);
        logger.warn({ studentId }, 'Stale pending disconnect entry swept');
      }
    }
  }, SWEEP_INTERVAL_MS);
};

/**
 * Stop the pending disconnect sweep.
 * Called during server shutdown and test teardown.
 */
export const stopPendingDisconnectSweep = (): void => {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
};

/**
 * Cancel a pending disconnect violation for a student.
 * Called when the student re-registers within the grace window.
 */
export const cancelPendingDisconnect = (studentId: string): boolean => {
  const entry = pendingDisconnects.get(studentId);
  if (entry && !entry.cancelled) {
    entry.cancelled = true;
    clearTimeout(entry.timer);
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
  for (const entry of pendingDisconnects.values()) {
    entry.cancelled = true;
    clearTimeout(entry.timer);
  }
  pendingDisconnects.clear();
};

/** Expose pending disconnect count for testing. */
export const getPendingDisconnectCount = (): number => pendingDisconnects.size;

export const registerStudentHandlers = (io: Server, socket: Socket): void => {
  socket.on('register', async (data: unknown) => {
    if (!checkSocketRateLimit(socket, 'register')) return;
    try {
      const validatedData = validateData(RegisterSchema, data, 'Invalid register data');
      if (!validatedData) {
        socket.emit('registration_error', 'Invalid data format');
        return;
      }
      const { studentId, sessionCode } = validatedData;
      const name = validatedData.name.trim();

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
        ...parseDeviceInfo(socket.handshake.headers['user-agent']),
      });

      socket.data.sessionStudentId = sessionStudent.id;
      socket.data.studentId = studentId;
      socket.data.sessionCode = sessionCode;

      socket.join(`session:${sessionCode}`);
      socket.join(`student:session:${sessionCode}`);
      socket.join(`sessionStudent:${sessionStudent.id}`);

      logger.info({ studentId, name, sessionCode }, 'Student registered');

      io.to(`teacher:session:${sessionCode}`).emit('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId,
        name,
        isOnline: true,
        deviceType: sessionStudent.deviceType,
        deviceOs: sessionStudent.deviceOs,
        deviceBrowser: sessionStudent.deviceBrowser,
      });

      socket.emit('registered', {
        studentId,
        session: {
          createdAt: sessionCheck.session.createdAt.toISOString(),
          durationMinutes: sessionCheck.session.durationMinutes ?? null,
        },
        serverTime: Date.now(),
      });
    } catch (error) {
      logger.error({ error }, 'Registration error');
      socket.emit('registration_error', 'Internal server error');
    }
  });

  socket.on('heartbeat', async () => {
    if (!checkSocketRateLimit(socket, 'heartbeat')) return;
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
    if (!checkSocketRateLimit(socket, 'report_violation')) return;
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) {
        logger.warn('Violation reported but socket not fully registered');
        return;
      }

      const session = await getSessionByCode(studentData.sessionCode);
      if (!session?.isActive) return;

      const validatedData = validateData(ViolationSchema, data, "Invalid violation data");
      if (!validatedData) return;

      logger.warn({ studentId: studentData.studentId, type: validatedData.type }, 'VIOLATION DETECTED');

      await createAndBroadcastViolation(io, studentData.sessionCode, studentData.studentId, {
        sessionStudentId: studentData.sessionStudentId,
        type: validatedData.type,
        reason: 'CLIENT_PROBE',
        details: validatedData.details,
      });
    } catch (error) {
      logger.error({ error }, 'Violation report error');
    }
  });

  socket.on('sniffer:response', async (data: unknown) => {
    if (!checkSocketRateLimit(socket, 'sniffer:response')) return;
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) return;

      const validatedData = validateData(SnifferResponseSchema, data, "Invalid sniffer data");
      if (!validatedData) return;

      const { challengeId, reachable } = validatedData;

      const pending = socket.data.pendingChallenge;
      if (!pending || pending.challengeId !== challengeId) return;

      delete socket.data.pendingChallenge;

      // Reset timeout counter on any valid response
      socket.data.snifferTimeoutCount = 0;

      if (reachable) {
        const violation = await createViolation({
          sessionStudentId: studentData.sessionStudentId,
          type: 'INTERNET_ACCESS',
          reason: 'SERVER_SNIFFER',
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

  // Student signals before closing tab/window.
  // This flag lets the disconnect handler distinguish intentional close
  // from a network drop.
  socket.on('student:tab-closing', () => {
    if (!checkSocketRateLimit(socket, 'student:tab-closing')) return;
    socket.data.tabClosing = true;
    logger.info(
      { studentId: socket.data.studentId },
      'Student signalled tab/window closing',
    );
  });

  socket.on('disconnect', async (reason: string) => {
    try {
      const studentData = getSocketStudentData(socket);
      if (!studentData) return;

      const tabClosing = socket.data.tabClosing === true;
      const disconnectInfo = resolveDisconnectReason(reason, tabClosing);

      // Check if student has another active socket for this session before marking offline
      const activeSockets = io.sockets.adapter.rooms.get(`sessionStudent:${studentData.sessionStudentId}`);
      if (activeSockets && activeSockets.size > 0) {
        logger.info(
          { studentId: studentData.studentId, reason, tabClosing },
          'Socket disconnected but another socket is still active for this session',
        );
        return; // Do not mark offline or start disconnect timer
      }

      logger.info(
        { studentId: studentData.studentId, reason, tabClosing },
        'Student disconnected',
      );

      // If intentional close, mark offline immediately to update teacher UI instantly.
      if (tabClosing) {
        await markStudentOffline(studentData.sessionStudentId);
        broadcastStudentLeft(io, studentData.sessionCode, studentData.studentId);
      }

      // Delay the violation (and the offline status if not an intentional close)
      // to allow page-refresh reconnects within the grace period.
      // Keep the entry in the map during async work so cancelPendingDisconnect
      // can find and flag it even after the timer fires (#18 race fix).
      const entry: PendingDisconnect = {
        timer: null as unknown as NodeJS.Timeout,
        createdAt: Date.now(),
        cancelled: false,
      };

      entry.timer = setTimeout(async () => {
        try {
          if (entry.cancelled) {
            pendingDisconnects.delete(studentData.studentId);
            return;
          }

          // Re-check session — it may have ended during the grace window
          const currentSession = await getSessionByCode(studentData.sessionCode);
          if (!currentSession?.isActive || entry.cancelled) {
            pendingDisconnects.delete(studentData.studentId);
            return;
          }

          if (!tabClosing) {
            await markStudentOffline(studentData.sessionStudentId);
            broadcastStudentLeft(io, studentData.sessionCode, studentData.studentId);
          }

          await createAndBroadcastViolation(io, studentData.sessionCode, studentData.studentId, {
            sessionStudentId: studentData.sessionStudentId,
            type: 'DISCONNECTION',
            reason: disconnectInfo.reason,
            details: disconnectInfo.details,
          });
        } catch (error) {
          logger.error({ error, studentId: studentData.studentId }, 'Error in disconnect grace period handler');
        } finally {
          pendingDisconnects.delete(studentData.studentId);
        }
      }, disconnectGraceMs);

      pendingDisconnects.set(studentData.studentId, entry);
    } catch (error) {
      logger.error({ error }, 'Disconnect handler error');
    }
  });
};
