import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../../hooks/useTeacherSocket';

/* ---------- mock react-router-dom --------------------------------------- */

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

/* ---------- mock useTeacherSocket --------------------------------------- */

const mockCreateSession = vi.fn();
const mockEndSession = vi.fn();
let mockHookReturn: {
  isConnected: boolean;
  activeSession: Session | null;
  history: Session[];
  students: Record<string, unknown>;
  createSession: typeof mockCreateSession;
  endSession: typeof mockEndSession;
};

vi.mock('../../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => mockHookReturn,
}));

/* ---------- import after mocks ------------------------------------------ */

import { TeacherDashboard } from '../../components/TeacherDashboard';

describe('TeacherDashboard', () => {
  const onLogout = vi.fn();

  beforeEach(() => {
    mockHookReturn = {
      isConnected: true,
      activeSession: null,
      history: [],
      students: {},
      createSession: mockCreateSession,
      endSession: mockEndSession,
    };
    mockNavigate.mockClear();
    mockCreateSession.mockClear();
    mockEndSession.mockClear();
    onLogout.mockClear();
  });

  it('should render the dashboard header', () => {
    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('Proctor Dashboard')).toBeInTheDocument();
  });

  it('should show connection status', () => {
    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show "No Active Session" when no active session', () => {
    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('No Active Session')).toBeInTheDocument();
    expect(screen.getByText(/Ready to start a new exam/)).toBeInTheDocument();
  });

  it('should show create session button when no active session', () => {
    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('Create New Session')).toBeInTheDocument();
  });

  it('should not call createSession when no duration is entered', async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard onLogout={onLogout} />);

    const button = screen.getByText('Create New Session');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('should call createSession with duration when duration is entered', async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard onLogout={onLogout} />);

    const durationInput = screen.getByPlaceholderText('Duration');
    await user.type(durationInput, '60');
    await user.click(screen.getByText('Create New Session'));

    expect(mockCreateSession).toHaveBeenCalledWith(60);
  });

  it('should show active session card when session exists', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: '123456',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('123456')).toBeInTheDocument();
    expect(screen.getByText('Exam In Progress')).toBeInTheDocument();
  });

  it('should navigate to session detail when See Details is clicked', async () => {
    const user = userEvent.setup();
    mockHookReturn.activeSession = {
      id: '1',
      code: '123456',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('See Details'));
    expect(mockNavigate).toHaveBeenCalledWith('/teacher/session/123456');
  });

  it('should render session history table', () => {
    mockHookReturn.history = [
      {
        id: '2',
        code: '654321',
        isActive: false,
        createdAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T01:00:00Z',
        studentCount: 5,
      },
    ];

    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('654321')).toBeInTheDocument();
  });

  it('should show empty history message when no sessions', () => {
    render(<TeacherDashboard onLogout={onLogout} />);
    expect(screen.getByText('No past sessions found.')).toBeInTheDocument();
  });

  it('should call onLogout directly when no active session', async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('Logout'));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('should show confirmation modal when logging out with active session', async () => {
    const user = userEvent.setup();
    mockHookReturn.activeSession = {
      id: '1',
      code: '123456',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('Logout'));
    expect(screen.getByText('Active Session in Progress')).toBeInTheDocument();
  });

  it('should end session and logout when confirmation is confirmed', async () => {
    const user = userEvent.setup();
    mockHookReturn.activeSession = {
      id: '1',
      code: '123456',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('Logout'));
    await user.click(screen.getByText('End Session & Logout'));

    expect(mockEndSession).toHaveBeenCalledOnce();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('should navigate to session detail after creating session', async () => {
    const user = userEvent.setup();

    const { rerender } = render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('Create New Session'));

    // Simulate activeSession arriving (like socket responding)
    mockHookReturn.activeSession = {
      id: '1',
      code: 'NEW001',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    rerender(<TeacherDashboard onLogout={onLogout} />);

    expect(mockNavigate).toHaveBeenCalledWith('/teacher/session/NEW001');
  });

  it('should only show inactive sessions in history table', () => {
    mockHookReturn.history = [
      {
        id: '1',
        code: 'ACTIVE1',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        code: 'ENDED1',
        isActive: false,
        createdAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T01:00:00Z',
        studentCount: 3,
      },
    ];

    render(<TeacherDashboard onLogout={onLogout} />);
    // Active session should NOT appear in history table
    expect(screen.queryByText('ACTIVE1')).not.toBeInTheDocument();
    // Ended session should appear
    expect(screen.getByText('ENDED1')).toBeInTheDocument();
  });

  it('should navigate to session detail on history row click', async () => {
    const user = userEvent.setup();
    mockHookReturn.history = [
      {
        id: '2',
        code: '654321',
        isActive: false,
        createdAt: '2024-01-01T00:00:00Z',
        endedAt: '2024-01-01T01:00:00Z',
        studentCount: 5,
      },
    ];

    render(<TeacherDashboard onLogout={onLogout} />);

    await user.click(screen.getByText('654321'));
    expect(mockNavigate).toHaveBeenCalledWith('/teacher/session/654321');
  });
});
