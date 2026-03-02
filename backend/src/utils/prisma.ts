import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || 'file:./data/dev.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url,
    },
  },
});

export { prisma };
