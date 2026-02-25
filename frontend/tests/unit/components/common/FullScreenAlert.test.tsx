import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FullScreenAlert } from '@src/components/common/FullScreenAlert';

describe('FullScreenAlert', () => {
  it('should render title', () => {
    render(<FullScreenAlert title="Alert Title" />);
    expect(screen.getByText('Alert Title')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    render(<FullScreenAlert title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    const { container } = render(<FullScreenAlert title="Title" />);
    // Only the title heading should exist
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('should render message when provided', () => {
    render(<FullScreenAlert title="T" message="Important message" />);
    expect(screen.getByText('Important message')).toBeInTheDocument();
  });

  it('should render children', () => {
    render(
      <FullScreenAlert title="Alert">
        <button>Action</button>
      </FullScreenAlert>
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('should apply danger variant styles by default', () => {
    const { container } = render(<FullScreenAlert title="Danger" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('bg-red-600');
    expect(wrapper.className).toContain('text-white');
  });

  it('should apply success variant styles', () => {
    const { container } = render(<FullScreenAlert title="OK" variant="success" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('bg-green-600');
  });

  it('should apply info variant styles', () => {
    const { container } = render(<FullScreenAlert title="Info" variant="info" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('bg-blue-600');
  });

  it('should apply warning variant styles', () => {
    const { container } = render(<FullScreenAlert title="Warn" variant="warning" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('bg-yellow-500');
  });

  it('should have fixed full-screen positioning', () => {
    const { container } = render(<FullScreenAlert title="Full" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('inset-0');
    expect(wrapper.className).toContain('z-50');
  });

  it('should animate the title', () => {
    render(<FullScreenAlert title="Bouncy" />);
    const heading = screen.getByText('Bouncy');
    expect(heading.className).toContain('animate-bounce');
  });
});
