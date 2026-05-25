/**
 * Authentication routes.
 * Handles teacher login and token verification.
 */
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { TeacherLoginSchema } from '../types/auth';
import { generateTeacherToken, getTeacherPassword, verifyTeacherToken } from '../services/auth.service';
import { authRateLimiter } from '../middleware/rateLimiter';
import { sendErrorJson } from '../utils/httpResponses';

const router = Router();

/** Teacher login with password. */
router.post('/auth/teacher', authRateLimiter, (req: Request, res: Response): void => {
  const result = TeacherLoginSchema.safeParse(req.body);
  if (!result.success) {
    sendErrorJson(res, 400, 'Password is required');
    return;
  }

  const { password } = result.data;
  const teacherPassword = getTeacherPassword();

  if (
    password.length !== teacherPassword.length ||
    !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(teacherPassword))
  ) {
    sendErrorJson(res, 401, 'Invalid password');
    return;
  }

  const token = generateTeacherToken();
  res.json({ success: true, data: { token } });
});

/** Verify an existing teacher token. */
router.get('/auth/verify', (req: Request, res: Response): void => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !verifyTeacherToken(token)) {
    sendErrorJson(res, 401, 'Invalid or expired token');
    return;
  }
  res.json({ success: true });
});

export { router as authRoutes };
