/**
 * Express middleware for teacher-only HTTP routes.
 * Extracts the duplicated token-verification pattern that
 * appeared 4 times in the old monolithic app.ts.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyTeacherToken } from '../services/auth.service';
import { sendErrorJson } from '../utils/httpResponses';

/**
 * Reject requests without a valid teacher Bearer token.
 */
export const requireTeacherAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token =
    req.headers.authorization?.replace('Bearer ', '') ||
    (req.query.token as string | undefined);

  if (!token || !verifyTeacherToken(token)) {
    sendErrorJson(res, 401, 'Unauthorized');
    return;
  }
  next();
};
