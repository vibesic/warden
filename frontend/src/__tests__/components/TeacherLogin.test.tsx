import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeacherLogin } from '../../components/TeacherLogin';

describe('TeacherLogin', () => {
  const defaultProps = {
    onLogin: vi.fn(),
    onSwitchToStudent: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should render the login form with password input', () => {
    render(<TeacherLogin {...defaultProps} />);
    expect(screen.getByText('Teacher Login')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('should render Access Dashboard button', () => {
    render(<TeacherLogin {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Access Dashboard' })).toBeInTheDocument();
  });

  it('should render student switch link', () => {
    render(<TeacherLogin {...defaultProps} />);
    expect(screen.getByText('Back to Student Login')).toBeInTheDocument();
  });

  it('should call onSwitchToStudent when link is clicked', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<TeacherLogin {...defaultProps} onSwitchToStudent={onSwitch} />);

    await user.click(screen.getByText('Back to Student Login'));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('should call onLogin on successful authentication', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, token: 'abc123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TeacherLogin {...defaultProps} onLogin={onLogin} />);

    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledOnce();
    });
    expect(localStorage.getItem('teacherToken')).toBe('abc123');
  });

  it('should display error on invalid password', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, message: 'Invalid password' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TeacherLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid password')).toBeInTheDocument();
    });
  });

  it('should display connection error when fetch fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    render(<TeacherLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Password'), 'test');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to connect to server')).toBeInTheDocument();
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

    render(<TeacherLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Password'), 'test');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    expect(screen.getByText('Authenticating...')).toBeInTheDocument();

    resolvePromise!({ json: () => Promise.resolve({ success: true, token: 'x' }) });
    await waitFor(() => {
      expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
    });
  });

  it('should send POST request with password', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, token: 'tok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TeacherLogin {...defaultProps} />);

    await user.type(screen.getByLabelText('Password'), 'mypass');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/teacher'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'mypass' }),
        })
      );
    });
  });
});
