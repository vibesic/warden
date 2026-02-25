import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmationModal } from '../../../components/common/ConfirmationModal';

describe('ConfirmationModal', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Confirm Action',
    message: 'Are you sure?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should not render when isOpen is false', () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('should render title and message when open', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('should render default confirm and cancel text', () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render custom confirm and cancel text', () => {
    render(
      <ConfirmationModal
        {...defaultProps}
        confirmText="Yes, delete"
        cancelText="No, keep"
      />
    );
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('No, keep')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('should apply danger styles when isDanger is true', () => {
    const { container } = render(
      <ConfirmationModal {...defaultProps} isDanger />
    );
    const iconWrapper = container.querySelector('.bg-red-100');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('should apply indigo styles when isDanger is false', () => {
    const { container } = render(
      <ConfirmationModal {...defaultProps} isDanger={false} />
    );
    const iconWrapper = container.querySelector('.bg-indigo-100');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('should apply danger color to confirm button when isDanger', () => {
    render(<ConfirmationModal {...defaultProps} isDanger />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-red-600');
  });

  it('should apply indigo color to confirm button when not isDanger', () => {
    render(<ConfirmationModal {...defaultProps} isDanger={false} />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-indigo-600');
  });
});
