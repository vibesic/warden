import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { findDeadHeartbeats, markStudentOffline } from '../services/student.service';
import { getRandomCheckTarget } from '../services/violation.service';
import { getExpiredSessions, endSessionById } from '../services/session.service';
import { createAndBroadcastViolation, broadcastStudentLeft } from './helpers';
import {
  HEARTBEAT_CHECK_INTERVAL_MS,
  HEARTBEAT_DEAD_THRESHOLD_MS,
  SNIFFER_CHALLENGE_INTERVAL_MS,
  SNIFFER_RESPONSE_TIMEOUT_MS,
  TIMER_CHECK_INTERVAL_MS,
} from './constants';

export const startHeartbeatChecker = (io: Server): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      const deadStudents = await findDeadHeartbeats(HEARTBEAT_DEAD_THRESHOLD_MS);

      await Promise.allSettled(
        deadStudents.map(async (deadStudent) => {
          // Skip students whose session has already ended — no point
          // creating violations or broadcasting updates.
          if (!deadStudent.session?.isActive) {
            await markStudentOffline(deadStudent.id);
            return;
          }

          logger.info({ studentId: deadStudent.student.studentId }, 'Heartbeat missed');

          await markStudentOffline(deadStudent.id);

          broadcastStudentLeft(io, deadStudent.session.code, deadStudent.student.studentId);

          // createAndBroadcastViolation already enforces a per-student
          // DISCONNECTION cooldown, so rapid WiFi flaps won't spam.
          await createAndBroadcastViolation(
            io,
            deadStudent.session.code,
            deadStudent.student.studentId,
            {
              sessionStudentId: deadStudent.id,
              type: 'DISCONNECTION',
              reason: 'HEARTBEAT_TIMEOUT',
              details: 'Heartbeat timeout — no heartbeat received for >120 s',
            },
          );
        })
      );
    } catch (error) {
      logger.error({ error }, 'Heartbeat check error');
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);
};

export const startSnifferChallenger = (io: Server): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      // Instead of io.fetchSockets() across all namespaces/rooms (which is O(n)),
      // we can utilize the specific student sockets by fetching them from their room or relying 
      // on the local Server instance sockets for better performance in non-Redis setups
      // since we only use a single node according to architecture.
      const sockets = Array.from(io.sockets.sockets.values());

      // Phase 1: Check for unanswered challenges from the PREVIOUS cycle
      await Promise.allSettled(
        sockets.map(async (s) => {
          if (!s.data.sessionStudentId) return;
          const pending = s.data.pendingChallenge;
          if (pending && (Date.now() - pending.issuedAt > SNIFFER_RESPONSE_TIMEOUT_MS)) {
            logger.warn(
              { studentId: s.data.studentId, challengeId: pending.challengeId },
              'Sniffer challenge timed out — no response from student'
            );

            s.data.snifferTimeoutCount = (s.data.snifferTimeoutCount || 0) + 1;

            const sessionCode = s.data.sessionCode as string | undefined;
            if (sessionCode) {
              await createAndBroadcastViolation(io, sessionCode, s.data.studentId as string, {
                sessionStudentId: s.data.sessionStudentId as string,
                type: 'SNIFFER_TIMEOUT',
                reason: 'NO_RESPONSE',
                details: `No response to sniffer challenge within ${SNIFFER_RESPONSE_TIMEOUT_MS / 1000}s (target: ${pending.targetUrl}). Consecutive timeouts: ${s.data.snifferTimeoutCount}`,
              });
            }

            delete s.data.pendingChallenge;
          }
        })
      );

      // Phase 2: Issue new challenge
      const targetUrl = await getRandomCheckTarget();
      if (!targetUrl) return;

      const challengeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      for (const s of sockets) {
        if (s.data.sessionStudentId) {
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

// Clean up files older than 24 hours to prevent SSD filling up
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const startCleanupJob = (): NodeJS.Timeout => {
  return setInterval(async () => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { UPLOADS_DIR } = await import('../utils/upload');

      const files = await fs.readdir(UPLOADS_DIR);
      const now = Date.now();
      const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
      let deleted = 0;

      for (const file of files) {
        if (file === '.gitkeep') continue;
        const filePath = path.join(UPLOADS_DIR, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          await fs.unlink(filePath);
          deleted++;
        }
      }

      if (deleted > 0) {
        logger.info({ deletedCount: deleted }, 'Cleaned up old uploaded files.');
      }
    } catch (error) {
      logger.error({ error }, 'Cleanup job error');
    }
  }, CLEANUP_INTERVAL_MS);
};
