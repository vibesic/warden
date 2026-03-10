/**
 * Unit tests for the useContinuityClock hook.
 *
 * Tests the localStorage-based continuity clock that detects gaps
 * (app was closed / dead) and network fingerprint changes.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useContinuityClock } from '@src/hooks/useContinuityClock';

describe('useContinuityClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('gap detection', () => {
    it('should return null gap when no previous session data exists', () => {
      const { result } = renderHook(() => useContinuityClock('ABC123'));
      expect(result.current.gap).toBeNull();
    });

    it('should return null gap when session code does not match', () => {
      localStorage.setItem('exam_sessionCode', 'OTHER1');
      localStorage.setItem('exam_lastAlive', String(Date.now() - 60_000));

      const { result } = renderHook(() => useContinuityClock('ABC123'));
      expect(result.current.gap).toBeNull();
    });

    it('should return null gap when gap is below minimum threshold (10s)', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 5_000)); // 5s gap — below threshold

      const { result } = renderHook(() => useContinuityClock('ABC123'));
      expect(result.current.gap).toBeNull();
    });

    it('should detect a significant gap (>10s)', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 30_000)); // 30s gap

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.durationMs).toBeGreaterThanOrEqual(30_000);
      expect(result.current.gap!.lastAliveAt).toBe(now - 30_000);
    });

    it('should detect a very large gap (minutes)', () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 300_000;
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(fiveMinutesAgo));

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.durationMs).toBeGreaterThanOrEqual(300_000);
    });
  });

  describe('network fingerprint', () => {
    it('should include previous network snapshot when available', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));
      localStorage.setItem('exam_networkType', '4g');
      localStorage.setItem('exam_downlink', '10');
      localStorage.setItem('exam_rtt', '50');

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.previousNetwork).toEqual({
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
      });
    });

    it('should return null previousNetwork when not stored', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.previousNetwork).toBeNull();
    });
  });

  describe('localStorage clock ticking', () => {
    it('should write lastAlive to localStorage immediately on mount', () => {
      renderHook(() => useContinuityClock('ABC123'));

      const stored = localStorage.getItem('exam_lastAlive');
      expect(stored).not.toBeNull();
      expect(Number(stored)).toBeCloseTo(Date.now(), -2); // Within ~100ms
    });

    it('should update lastAlive every second', () => {
      renderHook(() => useContinuityClock('ABC123'));

      const first = Number(localStorage.getItem('exam_lastAlive'));

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const second = Number(localStorage.getItem('exam_lastAlive'));
      expect(second).toBeGreaterThanOrEqual(first + 1000);
    });

    it('should store the session code', () => {
      renderHook(() => useContinuityClock('XYZ789'));

      expect(localStorage.getItem('exam_sessionCode')).toBe('XYZ789');
    });

    it('should stop ticking after unmount', () => {
      const clearSpy = vi.spyOn(globalThis, 'clearInterval');
      const { unmount } = renderHook(() => useContinuityClock('ABC123'));

      unmount();
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('clearGap', () => {
    it('should set gap to null when called', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));

      const { result } = renderHook(() => useContinuityClock('ABC123'));
      expect(result.current.gap).not.toBeNull();

      act(() => {
        result.current.clearGap();
      });

      expect(result.current.gap).toBeNull();
    });
  });

  describe('network change detection', () => {
    it('should detect effectiveType change as networkChanged', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));
      localStorage.setItem('exam_networkType', '4g');
      localStorage.setItem('exam_downlink', '10');
      localStorage.setItem('exam_rtt', '50');

      // Mock navigator.connection with a different effectiveType
      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: { effectiveType: '3g', downlink: 10, rtt: 50 },
      });

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.networkChanged).toBe(true);
      expect(result.current.gap!.currentNetwork?.effectiveType).toBe('3g');

      // Cleanup
      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: undefined,
      });
    });

    it('should detect large downlink change (>2x) as networkChanged', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));
      localStorage.setItem('exam_networkType', '4g');
      localStorage.setItem('exam_downlink', '10');
      localStorage.setItem('exam_rtt', '50');

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: { effectiveType: '4g', downlink: 2.5, rtt: 50 }, // downlink dropped 4x
      });

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.networkChanged).toBe(true);

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: undefined,
      });
    });

    it('should detect large rtt change (>100ms) as networkChanged', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));
      localStorage.setItem('exam_networkType', '4g');
      localStorage.setItem('exam_downlink', '10');
      localStorage.setItem('exam_rtt', '50');

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: { effectiveType: '4g', downlink: 10, rtt: 200 }, // rtt jumped 150ms
      });

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.networkChanged).toBe(true);

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: undefined,
      });
    });

    it('should NOT flag networkChanged when values are similar', () => {
      const now = Date.now();
      localStorage.setItem('exam_sessionCode', 'ABC123');
      localStorage.setItem('exam_lastAlive', String(now - 60_000));
      localStorage.setItem('exam_networkType', '4g');
      localStorage.setItem('exam_downlink', '10');
      localStorage.setItem('exam_rtt', '50');

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: { effectiveType: '4g', downlink: 9, rtt: 60 }, // similar values
      });

      const { result } = renderHook(() => useContinuityClock('ABC123'));

      expect(result.current.gap).not.toBeNull();
      expect(result.current.gap!.networkChanged).toBe(false);

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: undefined,
      });
    });

    it('should store network snapshot to localStorage on tick', () => {
      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: { effectiveType: '4g', downlink: 8.5, rtt: 30 },
      });

      renderHook(() => useContinuityClock('ABC123'));

      expect(localStorage.getItem('exam_networkType')).toBe('4g');
      expect(localStorage.getItem('exam_downlink')).toBe('8.5');
      expect(localStorage.getItem('exam_rtt')).toBe('30');

      Object.defineProperty(navigator, 'connection', {
        writable: true,
        configurable: true,
        value: undefined,
      });
    });
  });
});
