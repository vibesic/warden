import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../../../components/common/Button';

describe('Button', () => {
  it('should render children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should call onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should apply primary variant styles by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button', { name: 'Primary' });
    expect(btn.className).toContain('bg-indigo-600');
  });

  it('should apply danger variant styles', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-red-600');
  });

  it('should apply secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button', { name: 'Secondary' });
    expect(btn.className).toContain('bg-gray-800');
  });

  it('should apply outline variant styles', () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole('button', { name: 'Outline' });
    expect(btn.className).toContain('bg-white');
    expect(btn.className).toContain('border-gray-300');
  });

  it('should apply ghost variant styles', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button', { name: 'Ghost' });
    expect(btn.className).toContain('bg-transparent');
  });

  it('should apply link variant styles without size padding', () => {
    render(<Button variant="link">Link</Button>);
    const btn = screen.getByRole('button', { name: 'Link' });
    expect(btn.className).toContain('underline');
    expect(btn.className).not.toContain('px-4');
  });

  it('should be disabled when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
  });

  it('should show spinner svg when isLoading is true', () => {
    render(<Button isLoading>Saving</Button>);
    const btn = screen.getByRole('button', { name: 'Saving' });
    expect(btn.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('should hide icon when isLoading is true', () => {
    const icon = <span data-testid="icon">I</span>;
    render(<Button isLoading icon={icon}>Save</Button>);
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('should render icon when provided and not loading', () => {
    const icon = <span data-testid="icon">I</span>;
    render(<Button icon={icon}>Action</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });

  it('should not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>No</Button>);

    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should merge custom className', () => {
    render(<Button className="mt-4">Styled</Button>);
    const btn = screen.getByRole('button', { name: 'Styled' });
    expect(btn.className).toContain('mt-4');
  });

  it('should forward extra HTML attributes', () => {
    render(<Button type="submit" data-testid="submit-btn">Go</Button>);
    const btn = screen.getByTestId('submit-btn');
    expect(btn).toHaveAttribute('type', 'submit');
  });
});
