import { describe, it, expect } from 'vitest';
import { parseDeviceInfo } from '@src/utils/device';

describe('parseDeviceInfo', () => {
  it('should detect desktop Chrome on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const info = parseDeviceInfo(ua);
    expect(info.deviceType).toBe('desktop');
    expect(info.deviceOs).toContain('Windows');
    expect(info.deviceBrowser).toContain('Chrome');
  });

  it('should detect mobile Android Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';
    const info = parseDeviceInfo(ua);
    expect(info.deviceType).toBe('mobile');
    expect(info.deviceOs).toContain('Android');
    expect(info.deviceBrowser).toContain('Chrome');
  });

  it('should detect tablet iPad Safari', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const info = parseDeviceInfo(ua);
    expect(info.deviceType).toBe('tablet');
    expect(info.deviceBrowser).toContain('Safari');
  });

  it('should detect iPhone Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const info = parseDeviceInfo(ua);
    expect(info.deviceType).toBe('mobile');
    expect(info.deviceOs).toContain('iOS');
  });

  it('should detect desktop Firefox on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
    const info = parseDeviceInfo(ua);
    expect(info.deviceType).toBe('desktop');
    expect(info.deviceOs).toContain('macOS');
    expect(info.deviceBrowser).toContain('Firefox');
  });

  it('should return unknown for undefined user agent', () => {
    const info = parseDeviceInfo(undefined);
    expect(info.deviceType).toBe('unknown');
    expect(info.deviceOs).toBe('Unknown');
    expect(info.deviceBrowser).toBe('Unknown');
  });

  it('should return unknown for empty user agent', () => {
    const info = parseDeviceInfo('');
    expect(info.deviceType).toBe('unknown');
    expect(info.deviceOs).toBe('Unknown');
    expect(info.deviceBrowser).toBe('Unknown');
  });

  it('should truncate browser version to major only', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Safari/537.36';
    const info = parseDeviceInfo(ua);
    expect(info.deviceBrowser).toBe('Chrome 120');
  });
});
