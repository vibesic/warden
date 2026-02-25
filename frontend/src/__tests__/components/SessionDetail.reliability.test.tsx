import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StudentStatus, Session } from '../../hooks/useTeacherSocket';

/* ---------- mock react-router-dom --------------------------------------- */

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => ({ sessionCode: 'TEST01' }),
  useNavigate: () => mockNavigate,
}));

/* ---------- mock useTeacherSocket --------------------------------------- */

const mockEndSession = vi.fn();
let mockHookReturn: {
  isConnected: boolean;
  students: Record<string, StudentStatus>;
  activeSession: Session | null;
  history: Session[];
  isAuthError: boolean;
  serverTimeOffset: number;
  createSession: ReturnType<typeof vi.fn>;
  endSession: typeof mockEndSession;
};

vi.mock('../../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => mockHookReturn,
}));

/* ---------- mock fetch ------------------------------------------------- */

let mockFetch: ReturnType<typeof vi.fn>;

/* ---------- import after mocks ------------------------------------------ */

import { SessionDetail } from '../../components/SessionDetail';

describe('SessionDetail — Reliability & Security', () => {
  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    mockHookReturn = {
      isConnected: true,
      students: {},
      activeSession: {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
      history: [],
      isAuthError: false,
      serverTimeOffset: 0,
      createSession: vi.fn(),
      endSession: mockEndSession,
    };
    mockNavigate.mockClear();
    mockEndSession.mockClear();
    localStorage.clear();
  });

  describe('Connection State Display', () => {
    it('should show Disconnected status when socket is not connected', () => {
      mockHookReturn.isConnected = false;
      render(<SessionDetail />);
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('should show Connected status when socket is connected', () => {
      render(<SessionDetail />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('Auth Error Handling', () => {
    it('should redirect to teacher login when isAuthError is true', () => {
      mockHookReturn.isAuthError = true;
      render(<SessionDetail />);
      expect(mockNavigate).toHaveBeenCalledWith('/teacher/login');
    });

    it('should clear localStorage on auth error redirect', () => {
      localStorage.setItem('teacherMode', 'true');
      localStorage.setItem('teacherToken', 'some-token');
      mockHookReturn.isAuthError = true;
      render(<SessionDetail />);
      expect(localStorage.getItem('teacherMode')).toBeNull();
      expect(localStorage.getItem('teacherToken')).toBeNull();
    });
  });

  describe('Timer Display Reliability', () => {
    it('should show Time Elapsed for session without duration', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      };

      render(<SessionDetail />);
      expect(screen.getByText('Time Elapsed')).toBeInTheDocument();
    });

    it('should show Time Remaining for session with duration', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        durationMinutes: 60,
      };

      render(<SessionDetail />);
      expect(screen.getByText('Time Remaining')).toBeInTheDocument();
    });

    it('should show Ending session when time runs out', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: new Date(Date.now() - 120 * 60_000).toISOString(), // 2 hours ago
        durationMinutes: 60, // but only 60 min duration
      };

      render(<SessionDetail />);
      // With serverTimeOffset=0, remaining = 60min - 120min = negative => "Ending session..."
      expect(screen.getByText('Ending session...')).toBeInTheDocument();
    });

    it('should show emerald color when > 5 minutes remain', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: new Date(Date.now() - 30 * 60_000).toISOString(), // 30min ago
        durationMinutes: 60, // 30 min remaining
      };

      render(<SessionDetail />);
      const timerLabel = screen.getByText('Time Remaining');
      const timerValue = timerLabel.nextElementSibling;
      expect(timerValue?.className).toContain('text-emerald-500');
    });

    it('should show rose color when < 5 minutes remain', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: true,
        createdAt: new Date(Date.now() - 58 * 60_000).toISOString(), // 58 min ago
        durationMinutes: 60, // 2 min remaining
      };

      render(<SessionDetail />);
      const timerLabel = screen.getByText('Time Remaining');
      const timerValue = timerLabel.nextElementSibling;
      expect(timerValue?.className).toContain('text-rose-500');
    });
  });

  describe('Student Online/Offline Status', () => {
    it('should correctly show online and offline counts', () => {
      mockHookReturn.students = {
        S001: { studentId: 'S001', name: 'Alice', isOnline: true, violations: [] },
        S002: { studentId: 'S002', name: 'Bob', isOnline: false, violations: [] },
        S003: { studentId: 'S003', name: 'Charlie', isOnline: true, violations: [] },
      };

      render(<SessionDetail />);
      expect(screen.getByText(/Connected Students \(2 out of 3\)/)).toBeInTheDocument();
    });

    it('should not show violation count when student has zero violations', () => {
      mockHookReturn.students = {
        S001: { studentId: 'S001', name: 'Alice', isOnline: true, violations: [] },
      };

      render(<SessionDetail />);
      // Card view: zero violations renders a spacer div, no text
      expect(screen.queryByText(/Violations/)).not.toBeInTheDocument();
      // Student name should still render
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('should render multiple student cards', () => {
      mockHookReturn.students = {
        S001: { studentId: 'S001', name: 'Alice', isOnline: true, violations: [] },
        S002: { studentId: 'S002', name: 'Bob', isOnline: true, violations: [] },
        S003: { studentId: 'S003', name: 'Charlie', isOnline: false, violations: [] },
      };

      render(<SessionDetail />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
    });
  });

  describe('Session Not Found', () => {
    it('should handle null activeSession gracefully without crashing', () => {
      mockHookReturn.activeSession = null;
      mockHookReturn.history = [
        { id: '2', code: 'OTHER1', isActive: false, createdAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T01:00:00Z' },
      ];

      // Should not throw or crash when activeSession is null
      const { container } = render(<SessionDetail />);
      expect(container).toBeTruthy();
    });
  });

  describe('Submissions Fetch', () => {
    it('should fetch submissions on mount', async () => {
      render(<SessionDetail />);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      render(<SessionDetail />);
      // Should not crash despite fetch failure
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      expect(screen.getByText('TEST01')).toBeInTheDocument();
    });

    it('should display empty submissions state', async () => {
      render(<SessionDetail />);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      // With empty data, submissions section should not show count  
      expect(screen.queryByText(/Student Submissions/)).not.toBeInTheDocument();
    });
  });

  describe('End Session Modal Safeguards', () => {
    it('should not end session when cancel is clicked in modal', async () => {
      const user = userEvent.setup();
      render(<SessionDetail />);

      await user.click(screen.getByText('End Session'));
      expect(screen.getByText('End Exam Session?')).toBeInTheDocument();

      // Click Cancel
      await user.click(screen.getByText('Cancel'));

      expect(mockEndSession).not.toHaveBeenCalled();
      // Modal should be closed
      expect(screen.queryByText('End Exam Session?')).not.toBeInTheDocument();
    });

    it('should not show End Session button for ended session', () => {
      mockHookReturn.activeSession = {
        id: '1',
        code: 'TEST01',
        isActive: false,
        createdAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T01:00:00Z',
      };
      render(<SessionDetail />);
      expect(screen.queryByText('End Session')).not.toBeInTheDocument();
    });
  });

  describe('Logout with Active Session Safeguard', () => {
    it('should show warning modal when logging out during active session', async () => {
      const user = userEvent.setup();
      render(<SessionDetail />);

      await user.click(screen.getByText('Logout'));
      expect(screen.getByText('Active Session in Progress')).toBeInTheDocument();
    });

    it('should cancel logout when warning modal is dismissed', async () => {
      const user = userEvent.setup();
      render(<SessionDetail />);

      await user.click(screen.getByText('Logout'));
      expect(screen.getByText('Active Session in Progress')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Active Session in Progress')).not.toBeInTheDocument();
      expect(mockEndSession).not.toHaveBeenCalled();
    });
  });
});
