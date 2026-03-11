import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock the heavy dependencies before importing the component        */
/* ------------------------------------------------------------------ */

const mockRequestProbe = vi.fn().mockResolvedValue(undefined);
const mockClearGap = vi.fn();

vi.mock('@src/hooks/useServiceWorker', () => ({
  useServiceWorker: () => ({
    supported: true,
    registered: true,
    requestProbe: mockRequestProbe,
  }),
}));

let mockGap: {
  durationMs: number;
  lastAliveAt: number;
  resumedAt: number;
  previousNetwork: { effectiveType: string; downlink: number; rtt: number } | null;
  currentNetwork: { effectiveType: string; downlink: number; rtt: number } | null;
  networkChanged: boolean;
} | null = null;

vi.mock('@src/hooks/useContinuityClock', () => ({
  useContinuityClock: () => ({
    gap: mockGap,
    clearGap: mockClearGap,
  }),
}));

vi.mock('@src/utils/probeStore', () => ({
  readAllProbes: vi.fn().mockResolvedValue([]),
  clearAllProbes: vi.fn().mockResolvedValue(undefined),
}));

/* ------------------------------------------------------------------ */
/*  Mock the exam session context                                     */
/* ------------------------------------------------------------------ */

const mockReportViolation = vi.fn();
let mockIsConnected = true;

vi.mock('@src/contexts/ExamSessionContext', () => ({
  useExamSession: () => ({
    isConnected: mockIsConnected,
    sessionCode: 'ABC123',
    reportViolation: mockReportViolation,
    studentId: 'S001',
    studentName: 'Alice',
    isViolating: false,
    sessionEnded: false,
    showEndModal: false,
    remainingTime: null,
    questionFiles: [],
    onLogout: vi.fn(),
  }),
}));

import { render } from '@testing-library/react';
import { DisconnectDetector } from '@src/components/exam/DisconnectDetector';
import { readAllProbes } from '@src/utils/probeStore';

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('DisconnectDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGap = null;
    mockIsConnected = true;
  });

  it('should render nothing (returns null)', () => {
    const { container } = render(<DisconnectDetector />);
    expect(container.firstChild).toBeNull();
  });

  it('should not report violation when connected the whole time', () => {
    render(<DisconnectDetector />);
    expect(mockReportViolation).not.toHaveBeenCalled();
  });

  it('should not report violation for short disconnect (<120s)', () => {
    mockIsConnected = false;
    const { rerender } = render(<DisconnectDetector />);

    // Simulate quick reconnect
    mockIsConnected = true;
    rerender(<DisconnectDetector />);

    expect(mockReportViolation).not.toHaveBeenCalled();
  });

  it('should report DISCONNECTION violation for long disconnect (>120s)', async () => {
    mockIsConnected = false;
    const { rerender } = render(<DisconnectDetector />);

    // Simulate passage of >120s using Date.now
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 150_000);

    mockIsConnected = true;
    rerender(<DisconnectDetector />);

    expect(mockReportViolation).toHaveBeenCalledWith(
      'DISCONNECTION',
      expect.stringContaining('disconnected from exam server for 150s'),
      'PROLONGED_ABSENCE',
    );
  });

  it('should trigger SW probe on reconnect', async () => {
    mockIsConnected = false;
    const { rerender } = render(<DisconnectDetector />);

    mockIsConnected = true;
    rerender(<DisconnectDetector />);

    // Allow async effects to complete
    await vi.waitFor(() => {
      expect(mockRequestProbe).toHaveBeenCalledOnce();
    });
  });

  it('should report INTERNET_ACCESS when SW probes find reachable results', async () => {
    mockIsConnected = false;

    vi.mocked(readAllProbes).mockResolvedValueOnce([
      { timestamp: 1700000000000, reachable: true, source: 'background-sync' },
    ]);

    const { rerender } = render(<DisconnectDetector />);

    mockIsConnected = true;
    rerender(<DisconnectDetector />);

    await vi.waitFor(() => {
      expect(mockReportViolation).toHaveBeenCalledWith(
        'INTERNET_ACCESS',
        expect.stringContaining('Service Worker detected internet access'),
        'CLIENT_PROBE',
      );
    });
  });

  it('should not report INTERNET_ACCESS when all probes are unreachable', async () => {
    mockIsConnected = false;

    vi.mocked(readAllProbes).mockResolvedValueOnce([
      { timestamp: 1700000000000, reachable: false, source: 'background-sync' },
    ]);

    const { rerender } = render(<DisconnectDetector />);

    mockIsConnected = true;
    rerender(<DisconnectDetector />);

    await vi.waitFor(() => {
      expect(mockRequestProbe).toHaveBeenCalledOnce();
    });

    expect(mockReportViolation).not.toHaveBeenCalledWith(
      'INTERNET_ACCESS',
      expect.anything(),
      expect.anything(),
    );
  });

  it('should report continuity gap when gap is detected and connected', () => {
    mockGap = {
      durationMs: 60_000,
      lastAliveAt: Date.now() - 60_000,
      resumedAt: Date.now(),
      previousNetwork: null,
      currentNetwork: null,
      networkChanged: false,
    };

    render(<DisconnectDetector />);

    expect(mockReportViolation).toHaveBeenCalledWith(
      'DISCONNECTION',
      expect.stringContaining('App was inactive for 60s'),
      'PROLONGED_ABSENCE',
    );
    expect(mockClearGap).toHaveBeenCalled();
  });

  it('should include network change info in gap violation message', () => {
    mockGap = {
      durationMs: 120_000,
      lastAliveAt: Date.now() - 120_000,
      resumedAt: Date.now(),
      previousNetwork: { effectiveType: '4g', downlink: 10, rtt: 50 },
      currentNetwork: { effectiveType: '3g', downlink: 2, rtt: 150 },
      networkChanged: true,
    };

    render(<DisconnectDetector />);

    expect(mockReportViolation).toHaveBeenCalledWith(
      'DISCONNECTION',
      expect.stringContaining('Network fingerprint changed'),
      'PROLONGED_ABSENCE',
    );
  });

  it('should not report gap when disconnected', () => {
    mockGap = {
      durationMs: 60_000,
      lastAliveAt: Date.now() - 60_000,
      resumedAt: Date.now(),
      previousNetwork: null,
      currentNetwork: null,
      networkChanged: false,
    };

    mockIsConnected = false;
    render(<DisconnectDetector />);

    expect(mockReportViolation).not.toHaveBeenCalled();
  });
});
