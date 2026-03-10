/**
 * Integration tests for question file download in SecureExamMonitor.
 *
 * Validates:
 *  - Question files are fetched and rendered when not violating
 *  - Question files are hidden during violation (full-screen alert replaces UI)
 *  - Download button opens correct URL
 */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Mock hooks ─────────────────────────────────────────────────── */

let isSecure = true;

vi.mock('@src/hooks/useInternetSniffer', () => ({
  useInternetSniffer: () => ({ isSecure }),
}));

vi.mock('@src/hooks/useExamSocket', () => ({
  useExamSocket: () => ({
    isConnected: true,
    sendHeartbeat: vi.fn(),
    reportViolation: vi.fn(),
    error: '',
    sessionTimer: null,
  }),
}));

vi.mock('@src/hooks/useCurrentTime', () => ({
  useCurrentTime: () => new Date(),
}));

vi.mock('@src/hooks/useServiceWorker', () => ({
  useServiceWorker: () => ({ supported: false, registered: false, requestProbe: vi.fn() }),
}));

vi.mock('@src/hooks/useContinuityClock', () => ({
  useContinuityClock: () => ({ gap: null, clearGap: vi.fn() }),
}));

vi.mock('@src/utils/probeStore', () => ({
  readAllProbes: vi.fn().mockResolvedValue([]),
  clearAllProbes: vi.fn().mockResolvedValue(undefined),
}));

/* ── Mock fetch ─────────────────────────────────────────────────── */

let mockFetch: ReturnType<typeof vi.fn>;

/* ── Import component after mocks ───────────────────────────────── */

import { SecureExamMonitor } from '@src/components/SecureExamMonitor';

const defaultProps = {
  studentId: 'S001',
  studentName: 'Alice',
  sessionCode: '123456',
  onLogout: vi.fn(),
};

describe('SecureExamMonitor — question file download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSecure = true;
    mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('should fetch and display question files when not violating', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        data: [
          { id: 'qf-1', originalName: 'exam-q1.pdf', sizeBytes: 4096, createdAt: '2024-01-01T00:00:00Z' },
          { id: 'qf-2', originalName: 'exam-q2.pdf', sizeBytes: 2048, createdAt: '2024-01-01T00:01:00Z' },
        ],
      }),
    });

    render(<SecureExamMonitor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Question Files')).toBeInTheDocument();
    });
    expect(screen.getByText('exam-q1.pdf')).toBeInTheDocument();
    expect(screen.getByText('exam-q2.pdf')).toBeInTheDocument();
  });

  it('should not show question files section when list is empty', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    render(<SecureExamMonitor {...defaultProps} />);

    // Wait for fetch to complete, then verify no question section
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('Question Files')).not.toBeInTheDocument();
  });

  it('should hide question files when violating', async () => {
    isSecure = false;

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        data: [
          { id: 'qf-1', originalName: 'exam-q1.pdf', sizeBytes: 4096, createdAt: '2024-01-01T00:00:00Z' },
        ],
      }),
    });

    render(<SecureExamMonitor {...defaultProps} />);

    // Violation screen replaces the entire UI
    await waitFor(() => {
      expect(screen.getByText('VIOLATION DETECTED')).toBeInTheDocument();
    });
    expect(screen.queryByText('Question Files')).not.toBeInTheDocument();
    expect(screen.queryByText('exam-q1.pdf')).not.toBeInTheDocument();
  });

  it('should open download URL when question file is clicked', async () => {
    const user = userEvent.setup();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        data: [
          { id: 'qf-1', originalName: 'exam-q1.pdf', sizeBytes: 4096, createdAt: '2024-01-01T00:00:00Z' },
        ],
      }),
    });

    render(<SecureExamMonitor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('exam-q1.pdf')).toBeInTheDocument();
    });

    await user.click(screen.getByText('exam-q1.pdf'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('/session/123456/questions/qf-1/download'),
      '_blank',
    );
  });
});
