/**
 * Unit tests for gateway helper utilities.
 */
import { describe, it, expect } from 'vitest';
import { resolveDisconnectReason } from '@src/gateway/helpers';

describe('resolveDisconnectReason', () => {
  it('should return tab/window close message when tabClosing flag is true', () => {
    const result = resolveDisconnectReason('transport close', true);
    expect(result).toBe('Student closed the browser tab or window (intentional)');
  });

  it('should return tab/window close even if reason is ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', true);
    expect(result).toBe('Student closed the browser tab or window (intentional)');
  });

  it('should return WiFi loss message for transport close without tabClosing', () => {
    const result = resolveDisconnectReason('transport close', false);
    expect(result).toBe('Student lost network connection (WiFi drop or network change)');
  });

  it('should return network error message for transport error', () => {
    const result = resolveDisconnectReason('transport error', false);
    expect(result).toBe('Student connection failed due to a network error');
  });

  it('should return timeout message for ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', false);
    expect(result).toBe('Student connection timed out (no response from client)');
  });

  it('should return client-side message for client namespace disconnect', () => {
    const result = resolveDisconnectReason('client namespace disconnect', false);
    expect(result).toBe('Student disconnected from client side');
  });

  it('should return server-side message for server namespace disconnect', () => {
    const result = resolveDisconnectReason('server namespace disconnect', false);
    expect(result).toBe('Student was disconnected by the server');
  });

  it('should return fallback with raw reason for unknown disconnect reasons', () => {
    const result = resolveDisconnectReason('some-future-reason', false);
    expect(result).toBe('Student disconnected (reason: some-future-reason)');
  });
});
