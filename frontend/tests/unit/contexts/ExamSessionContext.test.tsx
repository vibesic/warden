import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

/* ------------------------------------------------------------------ */
/*  Mock hooks used by ExamSessionProvider                            */
/* ------------------------------------------------------------------ */

const mockSendHeartbeat = vi.fn();
const mockReportViolation = vi.fn();

let mockIsConnected = true;
let mockIsSecure = true;
let mockSessionTimer: { createdAt: string; durationMinutes: number } | null = null;
let mockError = '';

vi.mock('@src/hooks/useExamSocket', () => ({
  useExamSocket: () => ({
    isConnected: mockIsConnected,
    sendHeartbeat: mockSendHeartbeat,
    reportViolation: mockReportViolation,
    error: mockError,
    sessionTimer: mockSessionTimer,
    serverTimeOffset: 0,
  }),
}));

vi.mock('@src/hooks/useInternetSniffer', () => ({
  useInternetSniffer: () => ({ isSecure: mockIsSecure }),
}));

vi.mock('@src/hooks/useCurrentTime', () => ({
  useCurrentTime: () => new Date('2025-01-01T12:00:00Z'),
}));

let mockFetch: ReturnType<typeof vi.fn>;

import { ExamSessionProvider, useExamSession } from '@src/contexts/ExamSessionContext';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const defaultProviderProps = {
  studentId: 'S001',
  studentName: 'Alice',
  sessionCode: '123456',
  onLogout: vi.fn(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ExamSessionProvider {...defaultProviderProps}>
    {children}
  </ExamSessionProvider>
);

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('ExamSessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIsConnected = true;
    mockIsSecure = true;
    mockSessionTimer = null;
    mockError = '';
    mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw when useExamSession is used outside provider', () => {
    // Suppress console.error for expected React error boundary output
    vi.spyOn(console, 'error').mockImplementation(() => { });

    expect(() => {
      renderHook(() => useExamSession());
    }).toThrow('useExamSession must be used within an ExamSessionProvider');
  });

  it('should provide student identity from props', () => {
    const { result } = renderHook(() => useExamSession(), { wrapper });

    expect(result.current.studentId).toBe('S001');
    expect(result.current.studentName).toBe('Alice');
    expect(result.current.sessionCode).toBe('123456');
  });

  it('should provide isConnected from useExamSocket', () => {
    mockIsConnected = false;
    const { result } = renderHook(() => useExamSession(), { wrapper });

    expect(result.current.isConnected).toBe(false);
  });

  it('should derive isViolating when internet is not secure', () => {
    mockIsSecure = false;
    const { result } = renderHook(() => useExamSession(), { wrapper });

    expect(result.current.isViolating).toBe(true);
  });

  it('should not be violating when internet is secure', () => {
    mockIsSecure = true;
    const { result } = renderHook(() => useExamSession(), { wrapper });

    expect(result.current.isViolating).toBe(false);
  });

  it('should provide reportViolation from useExamSocket', () => {
    const { result } = renderHook(() => useExamSession(), { wrapper });

    result.current.reportViolation('INTERNET_ACCESS', 'test details', 'CLIENT_PROBE');

    expect(mockReportViolation).toHaveBeenCalledWith('INTERNET_ACCESS', 'test details', 'CLIENT_PROBE');
  });

  it('should provide onLogout from props', () => {
    const { result } = renderHook(() => useExamSession(), { wrapper });

    result.current.onLogout();

    expect(defaultProviderProps.onLogout).toHaveBeenCalled();
  });

  it('should start heartbeat loop', () => {
    renderHook(() => useExamSession(), { wrapper });

    // Initial heartbeat on mount
    expect(mockSendHeartbeat).toHaveBeenCalledOnce();

    // Advance by 2s — another heartbeat
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockSendHeartbeat).toHaveBeenCalledTimes(2);
  });

  it('should fetch question files on mount', async () => {
    const questionData = [
      { id: 'q1', originalName: 'exam.pdf', sizeBytes: 1024, createdAt: '2025-01-01T00:00:00Z' },
    ];
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: questionData }),
    });

    vi.useRealTimers();

    const { result } = renderHook(() => useExamSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.questionFiles).toHaveLength(1);
    });

    expect(result.current.questionFiles[0].originalName).toBe('exam.pdf');
  });

  it('should compute remainingTime when sessionTimer is set', () => {
    // Timer started at 11:00, 120 min duration. Current time is 12:00 → 60 min remaining
    mockSessionTimer = {
      createdAt: '2025-01-01T11:00:00Z',
      durationMinutes: 120,
    };

    const { result } = renderHook(() => useExamSession(), { wrapper });

    // 60 minutes remaining → "01:00:00"
    expect(result.current.remainingTime).toBe('01:00:00');
  });

  it('should return null remainingTime when no timer is set', () => {
    mockSessionTimer = null;
    const { result } = renderHook(() => useExamSession(), { wrapper });

    expect(result.current.remainingTime).toBeNull();
  });
});
