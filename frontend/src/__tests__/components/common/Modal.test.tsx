import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '../../../components/common/Modal';

describe('Modal', () => {
  it('should not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        Hidden content
      </Modal>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('should render children when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Visible content
      </Modal>
    );
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('should render title', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="My Title">
        Body
      </Modal>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('should render footer when provided', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer={<span>Footer</span>}>
        Body
      </Modal>
    );
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose}>
        Content
      </Modal>
    );

    await user.click(screen.getByLabelText('Close'));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose}>
        Content
      </Modal>
    );

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose}>
        Content
      </Modal>
    );

    // Click the backdrop (the fixed overlay div)
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.click(backdrop);
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('should not call onClose on backdrop click when closeOnBackdropClick is false', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} closeOnBackdropClick={false}>
        Content
      </Modal>
    );

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    await user.click(backdrop);
    // Should only be called 0 times for backdrop; escape still works
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('should set body overflow hidden when open', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('should have role dialog and aria-modal', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should apply size classes', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="lg">
        Content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-lg');
  });

  it('should apply xl size class', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="xl">
        Content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-2xl');
  });
});
