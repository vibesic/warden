/**
 * Session-related routes.
 * Handles session validation and teacher-only session queries.
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { validateSession } from '../services/session.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { sessionValidationRateLimiter } from '../middleware/rateLimiter';
import { PUBLIC_DOMAINS } from '../utils/domainList';

const router = Router();

/** Public: validate a session code (used by student login). */
router.get('/session/:code', sessionValidationRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const result = await validateSession(code);
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Session validation error');
    res.status(500).json({ valid: false, reason: 'Internal Server Error' });
  }
});

/** Teacher-only: get check targets for internet sniffer. */
router.get('/check-targets', requireTeacherAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const allTargets = await prisma.checkTarget.findMany({
      where: { isEnabled: true },
      select: { url: true },
    });
    const shuffled = allTargets.sort(() => 0.5 - Math.random());
    const urls = shuffled.slice(0, 3).map((t) => t.url);
    res.json({ domains: urls });
  } catch (error) {
    logger.error({ error }, 'Error fetching check targets');
    const shuffled = [...PUBLIC_DOMAINS].sort(() => 0.5 - Math.random());
    res.json({ domains: shuffled.slice(0, 3) });
  }
});

export { router as sessionRoutes };
