/**
 * Unit tests for gateway helper utilities.
 */
import { describe, it, expect } from 'vitest';
import { resolveDisconnectReason } from '@src/gateway/helpers';

describe('resolveDisconnectReason', () => {
  it('should return TAB_CLOSED reason when tabClosing flag is true', () => {
    const result = resolveDisconnectReason('transport close', true);
    expect(result.reason).toBe('TAB_CLOSED');
    expect(result.details).toBe('Student closed the browser tab or window (intentional)');
  });

  it('should return TAB_CLOSED even if socket reason is ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', true);
    expect(result.reason).toBe('TAB_CLOSED');
    expect(result.details).toBe('Student closed the browser tab or window (intentional)');
  });

  it('should return WIFI_LOST reason for transport close without tabClosing', () => {
    const result = resolveDisconnectReason('transport close', false);
    expect(result.reason).toBe('WIFI_LOST');
    expect(result.details).toBe('Student lost network connection (WiFi drop or network change)');
  });

  it('should return TRANSPORT_ERROR reason for transport error', () => {
    const result = resolveDisconnectReason('transport error', false);
    expect(result.reason).toBe('TRANSPORT_ERROR');
    expect(result.details).toBe('Student connection failed due to a network error');
  });

  it('should return PING_TIMEOUT reason for ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', false);
    expect(result.reason).toBe('PING_TIMEOUT');
    expect(result.details).toBe('Student connection timed out (no response from client)');
  });

  it('should return CLIENT_DISCONNECT reason for client namespace disconnect', () => {
    const result = resolveDisconnectReason('client namespace disconnect', false);
    expect(result.reason).toBe('CLIENT_DISCONNECT');
    expect(result.details).toBe('Student disconnected from client side');
  });

  it('should return SERVER_DISCONNECT reason for server namespace disconnect', () => {
    const result = resolveDisconnectReason('server namespace disconnect', false);
    expect(result.reason).toBe('SERVER_DISCONNECT');
    expect(result.details).toBe('Student was disconnected by the server');
  });

  it('should return CLIENT_DISCONNECT with raw reason for unknown disconnect reasons', () => {
    const result = resolveDisconnectReason('some-future-reason', false);
    expect(result.reason).toBe('CLIENT_DISCONNECT');
    expect(result.details).toBe('Student disconnected (reason: some-future-reason)');
  });
});
