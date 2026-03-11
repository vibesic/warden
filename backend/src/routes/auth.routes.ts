/**
 * Authentication routes.
 * Handles teacher login and token verification.
 */
import { Router, Request, Response } from 'express';
import { TeacherLoginSchema } from '../types/auth';
import { generateTeacherToken, getTeacherPassword, verifyTeacherToken } from '../services/auth.service';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/** Teacher login with password. */
router.post('/auth/teacher', authRateLimiter, (req: Request, res: Response): void => {
  const result = TeacherLoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, message: 'Password is required' });
    return;
  }

  const { password } = result.data;
  if (password !== getTeacherPassword()) {
    res.status(401).json({ success: false, message: 'Invalid password' });
    return;
  }

  const token = generateTeacherToken();
  res.json({ success: true, token });
});

/** Verify an existing teacher token. */
router.get('/auth/verify', (req: Request, res: Response): void => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !verifyTeacherToken(token)) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }
  res.json({ success: true });
});

export { router as authRoutes };
