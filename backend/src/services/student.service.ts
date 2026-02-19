import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

interface RegisterStudentParams {
  studentId: string;
  sessionId: string;
  name: string;
  ipAddress: string;
}

export const registerStudent = async (params: RegisterStudentParams) => {
  const { studentId, sessionId, name, ipAddress } = params;

  return prisma.student.upsert({
    where: {
      studentId_sessionId: {
        studentId,
        sessionId,
      },
    },
    update: {
      isOnline: true,
      lastHeartbeat: new Date(),
      ipAddress,
    },
    create: {
      studentId,
      sessionId,
      name,
      isOnline: true,
      lastHeartbeat: new Date(),
      ipAddress,
    },
  });
};

export const updateHeartbeat = async (studentUuid: string) => {
  return prisma.student.update({
    where: { id: studentUuid },
    data: {
      lastHeartbeat: new Date(),
      isOnline: true,
    },
  });
};

export const markStudentOffline = async (studentUuid: string) => {
  return prisma.student.update({
    where: { id: studentUuid },
    data: { isOnline: false },
  });
};

export const getStudentsForSession = async (sessionId: string) => {
  return prisma.student.findMany({
    where: { sessionId },
    include: {
      violations: {
        orderBy: { timestamp: 'desc' },
      },
    },
  });
};

export const findDeadHeartbeats = async (thresholdMs: number = 45000) => {
  const timeoutThreshold = new Date(Date.now() - thresholdMs);

  return prisma.student.findMany({
    where: {
      isOnline: true,
      lastHeartbeat: {
        lt: timeoutThreshold,
      },
    },
    include: { session: true },
  });
};
