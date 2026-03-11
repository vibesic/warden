import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { prisma } from './utils/prisma';
import { logger, requestLogger } from './utils/logger';
import { PUBLIC_DOMAINS } from './utils/domainList';
import { isProductionMode, corsOriginCallback } from './utils/config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalRateLimiter } from './middleware/rateLimiter';
import { authRoutes } from './routes/auth.routes';
import { sessionRoutes } from './routes/session.routes';
import { submissionRoutes } from './routes/submission.routes';
import { questionRoutes } from './routes/question.routes';

const app = express();

/* ── Domain seeding (non-blocking) ───────────────────────────── */
const seedDomains = async (): Promise<void> => {
  try {
    const count = await prisma.checkTarget.count();
    if (count === 0) {
      logger.info('Seeding check targets...');
      for (const url of PUBLIC_DOMAINS) {
        await prisma.checkTarget.create({ data: { url } }).catch(() => { /* skip duplicates */ });
      }
      logger.info({ count: PUBLIC_DOMAINS.length }, 'Check targets seeded');
    }
  } catch (error) {
    logger.error({ error }, 'Error seeding domains');
  }
};
seedDomains();

/* ── Security ────────────────────────────────────────────────── */
if (isProductionMode()) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  }));
} else {
  app.use(helmet());
}

/* ── CORS (using shared callback) ────────────────────────────── */
app.use(cors({
  origin: corsOriginCallback,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json());

/* ── Request logging ──────────────────────────────────────────── */
app.use(requestLogger);

/* ── Rate limiting ───────────────────────────────────────────── */
app.use('/api', generalRateLimiter);

/* ── Health ──────────────────────────────────────────────────── */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

/* ── Routes ──────────────────────────────────────────────────── */
app.use('/api', authRoutes);
app.use('/api', sessionRoutes);
app.use('/api', submissionRoutes);
app.use('/api', questionRoutes);

/* ── Static frontend in production mode ──────────────────────── */
if (isProductionMode()) {
  const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

/* ── Error handling ──────────────────────────────────────────── */
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
