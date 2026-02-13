import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { validateSession } from './services/session.service';
import { PUBLIC_DOMAINS } from './utils/domainList';
import prisma from './utils/prisma';

const app = express();

// Seed domains on startup (if empty)
const seedDomains = async () => {
  try {
    const count = await prisma.checkTarget.count();
    if (count === 0) {
      console.log('Seeding check targets...');
      await prisma.checkTarget.createMany({
        data: PUBLIC_DOMAINS.map(url => ({ url })),
        skipDuplicates: true
      });
      console.log(`Seeded ${PUBLIC_DOMAINS.length} domains.`);
    }
  } catch (error) {
    console.error('Error seeding domains:', error);
  }
};
// Run seed (non-blocking)
seedDomains();

app.use(helmet());
app.use(cors({
  origin: true, // Allow reflecting the request origin, or use specific list logic if preferred
  credentials: true,
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Domain Check Endpoint (Random 3)
app.get('/api/check-targets', async (req, res) => {
  try {
    // Determine random strategy based on DB type (PostgreSQL uses RANDOM(), MySQL uses RAND())
    // Since we are using PostgreSQL:
    const targets = await prisma.$queryRaw`
      SELECT url FROM "CheckTarget" 
      WHERE "isEnabled" = true 
      ORDER BY RANDOM() 
      LIMIT 3
    `;

    // @ts-ignore
    const urls = targets.map((t: any) => t.url);
    res.json({ domains: urls });
  } catch (error) {
    console.error('Error fetching check targets:', error);
    // Fallback if DB fails
    const shuffled = [...PUBLIC_DOMAINS].sort(() => 0.5 - Math.random());
    res.json({ domains: shuffled.slice(0, 3) });
  }
});

// Session Validation Endpoint
app.get('/api/session/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await validateSession(code);
    res.json(result);
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false, reason: 'Internal Server Error' });
  }
});

export default app;
