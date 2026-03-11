/**
 * Unit tests for gateway helper utilities.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  violation: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

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
    prismaMock.violation.findFirst.mockResolvedValue(null);
  });

  it('should return false for the first violation (no cooldown yet)', async () => {
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(false);
  });

  it('should return true for the second violation within cooldown window', async () => {
    // First call — records the timestamp
    await isDisconnectionOnCooldown('ss-1');

    // Second call — within 5min cooldown
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(true);
  });

  it('should track cooldowns independently per student', async () => {
    // Student A fires first violation
    await isDisconnectionOnCooldown('ss-a');

    // Student B fires first violation — NOT on cooldown
    expect(await isDisconnectionOnCooldown('ss-b')).toBe(false);

    // Student A fires again — ON cooldown
    expect(await isDisconnectionOnCooldown('ss-a')).toBe(true);
  });

  it('should allow new violation after cooldown expires', async () => {
    const realNow = Date.now;
    let currentTime = realNow();
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

    // First call at t=0
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(false);

    // Second call at t=299s — still in cooldown
    currentTime += 299_000;
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(true);

    // Third call at t=301s — cooldown expired (>300s / 5min)
    currentTime += 2_000;
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(false);

    Date.now = realNow;
  });

  it('should be clearable via clearDisconnectionCooldowns', async () => {
    await isDisconnectionOnCooldown('ss-1');
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(true);

    clearDisconnectionCooldowns();

    // After clearing, should not be on cooldown
    expect(await isDisconnectionOnCooldown('ss-1')).toBe(false);
  });

  it('should fall back to DB when in-memory map is empty (server restart)', async () => {
    const recentTime = new Date(Date.now() - 60_000); // 1 minute ago
    prismaMock.violation.findFirst.mockResolvedValue({ timestamp: recentTime });

    // No in-memory entry — should query DB and find recent violation
    expect(await isDisconnectionOnCooldown('ss-restart')).toBe(true);
    expect(prismaMock.violation.findFirst).toHaveBeenCalledWith({
      where: { sessionStudentId: 'ss-restart', type: 'DISCONNECTION' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
  });

  it('should not suppress when DB violation is older than cooldown', async () => {
    const oldTime = new Date(Date.now() - 400_000); // 6+ minutes ago
    prismaMock.violation.findFirst.mockResolvedValue({ timestamp: oldTime });

    expect(await isDisconnectionOnCooldown('ss-old')).toBe(false);
  });

  it('should not query DB when in-memory entry exists', async () => {
    await isDisconnectionOnCooldown('ss-mem');
    prismaMock.violation.findFirst.mockClear();

    // Second call — has in-memory entry, should NOT query DB
    await isDisconnectionOnCooldown('ss-mem');
    expect(prismaMock.violation.findFirst).not.toHaveBeenCalled();
  });
});
