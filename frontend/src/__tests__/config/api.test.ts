import { describe, it, expect, afterEach } from 'vitest';
import { getApiBaseUrl, getSocketUrl } from '../../config/api';

describe('api config', () => {
  const savedEnv = { ...import.meta.env };

  afterEach(() => {
    // Restore original env after each test
    Object.assign(import.meta.env, savedEnv);
  });

  it('should return VITE_API_URL when set', () => {
    import.meta.env.VITE_API_URL = 'http://custom:9999';
    expect(getApiBaseUrl()).toBe('http://custom:9999');
    expect(getSocketUrl()).toBe('http://custom:9999');
  });

  it('should return localhost:3333 in dev mode when VITE_API_URL not set', () => {
    import.meta.env.VITE_API_URL = '';
    import.meta.env.PROD = false;
    expect(getApiBaseUrl()).toBe('http://localhost:3333');
    expect(getSocketUrl()).toBe('http://localhost:3333');
  });

  it('should return empty string for API and window.location.origin for socket in PROD', () => {
    import.meta.env.VITE_API_URL = '';
    import.meta.env.PROD = true;
    expect(getApiBaseUrl()).toBe('');
    expect(getSocketUrl()).toBe(window.location.origin);
  });
});
