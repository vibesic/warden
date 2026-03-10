/**
 * Integration tests for SecureExamMonitor reconnection violation detection.
 *
 * Validates:
 *  - Detector #6 (socket reconnect) and #7 (continuity clock) do NOT overlap
 *  - SW probe records are read and reported on reconnect
 *  - Continuity clock gap fires only when socket reconnect did NOT
 *  - Network fingerprint change on return
 *  - Absence-only detection (no internet evidence)
 */
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock hooks and utilities                                          */
/* ------------------------------------------------------------------ */

// Track calls to reportViolation
const reportViolationMock = vi.fn();

// Controls for useExamSocket
let examSocketIsConnected = true;
const setExamSocketConnected = (v: boolean): void => { examSocketIsConnected = v; };

vi.mock('@src/hooks/useExamSocket', () => ({
  useExamSocket: () => ({
    isConnected: examSocketIsConnected,
    sendHeartbeat: vi.fn(),
    reportViolation: reportViolationMock,
    error: '',
    sessionTimer: null,
  }),
}));

// Internet sniffer — always secure in these tests
vi.mock('@src/hooks/useInternetSniffer', () => ({
  useInternetSniffer: () => ({ isSecure: true }),
}));

vi.mock('@src/hooks/useCurrentTime', () => ({
  useCurrentTime: () => new Date(),
}));

// Service Worker — controllable probe request
const requestProbeMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@src/hooks/useServiceWorker', () => ({
  useServiceWorker: () => ({
    supported: true,
    registered: true,
    requestProbe: requestProbeMock,
  }),
}));

// Continuity clock — controllable gap
interface MockGap {
  durationMs: number;
  lastAliveAt: number;
  resumedAt: number;
  previousNetwork: { effectiveType: string; downlink: number; rtt: number } | null;
  currentNetwork: { effectiveType: string; downlink: number; rtt: number } | null;
  networkChanged: boolean;
}
let clockGap: MockGap | null = null;
const clearGapMock = vi.fn(() => { clockGap = null; });

vi.mock('@src/hooks/useContinuityClock', () => ({
  useContinuityClock: () => ({
    gap: clockGap,
    clearGap: clearGapMock,
  }),
}));

// Probe store — controllable
const readAllProbesMock = vi.fn().mockResolvedValue([]);
const clearAllProbesMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@src/utils/probeStore', () => ({
  readAllProbes: () => readAllProbesMock(),
  clearAllProbes: () => clearAllProbesMock(),
}));

/* ------------------------------------------------------------------ */
/*  Import component AFTER mocks                                      */
/* ------------------------------------------------------------------ */

import { SecureExamMonitor } from '@src/components/SecureExamMonitor';

