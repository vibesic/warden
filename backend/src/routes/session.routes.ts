/**
 * Session-related routes.
 * Handles session validation and teacher-only session queries.
 */
import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { validateSession } from '../services/session.service';
import { getEnabledCheckTargetUrls } from '../services/violation.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { sessionValidationRateLimiter } from '../middleware/rateLimiter';
import { PUBLIC_DOMAINS } from '../utils/domainList';
import { fisherYatesShuffle } from '../utils/shuffle';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/** Public: validate a session code (used by student login). */
router.get('/session/:code', sessionValidationRateLimiter, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const result = await validateSession(code);
  res.json(result);
}, 'Session validation error', { valid: false, reason: 'Internal Server Error' }));

/** Teacher-only: get check targets for internet sniffer. */
router.get('/check-targets', requireTeacherAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const urls = await getEnabledCheckTargetUrls();
    const shuffled = fisherYatesShuffle(urls);
    res.json({ domains: shuffled.slice(0, 3) });
  } catch (error) {
    logger.error({ error }, 'Error fetching check targets');
    const shuffled = fisherYatesShuffle(PUBLIC_DOMAINS);
    res.json({ domains: shuffled.slice(0, 3) });
  }
});

export { router as sessionRoutes };
