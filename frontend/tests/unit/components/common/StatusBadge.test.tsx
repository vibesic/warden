import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@src/components/common/StatusBadge';

describe('StatusBadge', () => {
  it('should render default text based on status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should capitalize first letter of status when no text provided', () => {
    render(<StatusBadge status="warning" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('should render custom text when provided', () => {
    render(<StatusBadge status="error" text="3 issues" />);
    expect(screen.getByText('3 issues')).toBeInTheDocument();
  });

  it('should apply active variant styles', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-700');
  });

  it('should apply error variant styles', () => {
    const { container } = render(<StatusBadge status="error" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-700');
  });

  it('should apply inactive variant styles', () => {
    const { container } = render(<StatusBadge status="inactive" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-gray-100');
  });

  it('should apply warning variant styles', () => {
    const { container } = render(<StatusBadge status="warning" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('should apply success variant styles', () => {
    const { container } = render(<StatusBadge status="success" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('bg-green-50');
  });

  it('should render pulse dot when pulse is true', () => {
    const { container } = render(<StatusBadge status="active" pulse />);
    const pulseDot = container.querySelector('.animate-pulse');
    expect(pulseDot).toBeInTheDocument();
  });

  it('should not render pulse dot when pulse is false', () => {
    const { container } = render(<StatusBadge status="active" pulse={false} />);
    const pulseDot = container.querySelector('.animate-pulse');
    expect(pulseDot).not.toBeInTheDocument();
  });

  it('should render static dot for online status without pulse', () => {
    const { container } = render(<StatusBadge status="online" />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot).toBeInTheDocument();
  });

  it('should render static dot for offline status without pulse', () => {
    const { container } = render(<StatusBadge status="offline" />);
    const dot = container.querySelector('.bg-gray-400');
    expect(dot).toBeInTheDocument();
  });

  it('should merge custom className', () => {
    const { container } = render(<StatusBadge status="active" className="ml-2" />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('ml-2');
  });
});
