import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { findDeadHeartbeats, markStudentOffline } from '../services/student.service';
import { createViolation, getRandomCheckTarget } from '../services/violation.service';
import { getExpiredSessions, endSessionById } from '../services/session.service';

const HEARTBEAT_CHECK_INTERVAL_MS = 30000;
const SNIFFER_CHALLENGE_INTERVAL_MS = 60000;
const TIMER_CHECK_INTERVAL_MS = 10000;

export const startHeartbeatChecker = (io: Server): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      const deadStudents = await findDeadHeartbeats();

      for (const student of deadStudents) {
        logger.info({ studentId: student.studentId }, 'Heartbeat missed');

        await markStudentOffline(student.id);

        const violation = await createViolation({
          studentUuid: student.id,
          type: 'DISCONNECTION',
          details: 'Heartbeat timeout > 45s',
        });

        if (student.session) {
          io.to(`session:${student.session.code}`).emit('dashboard:update', {
            type: 'STUDENT_LEFT',
            studentId: student.studentId,
          });

          io.to(`session:${student.session.code}`).emit('dashboard:alert', {
            studentId: student.studentId,
            violation: {
              ...violation,
              timestamp: violation.timestamp.toISOString(),
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Heartbeat check error');
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);
};

export const startSnifferChallenger = (io: Server): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      const targetUrl = await getRandomCheckTarget();
      if (!targetUrl) return;

      const challengeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if (s.data.studentUuid) {
          s.data.pendingChallenge = { challengeId, targetUrl, issuedAt: Date.now() };
          s.emit('sniffer:challenge', { challengeId, targetUrl });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Sniffer challenge broadcast error');
    }
  }, SNIFFER_CHALLENGE_INTERVAL_MS);
};

export const startTimerChecker = (io: Server): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      const expired = await getExpiredSessions();

      for (const session of expired) {
        logger.info({ sessionCode: session.code }, 'Session timer expired, auto-ending');

        const ended = await endSessionById(session.id);

        io.to(`session:${session.code}`).emit('session:ended', {
          message: 'Exam time is up. The session has ended automatically.',
        });

        io.emit('dashboard:session_ended', {
          ...ended,
          createdAt: ended.createdAt.toISOString(),
          endedAt: ended.endedAt?.toISOString(),
        });
      }
    } catch (error) {
      logger.error({ error }, 'Timer check error');
    }
  }, TIMER_CHECK_INTERVAL_MS);
};
