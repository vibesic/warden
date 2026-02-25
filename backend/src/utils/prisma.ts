import { PrismaClient } from '@prisma/client';
import path from 'path';

const getDefaultDatabaseUrl = (): string => {
  if (process.env.ELECTRON === 'true') {
    const userDataPath = process.env.ELECTRON_USER_DATA || path.join(process.cwd(), 'data');
    return `file:${path.join(userDataPath, 'proctor.db')}`;
  }
  return 'file:./data/dev.db';
};

const url = process.env.DATABASE_URL || getDefaultDatabaseUrl();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url,
    },
  },
});

export { prisma };
