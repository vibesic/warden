/**
 * Unit tests for gateway helper utilities.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveDisconnectReason,
  isDisconnectionOnCooldown,
  clearDisconnectionCooldowns,
} from '@src/gateway/helpers';

describe('resolveDisconnectReason', () => {
  it('should return TAB_CLOSED reason when tabClosing flag is true', () => {
    const result = resolveDisconnectReason('transport close', true);
    expect(result.reason).toBe('TAB_CLOSED');
    expect(result.details).toBe('Student closed the browser tab or window');
  });

  it('should return TAB_CLOSED even if socket reason is ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', true);
    expect(result.reason).toBe('TAB_CLOSED');
    expect(result.details).toBe('Student closed the browser tab or window');
  });

  it('should return NETWORK_LOST reason for transport close without tabClosing', () => {
    const result = resolveDisconnectReason('transport close', false);
    expect(result.reason).toBe('NETWORK_LOST');
    expect(result.details).toBe('Network connectivity lost (WiFi drop or transport failure)');
  });

  it('should return NETWORK_LOST reason for transport error', () => {
    const result = resolveDisconnectReason('transport error', false);
    expect(result.reason).toBe('NETWORK_LOST');
    expect(result.details).toBe('Network connectivity lost (WiFi drop or transport failure)');
  });

  it('should return PING_TIMEOUT reason for ping timeout', () => {
    const result = resolveDisconnectReason('ping timeout', false);
    expect(result.reason).toBe('PING_TIMEOUT');
    expect(result.details).toBe('Socket connection timed out (no response from client)');
  });

  it('should return CLIENT_INITIATED reason for client namespace disconnect', () => {
    const result = resolveDisconnectReason('client namespace disconnect', false);
    expect(result.reason).toBe('CLIENT_INITIATED');
    expect(result.details).toBe('Student\'s client disconnected explicitly');
  });

  it('should return SERVER_INITIATED reason for server namespace disconnect', () => {
    const result = resolveDisconnectReason('server namespace disconnect', false);
    expect(result.reason).toBe('SERVER_INITIATED');
    expect(result.details).toBe('Server forced the disconnection');
  });

  it('should return CLIENT_INITIATED with raw reason for unknown disconnect reasons', () => {
    const result = resolveDisconnectReason('some-future-reason', false);
    expect(result.reason).toBe('CLIENT_INITIATED');
    expect(result.details).toBe('Student disconnected (reason: some-future-reason)');
  });
});

describe('isDisconnectionOnCooldown', () => {
  beforeEach(() => {
    clearDisconnectionCooldowns();
    vi.restoreAllMocks();
  });

  it('should return false for the first violation (no cooldown yet)', () => {
    expect(isDisconnectionOnCooldown('ss-1')).toBe(false);
  });

  it('should return true for the second violation within cooldown window', () => {
    // First call — records the timestamp
    isDisconnectionOnCooldown('ss-1');

    // Second call — within 5min cooldown
    expect(isDisconnectionOnCooldown('ss-1')).toBe(true);
  });

  it('should track cooldowns independently per student', () => {
    // Student A fires first violation
    isDisconnectionOnCooldown('ss-a');

    // Student B fires first violation — NOT on cooldown
    expect(isDisconnectionOnCooldown('ss-b')).toBe(false);

    // Student A fires again — ON cooldown
    expect(isDisconnectionOnCooldown('ss-a')).toBe(true);
  });

  it('should allow new violation after cooldown expires', () => {
    const realNow = Date.now;
    let currentTime = realNow();
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

    // First call at t=0
    expect(isDisconnectionOnCooldown('ss-1')).toBe(false);

    // Second call at t=299s — still in cooldown
    currentTime += 299_000;
    expect(isDisconnectionOnCooldown('ss-1')).toBe(true);

    // Third call at t=301s — cooldown expired (>300s / 5min)
    currentTime += 2_000;
    expect(isDisconnectionOnCooldown('ss-1')).toBe(false);

    Date.now = realNow;
  });

  it('should be clearable via clearDisconnectionCooldowns', () => {
    isDisconnectionOnCooldown('ss-1');
    expect(isDisconnectionOnCooldown('ss-1')).toBe(true);

    clearDisconnectionCooldowns();

    // After clearing, should not be on cooldown
    expect(isDisconnectionOnCooldown('ss-1')).toBe(false);
  });
});
