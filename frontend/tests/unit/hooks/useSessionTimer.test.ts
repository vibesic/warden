import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSessionTimer } from '@src/hooks/useSessionTimer';

vi.mock('@src/hooks/useCurrentTime', () => ({
  useCurrentTime: () => new Date('2024-01-01T01:00:00Z'),
}));

describe('useSessionTimer', () => {
  it('should format elapsed time from session start', () => {
    const { result } = renderHook(() => useSessionTimer(0));

    const elapsed = result.current.formatElapsedTime('2024-01-01T00:00:00Z');
    expect(elapsed).toBe('01:00:00');
  });

  it('should format remaining time when session has duration', () => {
    const { result } = renderHook(() => useSessionTimer(0));

    // Session started at 00:00, duration 90 min, current time 01:00
    // Remaining: 90 - 60 = 30 min
    const remaining = result.current.formatRemainingTime('2024-01-01T00:00:00Z', 90);
    expect(remaining).toBe('00:30:00');
  });

  it('should return remaining milliseconds', () => {
    const { result } = renderHook(() => useSessionTimer(0));

    const ms = result.current.getRemainingMs('2024-01-01T00:00:00Z', 90);
    // 30 min = 1,800,000 ms
    expect(ms).toBe(1_800_000);
  });

  it('should account for serverTimeOffset in elapsed time', () => {
    // Server is 5 seconds ahead of client
    const { result } = renderHook(() => useSessionTimer(5000));

    const elapsed = result.current.formatElapsedTime('2024-01-01T00:00:00Z');
    expect(elapsed).toBe('01:00:05');
  });

  it('should account for serverTimeOffset in remaining time', () => {
    // Server is 5 seconds ahead → remaining is 5s less
    const { result } = renderHook(() => useSessionTimer(5000));

    const remaining = result.current.formatRemainingTime('2024-01-01T00:00:00Z', 90);
    expect(remaining).toBe('00:29:55');
  });

  it('should return negative remaining when session is past duration', () => {
    const { result } = renderHook(() => useSessionTimer(0));

    // Session started at 00:00, duration 30 min, current time 01:00
    // Remaining: 30 - 60 = -30 min
    const ms = result.current.getRemainingMs('2024-01-01T00:00:00Z', 30);
    expect(ms).toBeLessThan(0);
  });
});
