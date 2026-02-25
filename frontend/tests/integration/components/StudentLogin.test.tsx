import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudentLogin } from '@src/components/StudentLogin';

describe('StudentLogin', () => {
  const defaultProps = {
    onLogin: vi.fn(),
    onSwitchToTeacher: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should render the login form', () => {
    render(<StudentLogin {...defaultProps} />);
    expect(screen.getByText('Exam Student Login')).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Student ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Session Code')).toBeInTheDocument();
  });

  it('should render Enter Exam submit button', () => {
    render(<StudentLogin {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Enter Exam' })).toBeInTheDocument();
  });

  it('should render teacher switch link', () => {
    render(<StudentLogin {...defaultProps} />);
    expect(screen.getByText('Are you a Teacher?')).toBeInTheDocument();
  });

  it('should call onSwitchToTeacher when link is clicked', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<StudentLogin {...defaultProps} onSwitchToTeacher={onSwitch} />);

    await user.click(screen.getByText('Are you a Teacher?'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('should not submit when fields are empty', async () => {
    const user = userEvent.setup();
    render(<StudentLogin {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Enter Exam' }));
    expect(defaultProps.onLogin).not.toHaveBeenCalled();
  });

  it('should call onLogin with valid session', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ valid: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StudentLogin {...defaultProps} onLogin={onLogin} />);

    await user.type(screen.getByLabelText('Full Name'), 'Alice');
    await user.type(screen.getByLabelText('Student ID'), '12345');
    await user.type(screen.getByLabelText('Session Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enter Exam' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('12345', 'Alice', '123456');
    });
  });

  it('should show error when session is invalid', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ valid: false, reason: 'Session expired' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StudentLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Full Name'), 'Alice');
    await user.type(screen.getByLabelText('Student ID'), '12345');
    await user.type(screen.getByLabelText('Session Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enter Exam' }));

    await waitFor(() => {
      expect(screen.getByText('Session expired')).toBeInTheDocument();
    });
  });

  it('should show connection error when fetch fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    render(<StudentLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Full Name'), 'Alice');
    await user.type(screen.getByLabelText('Student ID'), '12345');
    await user.type(screen.getByLabelText('Session Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enter Exam' }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to validate session. Please check connection.')
      ).toBeInTheDocument();
    });
  });

  it('should show loading state during submission', async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<StudentLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Full Name'), 'Alice');
    await user.type(screen.getByLabelText('Student ID'), '12345');
    await user.type(screen.getByLabelText('Session Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enter Exam' }));

    expect(screen.getByText('Verifying...')).toBeInTheDocument();

    // Resolve to clean up
    resolvePromise!({ json: () => Promise.resolve({ valid: true }) });
    await waitFor(() => {
      expect(screen.queryByText('Verifying...')).not.toBeInTheDocument();
    });
  });

  it('should strip non-numeric characters from Student ID', async () => {
    const user = userEvent.setup();
    render(<StudentLogin {...defaultProps} />);

    const idInput = screen.getByLabelText('Student ID');
    await user.type(idInput, 'a1b2');
    expect(idInput).toHaveValue('12');
  });

  it('should strip non-numeric characters from Session Code', async () => {
    const user = userEvent.setup();
    render(<StudentLogin {...defaultProps} />);

    const codeInput = screen.getByLabelText('Session Code');
    await user.type(codeInput, 'a1b2');
    expect(codeInput).toHaveValue('12');
  });
});
