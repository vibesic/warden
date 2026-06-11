/**
 * Student-facing Socket.io event handlers.
 *
 * Wiring only — disconnect-grace state lives in
 * `pendingDisconnectManager.ts` and the validate + auth boilerplate is
 * supplied by `withStudentEvent` in `helpers.ts`.
 */
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { validateData } from '../utils/validation';
import { validateSession, getSessionByCode } from '../services/session.service';
import { registerStudent, updateHeartbeat, markStudentOffline } from '../services/student.service';
import { createViolation } from '../services/violation.service';
import { RegisterSchema, ViolationSchema, SnifferResponseSchema } from '../types/schemas';
import {
  broadcastStudentLeft,
  createAndBroadcastViolation,
  getSocketStudentData,
  resolveDisconnectReason,
  withStudentEvent,
} from './helpers';
import { checkSocketRateLimit } from './socketRateLimiter';
import { roomNames } from './roomNames';
import { parseDeviceInfo } from '../utils/device';
import {
  cancelPendingDisconnect,
  schedulePendingDisconnect,
} from './pendingDisconnectManager';

// Re-export pending-disconnect controls so existing callers (socket.ts
// wiring + e2e tests) keep working.
export {
  setDisconnectGraceMs,
  startPendingDisconnectSweep,
  stopPendingDisconnectSweep,
  cancelPendingDisconnect,
  clearAllPendingDisconnects,
  getPendingDisconnectCount,
} from './pendingDisconnectManager';

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

      socket.join(roomNames.session(sessionCode));
      socket.join(roomNames.studentSession(sessionCode));
      socket.join(roomNames.sessionStudent(sessionStudent.id));

      logger.info({ studentId, name, sessionCode }, 'Student registered');

      io.to(roomNames.teacherSession(sessionCode)).emit('dashboard:update', {
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

  socket.on(
    'heartbeat',
    withStudentEvent(socket, { event: 'heartbeat' }, async ({ studentData }) => {
      await updateHeartbeat(studentData.sessionStudentId);
      socket.emit('heartbeat_ack', { serverTime: Date.now() });
    }),
  );

  socket.on(
    'report_violation',
    withStudentEvent(
      socket,
      {
        event: 'report_violation',
        schema: ViolationSchema,
        invalidDataLabel: 'Invalid violation data',
      },
      async ({ data, studentData }) => {
        logger.warn(
          { studentId: studentData.studentId, type: data.type },
          'VIOLATION DETECTED',
        );

        await createAndBroadcastViolation(
          io,
          studentData.sessionCode,
          studentData.studentId,
          {
            sessionStudentId: studentData.sessionStudentId,
            type: data.type,
            reason: data.reason,
            details: data.details,
          },
        );
      },
    ),
  );

  socket.on(
    'sniffer:response',
    withStudentEvent(
      socket,
      {
        event: 'sniffer:response',
        schema: SnifferResponseSchema,
        invalidDataLabel: 'Invalid sniffer data',
        // Sniffer responses are processed regardless of session activity
        // so late replies still clear the pendingChallenge state.
        requireActiveSession: false,
      },
      async ({ socket: s, data, studentData }) => {
        const { challengeId, reachable } = data;

        const pending = s.data.pendingChallenge;
        if (!pending || pending.challengeId !== challengeId) return;

        delete s.data.pendingChallenge;
        // Reset timeout counter on any valid response
        s.data.snifferTimeoutCount = 0;

        if (!reachable) return;

        const violation = await createViolation({
          sessionStudentId: studentData.sessionStudentId,
          type: 'INTERNET_ACCESS',
          reason: 'SERVER_SNIFFER',
          details: `Server-side sniffer challenge confirmed: student reached ${pending.targetUrl}`,
        });

        io.to(roomNames.teacherSession(studentData.sessionCode)).emit('dashboard:alert', {
          studentId: studentData.studentId,
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString(),
          },
        });

        // Push violation to student — forces their UI into violation state
        s.emit('violation:detected', { type: 'INTERNET_ACCESS' });
      },
    ),
  );

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
      const activeSockets = io.sockets.adapter.rooms.get(
        roomNames.sessionStudent(studentData.sessionStudentId),
      );
      if (activeSockets && activeSockets.size > 0) {
        logger.info(
          { studentId: studentData.studentId, reason, tabClosing },
          'Socket disconnected but another socket is still active for this session',
        );
        return;
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

      // Delay the violation (and the offline status if not an intentional
      // close) to allow page-refresh reconnects within the grace period.
      schedulePendingDisconnect(studentData.studentId, async ({ isCancelled }) => {
        // Re-check session — it may have ended during the grace window.
        const currentSession = await getSessionByCode(studentData.sessionCode);
        if (!currentSession?.isActive || isCancelled()) return;

        if (!tabClosing) {
          await markStudentOffline(studentData.sessionStudentId);
          broadcastStudentLeft(io, studentData.sessionCode, studentData.studentId);
        }

        await createAndBroadcastViolation(
          io,
          studentData.sessionCode,
          studentData.studentId,
          {
            sessionStudentId: studentData.sessionStudentId,
            type: 'DISCONNECTION',
            reason: disconnectInfo.reason,
            details: disconnectInfo.details,
          },
        );
      });
    } catch (error) {
      logger.error({ error }, 'Disconnect handler error');
    }
  });
};
