import { describe, it, expect } from 'vitest';
import {
  DISCONNECT_GRACE_MS,
  PENDING_DISCONNECT_SWEEP_INTERVAL_MS,
  HEARTBEAT_CHECK_INTERVAL_MS,
  HEARTBEAT_DEAD_THRESHOLD_MS,
  SNIFFER_CHALLENGE_INTERVAL_MS,
  SNIFFER_RESPONSE_TIMEOUT_MS,
  TIMER_CHECK_INTERVAL_MS,
  DISCONNECTION_COOLDOWN_MS,
} from '@src/gateway/constants';

describe('Gateway Constants', () => {
  it('should export DISCONNECT_GRACE_MS as 45 seconds', () => {
    expect(DISCONNECT_GRACE_MS).toBe(45_000);
  });

  it('should export PENDING_DISCONNECT_SWEEP_INTERVAL_MS as 60 seconds', () => {
    expect(PENDING_DISCONNECT_SWEEP_INTERVAL_MS).toBe(60_000);
  });

  it('should export HEARTBEAT_CHECK_INTERVAL_MS as 60 seconds', () => {
    expect(HEARTBEAT_CHECK_INTERVAL_MS).toBe(60_000);
  });

  it('should export HEARTBEAT_DEAD_THRESHOLD_MS as 120 seconds', () => {
    expect(HEARTBEAT_DEAD_THRESHOLD_MS).toBe(120_000);
  });

  it('should export SNIFFER_CHALLENGE_INTERVAL_MS as 60 seconds', () => {
    expect(SNIFFER_CHALLENGE_INTERVAL_MS).toBe(60_000);
  });

  it('should export SNIFFER_RESPONSE_TIMEOUT_MS as 15 seconds', () => {
    expect(SNIFFER_RESPONSE_TIMEOUT_MS).toBe(15_000);
  });

  it('should export TIMER_CHECK_INTERVAL_MS as 3 seconds', () => {
    expect(TIMER_CHECK_INTERVAL_MS).toBe(3_000);
  });

  it('should export DISCONNECTION_COOLDOWN_MS as 5 minutes', () => {
    expect(DISCONNECTION_COOLDOWN_MS).toBe(300_000);
  });

  it('should have all values as positive numbers', () => {
    const constants = [
      DISCONNECT_GRACE_MS,
      PENDING_DISCONNECT_SWEEP_INTERVAL_MS,
      HEARTBEAT_CHECK_INTERVAL_MS,
      HEARTBEAT_DEAD_THRESHOLD_MS,
      SNIFFER_CHALLENGE_INTERVAL_MS,
      SNIFFER_RESPONSE_TIMEOUT_MS,
      TIMER_CHECK_INTERVAL_MS,
      DISCONNECTION_COOLDOWN_MS,
    ];

    for (const value of constants) {
      expect(value).toBeGreaterThan(0);
      expect(typeof value).toBe('number');
    }
  });
});
