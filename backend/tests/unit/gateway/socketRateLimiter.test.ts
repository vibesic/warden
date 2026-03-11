import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSocketRateLimit } from '@src/gateway/socketRateLimiter';
import type { Socket } from 'socket.io';

const createMockSocket = (): Socket => {
  return { id: `socket-${Math.random().toString(36).slice(2)}`, data: {} } as unknown as Socket;
};

describe('Socket Rate Limiter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* ── Core mechanics ──────────────────────────────────────────── */

  it('should allow events within burst limit', () => {
    const socket = createMockSocket();
    for (let i = 0; i < 10; i++) {
      expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(true);
    }
  });

  it('should reject events exceeding burst limit', () => {
    const socket = createMockSocket();
    for (let i = 0; i < 10; i++) {
      checkSocketRateLimit(socket, 'heartbeat');
    }
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(false);
  });

  it('should refill tokens over time', () => {
    vi.useFakeTimers();
    const socket = createMockSocket();

    for (let i = 0; i < 10; i++) {
      checkSocketRateLimit(socket, 'heartbeat');
    }
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(false);

    // Advance 1s — heartbeat refillRate=5/s
    vi.advanceTimersByTime(1000);
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(true);
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(true);

    vi.useRealTimers();
  });

  it('should track events independently per event name', () => {
    const socket = createMockSocket();
    for (let i = 0; i < 10; i++) {
      checkSocketRateLimit(socket, 'heartbeat');
    }
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(false);
    expect(checkSocketRateLimit(socket, 'report_violation')).toBe(true);
  });

  it('should track sockets independently', () => {
    const socket1 = createMockSocket();
    const socket2 = createMockSocket();

    for (let i = 0; i < 10; i++) {
      checkSocketRateLimit(socket1, 'heartbeat');
    }
    expect(checkSocketRateLimit(socket1, 'heartbeat')).toBe(false);
    expect(checkSocketRateLimit(socket2, 'heartbeat')).toBe(true);
  });

  it('should use default limits for unknown events', () => {
    const socket = createMockSocket();
    for (let i = 0; i < 20; i++) {
      expect(checkSocketRateLimit(socket, 'unknown:event')).toBe(true);
    }
    expect(checkSocketRateLimit(socket, 'unknown:event')).toBe(false);
  });

  it('should not refill above maxTokens', () => {
    vi.useFakeTimers();
    const socket = createMockSocket();

    checkSocketRateLimit(socket, 'heartbeat');
    vi.advanceTimersByTime(60_000);

    for (let i = 0; i < 10; i++) {
      expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(true);
    }
    expect(checkSocketRateLimit(socket, 'heartbeat')).toBe(false);

    vi.useRealTimers();
  });

  /* ── Legitimate traffic pattern tests ────────────────────────
   *
   * Simulate REAL client traffic using fake timers to prove that
   * every normal event pattern passes without being dropped.
   *
   * Sources:
   *   heartbeat ......... SecureExamMonitor setInterval(2000)
   *   register .......... useExamSocket on connect (+ reconnects)
   *   sniffer:response .. useExamSocket on sniffer:challenge (every 60s)
   *   report_violation .. useExamSocket (on-demand, bursty)
   *   student:tab-closing useExamSocket beforeunload (1×)
   *   teacher events .... useTeacherSocket (on-demand)
   * ──────────────────────────────────────────────────────────── */

  describe('Legitimate student heartbeat pattern (every 2 s)', () => {
    it('should never drop heartbeats at 1 event per 2 seconds for 5 minutes', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      // 5 min = 300s, heartbeat every 2s = 150 heartbeats
      for (let i = 0; i < 150; i++) {
        const allowed = checkSocketRateLimit(socket, 'heartbeat');
        expect(allowed).toBe(true);
        vi.advanceTimersByTime(2000);
      }

      vi.useRealTimers();
    });
  });

  describe('Legitimate student register pattern (connect + reconnects)', () => {
    it('should allow initial register plus 3 reconnects within 60 seconds', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      // Initial register
      expect(checkSocketRateLimit(socket, 'register')).toBe(true);

      // WiFi flap: 3 reconnects over 60 seconds (every 20s)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(20_000);
        expect(checkSocketRateLimit(socket, 'register')).toBe(true);
      }

      vi.useRealTimers();
    });
  });

  describe('Legitimate sniffer:response pattern (every 60 s)', () => {
    it('should never drop sniffer responses at 1 per 60 seconds for 15 minutes', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      // 15 min = 15 challenges at 1/min
      for (let i = 0; i < 15; i++) {
        const allowed = checkSocketRateLimit(socket, 'sniffer:response');
        expect(allowed).toBe(true);
        vi.advanceTimersByTime(60_000);
      }

      vi.useRealTimers();
    });
  });

  describe('Legitimate report_violation pattern (bursty on tab switch)', () => {
    it('should allow a burst of 5 violations from rapid tab switches', () => {
      const socket = createMockSocket();

      // Student alt-tabs away and back rapidly: 5 violations at once
      for (let i = 0; i < 5; i++) {
        expect(checkSocketRateLimit(socket, 'report_violation')).toBe(true);
      }
    });

    it('should allow sustained 1 violation per second during active cheating', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      // 30 seconds of 1 violation/s (tab switching, copy-paste, etc.)
      for (let i = 0; i < 30; i++) {
        const allowed = checkSocketRateLimit(socket, 'report_violation');
        expect(allowed).toBe(true);
        vi.advanceTimersByTime(1000);
      }

      vi.useRealTimers();
    });
  });

  describe('Legitimate student:tab-closing pattern', () => {
    it('should allow a single tab-closing signal', () => {
      const socket = createMockSocket();
      expect(checkSocketRateLimit(socket, 'student:tab-closing')).toBe(true);
    });

    it('should allow up to 3 tab-closing signals for rapid close/reopen', () => {
      const socket = createMockSocket();
      for (let i = 0; i < 3; i++) {
        expect(checkSocketRateLimit(socket, 'student:tab-closing')).toBe(true);
      }
    });
  });

  describe('Legitimate teacher dashboard events', () => {
    it('should allow dashboard join + session create + session end', () => {
      const socket = createMockSocket();

      expect(checkSocketRateLimit(socket, 'dashboard:join_overview')).toBe(true);
      expect(checkSocketRateLimit(socket, 'dashboard:join_session')).toBe(true);
      expect(checkSocketRateLimit(socket, 'teacher:create_session')).toBe(true);
      expect(checkSocketRateLimit(socket, 'teacher:end_session')).toBe(true);
    });

    it('should allow teacher reconnecting and re-joining 5 times', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      // Teacher refreshes dashboard 5 times in 5 minutes
      for (let i = 0; i < 5; i++) {
        expect(checkSocketRateLimit(socket, 'dashboard:join_overview')).toBe(true);
        expect(checkSocketRateLimit(socket, 'dashboard:join_session')).toBe(true);
        vi.advanceTimersByTime(60_000);
      }

      vi.useRealTimers();
    });
  });

  describe('Combined student exam session (full 30-min simulation)', () => {
    it('should never drop any event during a realistic 30-minute exam', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      let droppedEvents = 0;

      // Simulate 30 minutes = 1800 seconds
      for (let second = 0; second < 1800; second++) {
        // Heartbeat every 2s
        if (second % 2 === 0) {
          if (!checkSocketRateLimit(socket, 'heartbeat')) droppedEvents++;
        }

        // Sniffer response every 60s
        if (second % 60 === 30) { // offset 30s to stagger
          if (!checkSocketRateLimit(socket, 'sniffer:response')) droppedEvents++;
        }

        // Occasional violation (1 per minute on average)
        if (second % 60 === 45) {
          if (!checkSocketRateLimit(socket, 'report_violation')) droppedEvents++;
        }

        vi.advanceTimersByTime(1000);
      }

      expect(droppedEvents).toBe(0);

      vi.useRealTimers();
    });
  });
});
