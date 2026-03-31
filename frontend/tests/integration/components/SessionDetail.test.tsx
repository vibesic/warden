import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StudentStatus, Session } from '@src/hooks/useTeacherSocket';

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
  serverTimeOffset: number;
  createSession: ReturnType<typeof vi.fn>;
  endSession: typeof mockEndSession;
};

vi.mock('@src/hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => mockHookReturn,
}));

/* ---------- mock fetch for submissions ---------------------------------- */

let mockFetch: ReturnType<typeof vi.fn>;

/* ---------- import after mocks ------------------------------------------ */

import { SessionDetail } from '@src/components/SessionDetail';

describe('SessionDetail', () => {
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
      serverTimeOffset: 0,
      createSession: vi.fn(),
      endSession: mockEndSession,
    };
    mockNavigate.mockClear();
    mockEndSession.mockClear();
  });

  it('should render session code', () => {
    render(<SessionDetail />);
    expect(screen.getByText('TEST01')).toBeInTheDocument();
  });

  it('should render Session Monitor header for active session', () => {
    render(<SessionDetail />);
    expect(screen.getByText('Session Monitor')).toBeInTheDocument();
  });

  it('should render Session History header for ended session', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: false,
      createdAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T01:00:00Z',
    };

    render(<SessionDetail />);
    expect(screen.getByText('Session History')).toBeInTheDocument();
  });

  it('should show connection status', () => {
    render(<SessionDetail />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show student count for active session', () => {
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [],
      },
      S002: {
        studentId: 'S002',
        name: 'Bob',
        isOnline: false,
        violations: [],
      },
    };

    render(<SessionDetail />);
    expect(screen.getByText(/Connected Students \(1 out of 2\)/)).toBeInTheDocument();
  });

  it('should render filter dropdown with All Students selected by default', () => {
    render(<SessionDetail />);
    const filter = screen.getByLabelText('Filter by status') as HTMLSelectElement;
    expect(filter).toBeInTheDocument();
    expect(filter.value).toBe('all');
  });

  it('should filter to show only online students', async () => {
    const user = userEvent.setup();
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [],
      },
      S002: {
        studentId: 'S002',
        name: 'Bob',
        isOnline: false,
        violations: [],
      },
    };

    render(<SessionDetail />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'online');

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('should filter to show only offline students', async () => {
    const user = userEvent.setup();
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [],
      },
      S002: {
        studentId: 'S002',
        name: 'Bob',
        isOnline: false,
        violations: [],
      },
    };

    render(<SessionDetail />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'offline');

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('should show empty message when filter has no matches', async () => {
    const user = userEvent.setup();
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [],
      },
    };

    render(<SessionDetail />);
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'offline');

    expect(screen.getByText('No offline students.')).toBeInTheDocument();
  });

  it('should render student cards for active session', () => {
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [],
      },
    };

    render(<SessionDetail />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('S001')).toBeInTheDocument();
  });

  it('should show violation count on student card', () => {
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [
          { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
          { type: 'DISCONNECTION', timestamp: '2024-01-01T00:06:00Z' },
        ],
      },
    };

    render(<SessionDetail />);
    expect(screen.getByText('2 Violations')).toBeInTheDocument();
  });

  it('should show waiting message when no students joined yet', () => {
    render(<SessionDetail />);
    expect(screen.getByText('Waiting for students to join...')).toBeInTheDocument();
  });

  it('should show End Session button for active session', () => {
    render(<SessionDetail />);
    expect(screen.getByText('End Session')).toBeInTheDocument();
  });

  it('should show confirmation modal when End Session is clicked', async () => {
    const user = userEvent.setup();
    render(<SessionDetail />);

    await user.click(screen.getByText('End Session'));
    expect(screen.getByText('End Exam Session?')).toBeInTheDocument();
  });

  it('should call endSession and navigate when confirmed', async () => {
    const user = userEvent.setup();
    render(<SessionDetail />);

    // Click the End Session button (the rose-colored one in the session info)
    const endButtons = screen.getAllByText('End Session');
    await user.click(endButtons[0]);

    // After modal opens, ConfirmationModal renders BEFORE the session info in DOM,
    // so the modal confirm button is at index 0 and the original button is at index 1
    const allEndBtns = screen.getAllByText('End Session');
    expect(allEndBtns.length).toBe(2);
    // Click the modal's confirm button (first in DOM order)
    await user.click(allEndBtns[0]);

    expect(mockEndSession).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/teacher');
  });

  it('should navigate back when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<SessionDetail />);

    await user.click(screen.getByTitle('Back'));
    expect(mockNavigate).toHaveBeenCalledWith('/teacher');
  });

  it('should show Student Participation History table for ended session', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: false,
      createdAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T01:00:00Z',
    };
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: false,
        violations: [],
      },
    };

    render(<SessionDetail />);
    expect(screen.getByText('Student Participation History')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('should open violation modal when clicking violations on student card', async () => {
    const user = userEvent.setup();
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: true,
        violations: [
          { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z', details: 'CDN reachable' },
        ],
      },
    };

    render(<SessionDetail />);

    await user.click(screen.getByText('1 Violations'));
    expect(screen.getByText('Violation Log: Alice')).toBeInTheDocument();
    expect(screen.getByText('INTERNET ACCESS')).toBeInTheDocument();
  });

  it('should show elapsed time for active session without duration', () => {
    render(<SessionDetail />);
    expect(screen.getByText('Time Elapsed')).toBeInTheDocument();
  });

  it('should show remaining time for active session with duration', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: true,
      createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), // started 10 min ago
      durationMinutes: 60,
    };

    render(<SessionDetail />);
    expect(screen.getByText('Time Remaining')).toBeInTheDocument();
  });

  it('should navigate to teacher login when logging out from inactive session', async () => {
    const user = userEvent.setup();
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: false,
      createdAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T01:00:00Z',
    };

    render(<SessionDetail />);

    await user.click(screen.getByText('Logout'));
    expect(mockNavigate).toHaveBeenCalledWith('/teacher/login');
  });

  it('should show logout confirmation modal when logging out with active session', async () => {
    const user = userEvent.setup();
    render(<SessionDetail />);

    await user.click(screen.getByText('Logout'));
    expect(screen.getByText('Active Session in Progress')).toBeInTheDocument();
  });

  it('should end session and navigate to login on logout confirmation', async () => {
    const user = userEvent.setup();
    render(<SessionDetail />);

    await user.click(screen.getByText('Logout'));
    await user.click(screen.getByText('End Session & Logout'));

    expect(mockEndSession).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/teacher/login');
  });

  it('should render submissions table when submissions exist', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/questions')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
      }
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: [
            {
              id: 'sub-1',
              originalName: 'answer.pdf',
              storedName: 'abc123.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
              createdAt: '2024-01-01T00:30:00Z',
              student: { studentId: 'S001', name: 'Alice' },
            },
          ],
        }),
      });
    });

    render(<SessionDetail />);

    await waitFor(() => {
      expect(screen.getByText('Student Submissions (1)')).toBeInTheDocument();
    });
    expect(screen.getByText('answer.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('should open download link when download button is clicked', async () => {
    const user = userEvent.setup();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    sessionStorage.setItem('teacherToken', 'my-token');

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/questions')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
      }
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: [
            {
              id: 'sub-1',
              originalName: 'answer.pdf',
              storedName: 'stored-file.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 512,
              createdAt: '2024-01-01T00:30:00Z',
              student: { studentId: 'S001', name: 'Alice' },
            },
          ],
        }),
      });
    });

    render(<SessionDetail />);

    await waitFor(() => {
      expect(screen.getByTitle('Download')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Download'));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('stored-file.pdf'),
      '_blank'
    );
  });

  it('should render started-at date for active session', () => {
    render(<SessionDetail />);
    expect(screen.getByText('Started At')).toBeInTheDocument();
  });

  it('should show End Session button only for active session', () => {
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

  it('should display student history columns for ended session', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: false,
      createdAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T01:00:00Z',
    };
    mockHookReturn.students = {
      S001: {
        studentId: 'S001',
        name: 'Alice',
        isOnline: false,
        violations: [
          { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        ],
        joinedAt: '2024-01-01T00:01:00Z',
        lastSeenAt: '2024-01-01T00:50:00Z',
      },
    };

    render(<SessionDetail />);
    expect(screen.getByText('Student Participation History')).toBeInTheDocument();
    // Should have Violations column in the table header
    expect(screen.getAllByText('Violations').length).toBeGreaterThanOrEqual(1);
  });

  it('should render remaining time in rose when under 5 minutes', () => {
    mockHookReturn.activeSession = {
      id: '1',
      code: 'TEST01',
      isActive: true,
      createdAt: new Date(Date.now() - 58 * 60_000).toISOString(), // 58 min ago
      durationMinutes: 60,
    };

    render(<SessionDetail />);
    expect(screen.getByText('Time Remaining')).toBeInTheDocument();
    // The timer value should have rose color class
    const timerEl = screen.getByText('Time Remaining').nextElementSibling;
    expect(timerEl?.className).toContain('text-rose-500');
  });

  /* ── Question Files ─────────────────────────────────────────── */

  describe('question files', () => {
    const questionResponse = {
      success: true,
      data: [
        { id: 'qf-1', originalName: 'exam-paper.pdf', sizeBytes: 8192, createdAt: '2024-01-01T00:10:00Z' },
      ],
    };

    const urlAwareFetch = (questionsData: unknown, submissionsData: unknown = { success: true, data: [] }) =>
      (url: string) => {
        const body = (url as string).includes('/questions') ? questionsData : submissionsData;
        return Promise.resolve({ json: () => Promise.resolve(body) });
      };

    it('should render question files section with file list', async () => {
      mockFetch.mockImplementation(urlAwareFetch(questionResponse));

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByText('Question Files (1)')).toBeInTheDocument();
      });
      expect(screen.getByText('exam-paper.pdf')).toBeInTheDocument();
      expect(screen.getByText('8.0 KB')).toBeInTheDocument();
    });

    it('should show upload button only for active session', async () => {
      mockFetch.mockImplementation(urlAwareFetch({ success: true, data: [] }));

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByText('Upload Question File')).toBeInTheDocument();
      });
    });

    it('should hide upload button for ended session', async () => {
      mockHookReturn.activeSession = {
        id: '1', code: 'TEST01', isActive: false,
        createdAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T01:00:00Z',
      };
      mockFetch.mockImplementation(urlAwareFetch({ success: true, data: [] }));

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByText('Question Files (0)')).toBeInTheDocument();
      });
      expect(screen.queryByText('Upload Question File')).not.toBeInTheDocument();
    });

    it('should show delete button only for active session', async () => {
      mockFetch.mockImplementation(urlAwareFetch(questionResponse));

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete')).toBeInTheDocument();
      });
    });

    it('should open download link for question file', async () => {
      const user = userEvent.setup();
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      mockFetch.mockImplementation(urlAwareFetch(questionResponse));

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Download').length).toBeGreaterThanOrEqual(1);
      });

      // Click the first Download button (question file)
      const downloadButtons = screen.getAllByTitle('Download');
      await user.click(downloadButtons[0]);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        expect.stringContaining('/questions/qf-1/download'),
        '_blank',
      );
    });

    it('should call delete endpoint and remove file from list', async () => {
      const user = userEvent.setup();
      let deleteCalled = false;
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if ((url as string).includes('/questions') && options?.method === 'DELETE') {
          deleteCalled = true;
          return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
        }
        return urlAwareFetch(questionResponse)(url);
      });

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Delete'));

      await waitFor(() => {
        expect(deleteCalled).toBe(true);
      });
    });

    it('should upload a question file and add to list', async () => {
      const user = userEvent.setup();
      const newFile = { id: 'qf-new', originalName: 'new-q.pdf', sizeBytes: 1024, createdAt: '2024-01-01T00:15:00Z' };
      sessionStorage.setItem('teacherToken', 'test-token');

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if ((url as string).includes('/questions') && options?.method === 'POST') {
          return Promise.resolve({ json: () => Promise.resolve({ success: true, data: newFile }) });
        }
        return urlAwareFetch({ success: true, data: [] })(url);
      });

      render(<SessionDetail />);

      await waitFor(() => {
        expect(screen.getByText('Upload Question File')).toBeInTheDocument();
      });

      const fileInput = document.getElementById('question-file-upload') as HTMLInputElement;
      const file = new File(['content'], 'new-q.pdf', { type: 'application/pdf' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('new-q.pdf')).toBeInTheDocument();
      });
    });
  });
});
