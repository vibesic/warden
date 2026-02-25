import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../../../components/layout/Header';

describe('Header', () => {
  const defaultProps = {
    title: 'Dashboard',
    isConnected: true,
    onLogout: vi.fn(),
  };

  it('should render the title', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('should show Connected when isConnected is true', () => {
    render(<Header {...defaultProps} isConnected={true} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show Disconnected when isConnected is false', () => {
    render(<Header {...defaultProps} isConnected={false} />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('should show green dot when connected', () => {
    const { container } = render(<Header {...defaultProps} isConnected={true} />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot).toBeInTheDocument();
  });

  it('should show red dot when disconnected', () => {
    const { container } = render(<Header {...defaultProps} isConnected={false} />);
    const dot = container.querySelector('.bg-red-500');
    expect(dot).toBeInTheDocument();
  });

  it('should call onLogout when Logout button is clicked', async () => {
    const user = userEvent.setup();
    const handleLogout = vi.fn();
    render(<Header {...defaultProps} onLogout={handleLogout} />);

    await user.click(screen.getByText('Logout'));
    expect(handleLogout).toHaveBeenCalledOnce();
  });

  it('should not show back button by default', () => {
    render(<Header {...defaultProps} />);
    expect(screen.queryByTitle('Back')).not.toBeInTheDocument();
  });

  it('should show back button when showBack is true and onBack is provided', () => {
    render(<Header {...defaultProps} showBack={true} onBack={vi.fn()} />);
    expect(screen.getByTitle('Back')).toBeInTheDocument();
  });

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const handleBack = vi.fn();
    render(<Header {...defaultProps} showBack={true} onBack={handleBack} />);

    await user.click(screen.getByTitle('Back'));
    expect(handleBack).toHaveBeenCalledOnce();
  });

  it('should not show back button when showBack is true but onBack is not provided', () => {
    render(<Header {...defaultProps} showBack={true} />);
    expect(screen.queryByTitle('Back')).not.toBeInTheDocument();
  });
});
