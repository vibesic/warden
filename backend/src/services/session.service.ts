import prisma from '../utils/prisma';

export const createSession = async () => {
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

  const session = await prisma.session.create({
    data: {
      code,
      isActive: true,
    }
  });

  return session;
};

export const getActiveSession = async () => {
  return prisma.session.findFirst({
    where: { isActive: true }
  });
};

export const endSession = async () => {
  // Find active session
  const activeSession = await getActiveSession();
  if (!activeSession) return null;

  const ended = await prisma.session.update({
    where: { id: activeSession.id },
    data: {
      isActive: false,
      endedAt: new Date()
    }
  });
  return ended;
};

export const validateSession = async (code: string) => {
  const session = await prisma.session.findUnique({
    where: { code }
  });

  if (!session) return { valid: false, reason: 'Invalid session code' };
  if (!session.isActive) return { valid: false, reason: 'Session has ended' };

  return { valid: true, session };
};

export const getSessionHistory = async () => {
  return prisma.session.findMany({
    orderBy: { createdAt: 'desc' }
  });
};
