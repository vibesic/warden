import { prisma } from '../utils/prisma';
import type { SessionStudent } from '@prisma/client';

interface RegisterStudentParams {
  studentId: string;
  sessionId: string;
  name: string;
  ipAddress: string;
}

export const registerStudent = async (params: RegisterStudentParams): Promise<SessionStudent & { student: { studentId: string; name: string } }> => {
  const { studentId, sessionId, name, ipAddress } = params;

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
    },
    create: {
      studentId: student.id,
      sessionId,
      isOnline: true,
      lastHeartbeat: new Date(),
      ipAddress,
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

export const findDeadHeartbeats = async (thresholdMs: number = 45000): Promise<Array<SessionStudent & { student: { studentId: string; name: string }; session: { id: string; code: string; isActive: boolean } | null }>> => {
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
