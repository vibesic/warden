import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { registerStudentHandlers, startPendingDisconnectSweep, stopPendingDisconnectSweep } from './studentHandlers';
import { registerTeacherHandlers } from './teacherHandlers';
import { startHeartbeatChecker, startSnifferChallenger, startTimerChecker } from './backgroundJobs';
import { verifyTeacherToken } from '../services/auth.service';

interface SocketCleanup {
  clearIntervals: () => void;
}

export const initializeSocket = (io: Server): SocketCleanup => {
  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Socket connected');

    socket.on('error', (error: Error) => {
      logger.error({ socketId: socket.id, error: error.message }, 'Socket error');
    });

    registerStudentHandlers(io, socket);

    // Only register teacher handlers for sockets with a valid teacher token.
    // Per-event isTeacherAuthenticated checks remain as defense-in-depth.
    const token = socket.handshake.auth?.token;
    if (typeof token === 'string' && verifyTeacherToken(token)) {
      socket.data.isTeacher = true;
      registerTeacherHandlers(io, socket);
    }
  });

  startPendingDisconnectSweep();

  const heartbeatInterval = startHeartbeatChecker(io);
  const snifferInterval = startSnifferChallenger(io);
  const timerInterval = startTimerChecker(io);

  return {
    clearIntervals: () => {
      stopPendingDisconnectSweep();
      clearInterval(heartbeatInterval);
      clearInterval(snifferInterval);
      clearInterval(timerInterval);
    },
  };
};