const defaultProps = {
  studentId: 'S001',
  studentName: 'Alice',
  sessionCode: '123456',
  onLogout: vi.fn(),
};

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SecureExamMonitor — reconnection violations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    examSocketIsConnected = true;
    clockGap = null;
    readAllProbesMock.mockResolvedValue([]);
  });

  describe('Detector #6 vs #7 overlap prevention', () => {
    it('should report DISCONNECTION from socket reconnect (#6) when disconnect > 2min', () => {
      // Start connected
      setExamSocketConnected(true);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      // Simulate disconnect
      act(() => {
        setExamSocketConnected(false);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Wait > 2 minutes (we fake the time gap by manipulating Date.now)
      const originalNow = Date.now;
      const baseTime = originalNow();
      let currentTime = baseTime;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      // Set disconnect time
      currentTime = baseTime;
      act(() => {
        setExamSocketConnected(false);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Advance 3 minutes and reconnect
      currentTime = baseTime + 180_000;
      act(() => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Should have reported DISCONNECTION
      const connectionLostCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION'
      );
      expect(connectionLostCalls.length).toBeGreaterThanOrEqual(1);
      expect(connectionLostCalls[0][2]).toBe('PROLONGED_ABSENCE');

      Date.now = originalNow;
    });

    it('should NOT report from continuity clock (#7) when socket reconnect (#6) already handled', () => {
      // Set up a continuity gap that would normally fire
      clockGap = {
        durationMs: 300_000,
        lastAliveAt: Date.now() - 300_000,
        resumedAt: Date.now(),
        previousNetwork: null,
        currentNetwork: null,
        networkChanged: false,
      };

      // Start disconnected, then reconnect with >2min gap
      setExamSocketConnected(false);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      const originalNow = Date.now;
      const baseTime = originalNow();
      vi.spyOn(Date, 'now').mockImplementation(() => baseTime + 180_000);

      act(() => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Count DISCONNECTION violations — should only be 1 (from #6)
      const connectionLostCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION'
      );
      // At most 1 DISCONNECTION, not 2
      expect(connectionLostCalls.length).toBeLessThanOrEqual(1);

      // clearGap should have been called (gap was consumed/skipped)
      expect(clearGapMock).toHaveBeenCalled();

      Date.now = originalNow;
    });

    it('should report from continuity clock (#7) when socket reconnect (#6) did NOT handle (gap < 2min)', () => {
      // Continuity gap of 15s — above 10s minimum, but below 120s socket threshold
      clockGap = {
        durationMs: 15_000,
        lastAliveAt: Date.now() - 15_000,
        resumedAt: Date.now(),
        previousNetwork: null,
        currentNetwork: null,
        networkChanged: false,
      };

      // Start connected — no socket disconnect happened
      setExamSocketConnected(true);
      render(<SecureExamMonitor {...defaultProps} />);

      // Continuity clock gap should fire since socket reconnect didn't handle it
      const connectionLostCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION'
      );
      expect(connectionLostCalls.length).toBe(1);
      expect(connectionLostCalls[0][1]).toContain('App was inactive');
    });
  });

  describe('SW probe reading on reconnect', () => {
    it('should read and report SW probe records when reconnecting', async () => {
      readAllProbesMock.mockResolvedValue([
        { id: 1, timestamp: Date.now() - 60_000, reachable: true, source: 'background-sync' },
        { id: 2, timestamp: Date.now() - 30_000, reachable: true, source: 'background-sync' },
      ]);

      // Start disconnected
      setExamSocketConnected(false);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      // Reconnect
      await act(async () => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
        // Wait for async operations
        await new Promise(r => setTimeout(r, 100));
      });

      // Should have called requestProbe
      expect(requestProbeMock).toHaveBeenCalled();

      // Should have reported INTERNET_ACCESS with SW probe data
      const internetCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'INTERNET_ACCESS'
      );
      expect(internetCalls.length).toBe(1);
      expect(internetCalls[0][1]).toContain('Service Worker detected internet access');

      // Should have cleared probes
      expect(clearAllProbesMock).toHaveBeenCalled();
    });

    it('should NOT report when SW probes show no internet', async () => {
      readAllProbesMock.mockResolvedValue([]);

      setExamSocketConnected(false);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      await act(async () => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
        await new Promise(r => setTimeout(r, 100));
      });

      const internetCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);
    });

    it('should degrade gracefully if IndexedDB fails', async () => {
      readAllProbesMock.mockRejectedValue(new Error('IndexedDB unavailable'));

      setExamSocketConnected(false);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      // Should not throw
      await act(async () => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
        await new Promise(r => setTimeout(r, 100));
      });

      // No violation should have been reported from SW probes
      const internetCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'INTERNET_ACCESS'
      );
      expect(internetCalls).toHaveLength(0);
    });
  });

  describe('no false positives on short disconnect', () => {
    it('should NOT report DISCONNECTION when disconnect < 2min', () => {
      setExamSocketConnected(true);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      // Disconnect briefly
      act(() => {
        setExamSocketConnected(false);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Reconnect immediately (short gap)
      act(() => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      const connectionLostCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION'
      );
      expect(connectionLostCalls).toHaveLength(0);
    });
  });

  describe('Attack scenario subtleties', () => {
    it('should detect return with no internet evidence but suspicious absence', async () => {
      // Student connected
      setExamSocketConnected(true);
      const { rerender } = render(<SecureExamMonitor {...defaultProps} />);

      // Student disconnects
      act(() => {
        setExamSocketConnected(false);
        rerender(<SecureExamMonitor {...defaultProps} />);
      });

      // Returns after 3 min, but SW found no internet (probes empty)
      readAllProbesMock.mockResolvedValue([]);

      const originalNow = Date.now;
      const baseTime = originalNow();
      vi.spyOn(Date, 'now').mockImplementation(() => baseTime + 180_000);

      await act(async () => {
        setExamSocketConnected(true);
        rerender(<SecureExamMonitor {...defaultProps} />);
        await new Promise((r) => setTimeout(r, 150));
      });

      // Should have DISCONNECTION / PROLONGED_ABSENCE but no INTERNET_ACCESS
      const disconnectionCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION',
      );
      expect(disconnectionCalls.length).toBeGreaterThanOrEqual(1);

      const internetCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'INTERNET_ACCESS',
      );
      expect(internetCalls).toHaveLength(0);

      Date.now = originalNow;
    });

    it('should detect network fingerprint change on return', () => {
      // Continuity clock detected gap + network changed (e.g., WiFi switched)
      clockGap = {
        durationMs: 60_000,
        lastAliveAt: Date.now() - 60_000,
        resumedAt: Date.now(),
        previousNetwork: { effectiveType: '4g', downlink: 10, rtt: 50 },
        currentNetwork: { effectiveType: 'wifi', downlink: 100, rtt: 5 },
        networkChanged: true,
      };

      setExamSocketConnected(true);
      render(<SecureExamMonitor {...defaultProps} />);

      const disconnectionCalls = reportViolationMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'DISCONNECTION',
      );
      expect(disconnectionCalls.length).toBe(1);
      // Details should mention network fingerprint change
      expect(disconnectionCalls[0][1]).toContain('Network fingerprint changed');
    });
  });
});
