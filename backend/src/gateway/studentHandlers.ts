import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { validateSession } from '../services/session.service';
import { registerStudent, updateHeartbeat, markStudentOffline } from '../services/student.service';
import { createViolation } from '../services/violation.service';

const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6),
});

const ViolationSchema = z.object({
  type: z.string(),
  details: z.string().optional(),
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
      const { studentId, name, sessionCode } = result.data;

      const sessionCheck = await validateSession(sessionCode);
      if (!sessionCheck.valid || !sessionCheck.session) {
        socket.emit('registration_error', sessionCheck.reason);
        return;
      }

      const student = await registerStudent({
        studentId,
        sessionId: sessionCheck.session.id,
        name,
        ipAddress: socket.handshake.address,
      });

      socket.data.studentUuid = student.id;
      socket.data.studentId = studentId;
      socket.data.sessionCode = sessionCode;

      socket.join(`session:${sessionCode}`);

      logger.info({ studentId, name, sessionCode }, 'Student registered');

      io.to(`session:${sessionCode}`).emit('dashboard:update', {
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
      const studentUuid = socket.data.studentUuid;
      if (!studentUuid) return;
      await updateHeartbeat(studentUuid);
    } catch (error) {
      logger.error({ error, studentUuid: socket.data.studentUuid }, 'Heartbeat update error');
    }
  });

  socket.on('report_violation', async (data: unknown) => {
    try {
      const studentUuid = socket.data.studentUuid;
      const sessionCode = socket.data.sessionCode;
      const studentTxId = socket.data.studentId;

      if (!studentUuid || !sessionCode) {
        logger.warn({ studentUuid, sessionCode }, 'Violation reported but socket not fully registered');
        return;
      }

      const result = ViolationSchema.safeParse(data);
      if (!result.success) {
        logger.warn({ error: result.error.issues }, 'Invalid violation data');
        return;
      }
      const { type, details } = result.data;

      logger.warn({ studentId: studentTxId, type }, 'VIOLATION DETECTED');

      const violation = await createViolation({
        studentUuid,
        type,
        details,
      });

      io.to(`session:${sessionCode}`).emit('dashboard:alert', {
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
      const studentUuid = socket.data.studentUuid;
      const sessionCode = socket.data.sessionCode;
      const studentTxId = socket.data.studentId;
      if (!studentUuid || !sessionCode) return;

      const result = SnifferResponseSchema.safeParse(data);
      if (!result.success) return;

      const { challengeId, reachable } = result.data;

      const pending = socket.data.pendingChallenge;
      if (!pending || pending.challengeId !== challengeId) return;

      delete socket.data.pendingChallenge;

      if (reachable) {
        const violation = await createViolation({
          studentUuid,
          type: 'INTERNET_ACCESS',
          details: `Server-side sniffer challenge confirmed: student reached ${pending.targetUrl}`,
        });

        io.to(`session:${sessionCode}`).emit('dashboard:alert', {
          studentId: studentTxId,
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString(),
          },
        });
      }
    } catch (error) {
      logger.error({ error }, 'Sniffer response error');
    }
  });

  socket.on('disconnect', async () => {
    const studentUuid = socket.data.studentUuid;
    const sessionCode = socket.data.sessionCode;
    const studentTxId = socket.data.studentId;

    if (studentUuid && sessionCode) {
      logger.info({ studentId: studentTxId }, 'Student disconnected');
      await markStudentOffline(studentUuid);

      io.to(`session:${sessionCode}`).emit('dashboard:update', {
        type: 'STUDENT_LEFT',
        studentId: studentTxId,
      });
    }
  });
};
