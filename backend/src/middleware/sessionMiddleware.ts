/**
 * Express middleware for validating session parameters.
 *
 * Extracts the repeated "get session by code → check exists → check active"
 * pattern that appears across question and submission routes.
 *
 * On success, attaches the session to `res.locals.session`.
 */
import { Request, Response, NextFunction } from 'express';
import { getSessionByCode } from '../services/session.service';
import { logger } from '../utils/logger';

interface SessionRecord {
  id: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
  durationMinutes: number | null;
  endedAt: Date | null;
}

/**
 * Validate that the route param `:code` (or `:sessionCode`) refers to
 * an existing, active session. Also accepts a custom param name.
 *
 * After this middleware, `res.locals.session` contains the session row.
 */
export const requireActiveSession = (paramName = 'code') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.params[paramName];
      if (!code) {
        res.status(400).json({ success: false, message: 'Session code is required' });
        return;
      }

      const session = await getSessionByCode(code) as SessionRecord | null;
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      if (!session.isActive) {
        res.status(400).json({ success: false, message: 'Session is no longer active' });
        return;
      }

      res.locals.session = session;
      next();
    } catch (err) {
      logger.error({ error: err }, 'Session validation error');
      next(err);
    }
  };
};

/**
 * Validate that `:code` or `:sessionCode` refers to an existing session
 * (active or not). Useful for read-only endpoints like listing submissions.
 */
export const requireSession = (paramName = 'code') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.params[paramName];
      if (!code) {
        res.status(400).json({ success: false, message: 'Session code is required' });
        return;
      }

      const session = await getSessionByCode(code) as SessionRecord | null;
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      res.locals.session = session;
      next();
    } catch (err) {
      logger.error({ error: err }, 'Session validation error');
      next(err);
    }
  };
};
