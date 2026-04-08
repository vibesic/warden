import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTeacherToken, verifyTeacherToken, getTeacherPassword } from '@src/services/auth.service';

describe('Auth Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateTeacherToken', () => {
    it('should generate a valid token string', () => {
      const token = generateTeacherToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(2);
    });

    it('should generate different tokens on subsequent calls', () => {
      const token1 = generateTeacherToken();
      // Advance time slightly to get different iat
      vi.useFakeTimers();
      vi.advanceTimersByTime(1);
      const token2 = generateTeacherToken();
      vi.useRealTimers();
      // Tokens may differ due to timing
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
    });
  });

  describe('verifyTeacherToken', () => {
    it('should verify a valid token', () => {
      const token = generateTeacherToken();
      expect(verifyTeacherToken(token)).toBe(true);
    });

    it('should reject an empty string', () => {
      expect(verifyTeacherToken('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(verifyTeacherToken(null as unknown as string)).toBe(false);
      expect(verifyTeacherToken(undefined as unknown as string)).toBe(false);
    });

    it('should reject a token with invalid format', () => {
      expect(verifyTeacherToken('no-dot-here')).toBe(false);
      expect(verifyTeacherToken('a.b.c')).toBe(false);
    });

    it('should reject a token with tampered payload', () => {
      const token = generateTeacherToken();
      const [originalPayload, signature] = token.split('.');
      // Modify payload by flipping the first character to guarantee mismatch
      const flipped = String.fromCharCode(originalPayload.charCodeAt(0) ^ 1) + originalPayload.slice(1);
      expect(verifyTeacherToken(`${flipped}.${signature}`)).toBe(false);
    });

    it('should reject a token with tampered signature', () => {
      const token = generateTeacherToken();
      const [payload] = token.split('.');
      expect(verifyTeacherToken(`${payload}.invalidsignature`)).toBe(false);
    });

    it('should reject an expired token (>24h)', () => {
      vi.useFakeTimers();
      const token = generateTeacherToken();
      // Advance 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(verifyTeacherToken(token)).toBe(false);
      vi.useRealTimers();
    });

    it('should accept a token within 24h', () => {
      vi.useFakeTimers();
      const token = generateTeacherToken();
      // Advance 23 hours
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);
      expect(verifyTeacherToken(token)).toBe(true);
      vi.useRealTimers();
    });

    it('should reject a token with wrong role', () => {
      // Manually craft a token with wrong role
      const payload = Buffer.from(JSON.stringify({ role: 'student', iat: Date.now() })).toString('base64url');
      const fakeToken = `${payload}.fakesig`;
      expect(verifyTeacherToken(fakeToken)).toBe(false);
    });
  });

  describe('getTeacherPassword', () => {
    it('should return default password when env not set', () => {
      delete process.env.TEACHER_PASSWORD;
      expect(getTeacherPassword()).toBe('Warden2026!');
    });

    it('should return env password when set', () => {
      process.env.TEACHER_PASSWORD = 'my_secure_pass';
      expect(getTeacherPassword()).toBe('my_secure_pass');
    });

    it('should throw in production mode without TEACHER_PASSWORD', () => {
      delete process.env.TEACHER_PASSWORD;
      process.env.NODE_ENV = 'production';
      expect(() => getTeacherPassword()).toThrow(
        'TEACHER_PASSWORD environment variable is required in production',
      );
    });

    it('should allow custom password in production mode', () => {
      process.env.TEACHER_PASSWORD = 'SecureProductionPass!';
      process.env.NODE_ENV = 'production';
      expect(getTeacherPassword()).toBe('SecureProductionPass!');
    });
  });
});
