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

import { render } from '@testing-library/react';
import { DisconnectDetector } from '@src/components/exam/DisconnectDetector';
import { readAllProbes } from '@src/utils/probeStore';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

type ReportViolationFn = (type: string, details: string, reason: string) => void;

interface TestProps {
  isConnected: boolean;
  sessionCode: string;
  reportViolation: ReportViolationFn;
}

const defaultProps = (): TestProps => ({
  isConnected: true,
  sessionCode: 'ABC123',
  reportViolation: vi.fn<ReportViolationFn>(),
});

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('DisconnectDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGap = null;
  });

  it('should render nothing (returns null)', () => {
    const props = defaultProps();
    const { container } = render(
      <DisconnectDetector {...props} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should not report violation when connected the whole time', () => {
    const props = defaultProps();
    render(<DisconnectDetector {...props} />);
    expect(props.reportViolation).not.toHaveBeenCalled();
  });

  it('should not report violation for short disconnect (<120s)', () => {
    const props = defaultProps();
    props.isConnected = false;

    const { rerender } = render(<DisconnectDetector {...props} />);

    // Simulate quick reconnect
    props.isConnected = true;
    rerender(<DisconnectDetector {...props} />);

    expect(props.reportViolation).not.toHaveBeenCalled();
  });

  it('should report DISCONNECTION violation for long disconnect (>120s)', async () => {
    const props = defaultProps();
    props.isConnected = false;

    const { rerender } = render(<DisconnectDetector {...props} />);

    // Simulate passage of >120s using Date.now
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 150_000);

    props.isConnected = true;
    rerender(<DisconnectDetector {...props} />);

    expect(props.reportViolation).toHaveBeenCalledWith(
      'DISCONNECTION',
      expect.stringContaining('disconnected from exam server for 150s'),
      'PROLONGED_ABSENCE',
    );
  });

  it('should trigger SW probe on reconnect', async () => {
    const props = defaultProps();
    props.isConnected = false;

    const { rerender } = render(<DisconnectDetector {...props} />);

    props.isConnected = true;
    rerender(<DisconnectDetector {...props} />);

    // Allow async effects to complete
    await vi.waitFor(() => {
      expect(mockRequestProbe).toHaveBeenCalledOnce();
    });
  });

  it('should report INTERNET_ACCESS when SW probes find reachable results', async () => {
    const props = defaultProps();
    props.isConnected = false;

    vi.mocked(readAllProbes).mockResolvedValueOnce([
      { timestamp: 1700000000000, reachable: true, source: 'background-sync' },
    ]);

    const { rerender } = render(<DisconnectDetector {...props} />);

    props.isConnected = true;
    rerender(<DisconnectDetector {...props} />);

    await vi.waitFor(() => {
      expect(props.reportViolation).toHaveBeenCalledWith(
        'INTERNET_ACCESS',
        expect.stringContaining('Service Worker detected internet access'),
        'CLIENT_PROBE',
      );
    });
  });

  it('should not report INTERNET_ACCESS when all probes are unreachable', async () => {
    const props = defaultProps();
    props.isConnected = false;

    vi.mocked(readAllProbes).mockResolvedValueOnce([
      { timestamp: 1700000000000, reachable: false, source: 'background-sync' },
    ]);

    const { rerender } = render(<DisconnectDetector {...props} />);

    props.isConnected = true;
    rerender(<DisconnectDetector {...props} />);

    await vi.waitFor(() => {
      expect(mockRequestProbe).toHaveBeenCalledOnce();
    });

    expect(props.reportViolation).not.toHaveBeenCalledWith(
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

    const props = defaultProps();
    render(<DisconnectDetector {...props} />);

    expect(props.reportViolation).toHaveBeenCalledWith(
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

    const props = defaultProps();
    render(<DisconnectDetector {...props} />);

    expect(props.reportViolation).toHaveBeenCalledWith(
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

    const props = defaultProps();
    props.isConnected = false;
    render(<DisconnectDetector {...props} />);

    expect(props.reportViolation).not.toHaveBeenCalled();
  });
});
