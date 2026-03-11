import { prisma } from '../utils/prisma';
import type { SessionStudent } from '@prisma/client';

interface RegisterStudentParams {
  studentId: string;
  sessionId: string;
  name: string;
  ipAddress: string;
  deviceType?: string;
  deviceOs?: string;
  deviceBrowser?: string;
}

export const registerStudent = async (params: RegisterStudentParams): Promise<SessionStudent & { student: { studentId: string; name: string } }> => {
  const { studentId, sessionId, name, ipAddress, deviceType, deviceOs, deviceBrowser } = params;

  // Upsert the Student identity record
  const student = await prisma.student.upsert({
    where: { studentId },
    update: { name },
    create: { studentId, name },
  });

  // Upsert the SessionStudent participation record
  const sessionStudent = await prisma.sessionStudent.upsert({
    where: {
      studentId_sessionId: {
        studentId: student.id,
        sessionId,
      },
    },
    update: {
      isOnline: true,
      lastHeartbeat: new Date(),
      ipAddress,
      deviceType,
      deviceOs,
      deviceBrowser,
    },
    create: {
      studentId: student.id,
      sessionId,
      isOnline: true,
      lastHeartbeat: new Date(),
      ipAddress,
      deviceType,
      deviceOs,
      deviceBrowser,
    },
    include: { student: true },
  });

  return sessionStudent;
};

export const updateHeartbeat = async (sessionStudentId: string): Promise<SessionStudent> => {
  return prisma.sessionStudent.update({
    where: { id: sessionStudentId },
    data: {
      lastHeartbeat: new Date(),
      isOnline: true,
    },
  });
};

export const markStudentOffline = async (sessionStudentId: string): Promise<SessionStudent> => {
  return prisma.sessionStudent.update({
    where: { id: sessionStudentId },
    data: { isOnline: false },
  });
};

export const getSessionStudentsForSession = async (sessionId: string): Promise<Array<SessionStudent & { student: { studentId: string; name: string }; violations: Array<{ type: string; details: string | null; timestamp: Date }> }>> => {
  return prisma.sessionStudent.findMany({
    where: { sessionId },
    include: {
      student: true,
      violations: {
        orderBy: { timestamp: 'desc' },
      },
    },
  });
};

/**
 * Find a SessionStudent by session ID and student transaction ID.
 * Used by the upload route to verify a student belongs to a session.
 */
export const findSessionStudentByStudentId = async (
  sessionId: string,
  studentTxId: string,
): Promise<SessionStudent | null> => {
  return prisma.sessionStudent.findFirst({
    where: {
      session: { id: sessionId },
      student: { studentId: studentTxId },
    },
  });
};

export const findDeadHeartbeats = async (thresholdMs: number = 120_000): Promise<Array<SessionStudent & { student: { studentId: string; name: string }; session: { id: string; code: string; isActive: boolean } | null }>> => {
  const timeoutThreshold = new Date(Date.now() - thresholdMs);

  return prisma.sessionStudent.findMany({
    where: {
      isOnline: true,
      lastHeartbeat: {
        lt: timeoutThreshold,
      },
    },
    include: {
      student: true,
      session: true,
    },
  });
};
