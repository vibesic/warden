import { describe, it, expect, afterEach } from 'vitest';
import { getApiBaseUrl, getSocketUrl } from '@src/config/api';

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

  it('should return localhost:4444 in dev mode when VITE_API_URL not set', () => {
    import.meta.env.VITE_API_URL = '';
    import.meta.env.PROD = false;
    expect(getApiBaseUrl()).toBe('http://localhost:4444');
    expect(getSocketUrl()).toBe('http://localhost:4444');
  });

  it('should return window hostname with port 4444 for API and socket in PROD', () => {
    import.meta.env.VITE_API_URL = '';
    import.meta.env.PROD = true;
    expect(getApiBaseUrl()).toBe(`${window.location.protocol}//${window.location.hostname}:4444`);
    expect(getSocketUrl()).toBe(`${window.location.protocol}//${window.location.hostname}:4444`);
  });
});
