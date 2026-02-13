import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/secure_exam?schema=public';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url,
    },
  },
});

export default prisma;
