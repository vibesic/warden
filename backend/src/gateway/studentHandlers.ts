import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { validateSession, getSessionByCode } from '../services/session.service';
import { registerStudent, updateHeartbeat, markStudentOffline } from '../services/student.service';
import { createViolation } from '../services/violation.service';

const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6),
});

const VALID_VIOLATION_TYPES = [
  'INTERNET_ACCESS',
  'DISCONNECTION',
  'CONNECTION_LOST',
  'SNIFFER_TIMEOUT',
] as const;

const ViolationSchema = z.object({
  type: z.enum(VALID_VIOLATION_TYPES),
  details: z.string().max(500).optional(),
});

const SnifferResponseSchema = z.object({
  challengeId: z.string(),
  reachable: z.boolean(),
});

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
      const sessionStudentId = socket.data.sessionStudentId;
      const sessionCode = socket.data.sessionCode;
      if (!sessionStudentId || !sessionCode) return;

      const session = await getSessionByCode(sessionCode);
      if (!session?.isActive) return;

      await updateHeartbeat(sessionStudentId);
    } catch (error) {
      logger.error({ error, sessionStudentId: socket.data.sessionStudentId }, 'Heartbeat update error');
    }
  });

  socket.on('report_violation', async (data: unknown) => {
    try {
      const sessionStudentId = socket.data.sessionStudentId;
      const sessionCode = socket.data.sessionCode;
      const studentTxId = socket.data.studentId;

      if (!sessionStudentId || !sessionCode) {
        logger.warn({ sessionStudentId, sessionCode }, 'Violation reported but socket not fully registered');
        return;
      }

      const session = await getSessionByCode(sessionCode);
      if (!session?.isActive) return;

      const result = ViolationSchema.safeParse(data);
      if (!result.success) {
        logger.warn({ error: result.error.issues }, 'Invalid violation data');
        return;
      }
      const { type, details } = result.data;

      logger.warn({ studentId: studentTxId, type }, 'VIOLATION DETECTED');

      const violation = await createViolation({
        sessionStudentId,
        type,
        details,
      });

      io.to(`teacher:session:${sessionCode}`).emit('dashboard:alert', {
        studentId: studentTxId,
        violation: {
          ...violation,
          timestamp: violation.timestamp.toISOString(),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Violation report error');
    }
  });

  socket.on('sniffer:response', async (data: unknown) => {
    try {
      const sessionStudentId = socket.data.sessionStudentId;
      const sessionCode = socket.data.sessionCode;
      const studentTxId = socket.data.studentId;
      if (!sessionStudentId || !sessionCode) return;

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
          sessionStudentId,
          type: 'INTERNET_ACCESS',
          details: `Server-side sniffer challenge confirmed: student reached ${pending.targetUrl}`,
        });

        // Notify teacher dashboard
        io.to(`teacher:session:${sessionCode}`).emit('dashboard:alert', {
          studentId: studentTxId,
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString(),
          },
        });

        // Push violation to student — forces their UI into violation state
        // even if client-side sniffer was bypassed
        socket.emit('violation:detected', { type: 'INTERNET_ACCESS' });
      }
    } catch (error) {
      logger.error({ error }, 'Sniffer response error');
    }
  });

  socket.on('disconnect', async () => {
    const sessionStudentId = socket.data.sessionStudentId;
    const sessionCode = socket.data.sessionCode;
    const studentTxId = socket.data.studentId;

    if (sessionStudentId && sessionCode) {
      logger.info({ studentId: studentTxId }, 'Student disconnected');
      await markStudentOffline(sessionStudentId);

      // Only record a DISCONNECTION violation if the session is still active
      const session = await getSessionByCode(sessionCode);
      if (!session?.isActive) return;

      const violation = await createViolation({
        sessionStudentId,
        type: 'DISCONNECTION',
        details: 'Student disconnected from server (closed tab or lost connection)',
      });

      io.to(`teacher:session:${sessionCode}`).emit('dashboard:update', {
        type: 'STUDENT_LEFT',
        studentId: studentTxId,
      });

      io.to(`teacher:session:${sessionCode}`).emit('dashboard:alert', {
        studentId: studentTxId,
        violation: {
          ...violation,
          timestamp: violation.timestamp.toISOString(),
        },
      });
    }
  });
};
