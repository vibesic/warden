import crypto from 'crypto';
import { TeacherAuthPayload } from '../types/auth';

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

  if (signature !== expectedSignature) return false;

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

export const getTeacherPassword = (): string => {
  const password = process.env.TEACHER_PASSWORD || 'admin';
  if (password === 'admin') {
    // Log warning only once via module-level flag
    if (!getTeacherPassword._warned) {
      getTeacherPassword._warned = true;
      // eslint-disable-next-line no-console
      console.warn('[SECURITY] Using default teacher password "admin". Set TEACHER_PASSWORD environment variable for production use.');
    }
  }
  return password;
};
getTeacherPassword._warned = false;
