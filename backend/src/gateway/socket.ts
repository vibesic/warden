import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { registerStudentHandlers, startPendingDisconnectSweep, stopPendingDisconnectSweep } from './studentHandlers';
import { registerTeacherHandlers } from './teacherHandlers';
import { startHeartbeatChecker, startSnifferChallenger, startTimerChecker } from './backgroundJobs';

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
    registerTeacherHandlers(io, socket);
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
