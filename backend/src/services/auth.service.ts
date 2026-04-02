import crypto from 'crypto';
import { TeacherAuthPayload } from '../types/auth';
import { logger } from '../utils/logger';

const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

export const generateTeacherToken = (): string => {
  const payload: TeacherAuthPayload = {
    role: 'teacher',
    iat: Date.now(),
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadBase64)
    .digest('base64url');
  return `${payloadBase64}.${signature}`;
};

export const verifyTeacherToken = (token: string): boolean => {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadBase64, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  try {
    const payload: TeacherAuthPayload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString()
    );
    if (payload.role !== 'teacher') return false;
    // Token expires after 24 hours
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - payload.iat > MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
};

const DEFAULT_PASSWORD = 'Proctor2026!';
let defaultPasswordWarned = false;

export const getTeacherPassword = (): string => {
  const password = process.env.TEACHER_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'TEACHER_PASSWORD environment variable is required in production.',
      );
    }
    if (!defaultPasswordWarned) {
      defaultPasswordWarned = true;
      logger.warn('TEACHER_PASSWORD not set. Using default password for development. Set TEACHER_PASSWORD environment variable for production use.');
    }
    return DEFAULT_PASSWORD;
  }

  return password;
};
