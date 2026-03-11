import { prisma } from '../utils/prisma';
import type { Session } from '@prisma/client';

export const createSession = async (durationMinutes: number): Promise<Session> => {
  // End any currently active sessions first
  await prisma.session.updateMany({
    where: { isActive: true },
    data: {
      isActive: false,
      endedAt: new Date()
    }
  });

  // Generate unique 6 digit code
  let code = '';
  let unique = false;
  while (!unique) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await prisma.session.findUnique({ where: { code } });
    if (!existing) unique = true;
  }

  return prisma.session.create({
    data: {
      code,
      isActive: true,
      durationMinutes,
    }
  });
};

export const getActiveSession = async (): Promise<Session | null> => {
  return prisma.session.findFirst({
    where: { isActive: true }
  });
};

/**
 * End a specific session by ID.
 * Also used by `endActiveSession` after resolving the active session.
 */
export const endSessionById = async (sessionId: string): Promise<Session> => {
  return prisma.session.update({
    where: { id: sessionId },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });
};

/**
 * End the currently active session (convenience wrapper).
 */
export const endSession = async (): Promise<Session | null> => {
  const activeSession = await getActiveSession();
  if (!activeSession) return null;
  return endSessionById(activeSession.id);
};

interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  session?: Session;
}

export const validateSession = async (code: string): Promise<SessionValidationResult> => {
  const session = await prisma.session.findUnique({
    where: { code }
  });

  if (!session) return { valid: false, reason: 'Invalid session code' };
  if (!session.isActive) return { valid: false, reason: 'Session has ended', session };

  return { valid: true, session };
};

export const getSessionByCode = async (code: string): Promise<Session | null> => {
  return prisma.session.findUnique({
    where: { code }
  });
};

export const getSessionHistory = async (): Promise<Array<Session & { _count: { sessionStudents: number } }>> => {
  return prisma.session.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { sessionStudents: true }
      }
    }
  });
};

/**
 * Returns active sessions whose timer has expired.
 */
export const getExpiredSessions = async (): Promise<Session[]> => {
  const activeSessions = await prisma.session.findMany({
    where: {
      isActive: true,
      durationMinutes: { not: null },
    },
  });

  const now = Date.now();
  return activeSessions.filter((session) => {
    const endsAt = session.createdAt.getTime() + (session.durationMinutes as number) * 60_000;
    return now >= endsAt;
  });
};
