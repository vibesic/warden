import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { verifyTeacherToken } from '../services/auth.service';
import { createSession, endSession, getActiveSession, getSessionHistory, getSessionByCode } from '../services/session.service';
import { getStudentsForSession } from '../services/student.service';

const CreateSessionSchema = z.object({
  durationMinutes: z.number().int().min(1).max(480).optional(),
});

const isTeacherAuthenticated = (socket: Socket): boolean => {
  const token = socket.handshake.auth?.token;
  return typeof token === 'string' && verifyTeacherToken(token);
};

const emitUnauthorized = (socket: Socket): void => {
  socket.emit('dashboard:error', { message: 'Unauthorized: invalid or missing teacher token' });
};

export const registerTeacherHandlers = (io: Server, socket: Socket): void => {
  socket.on('dashboard:join_overview', async () => {
    if (!isTeacherAuthenticated(socket)) {
      emitUnauthorized(socket);
      return;
    }
    try {
      const history = await getSessionHistory();
      const active = await getActiveSession();
      socket.emit('dashboard:overview', {
        history: history.map(h => ({
          ...h,
          createdAt: h.createdAt.toISOString(),
          endedAt: h.endedAt?.toISOString(),
          studentCount: h._count.students,
        })),
        activeSession: active ? { ...active, createdAt: active.createdAt.toISOString() } : null,
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching dashboard overview');
    }
  });

  socket.on('dashboard:join_session', async (data: { sessionCode: string }) => {
    if (!isTeacherAuthenticated(socket)) {
      emitUnauthorized(socket);
      return;
    }
    try {
      if (!data || !data.sessionCode) return;
      const { sessionCode } = data;

      const session = await getSessionByCode(sessionCode);
      if (!session) {
        socket.emit('dashboard:error', { message: 'Session not found' });
        return;
      }

      socket.join(`session:${sessionCode}`);

      const students = await getStudentsForSession(session.id);

      socket.emit('dashboard:session_state', {
        session: {
          ...session,
          createdAt: session.createdAt.toISOString(),
          endedAt: session.endedAt?.toISOString(),
        },
        students: students.map((s) => ({
          studentId: s.studentId,
          name: s.name,
          isOnline: s.isOnline,
          joinedAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastHeartbeat?.toISOString(),
          violations: s.violations.map((v) => ({
            type: v.type,
            details: v.details,
            timestamp: v.timestamp.toISOString(),
          })),
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Error joining session dashboard');
    }
  });

  socket.on('teacher:create_session', async (data?: unknown) => {
    if (!isTeacherAuthenticated(socket)) {
      emitUnauthorized(socket);
      return;
    }
    try {
      const parsed = CreateSessionSchema.safeParse(data ?? {});
      const durationMinutes = parsed.success ? parsed.data.durationMinutes : undefined;

      const session = await createSession(durationMinutes);
      logger.info({ sessionCode: session.code, durationMinutes: session.durationMinutes }, 'Session created');
      io.emit('dashboard:session_created', {
        ...session,
        createdAt: session.createdAt.toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Error creating session');
    }
  });

  socket.on('teacher:end_session', async () => {
    if (!isTeacherAuthenticated(socket)) {
      emitUnauthorized(socket);
      return;
    }
    try {
      const active = await getActiveSession();
      if (!active) return;

      const session = await endSession();
      if (session) {
        logger.info({ sessionCode: session.code }, 'Session ended');
        io.to(`session:${session.code}`).emit('session:ended', {
          message: 'The exam session has been ended by the teacher.',
        });
        io.emit('dashboard:session_ended', {
          ...session,
          createdAt: session.createdAt.toISOString(),
          endedAt: session.endedAt?.toISOString(),
        });
      }
    } catch (error) {
      logger.error({ error }, 'Error ending session');
    }
  });
};
