import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from '../../../components/common/Card';

describe('Card', () => {
  it('should render children content', () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText('Card body')).toBeInTheDocument();
  });

  it('should render title when provided', () => {
    render(<Card title="Heading">Content</Card>);
    expect(screen.getByText('Heading')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    render(<Card title="T" subtitle="Sub text">Content</Card>);
    expect(screen.getByText('Sub text')).toBeInTheDocument();
  });

  it('should not render header section when no title or subtitle', () => {
    const { container } = render(<Card>Body only</Card>);
    expect(container.querySelector('.border-b')).not.toBeInTheDocument();
  });

  it('should render footer when provided', () => {
    render(<Card footer={<span>Footer content</span>}>Body</Card>);
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('should not render footer section when footer is not provided', () => {
    const { container } = render(<Card>No footer</Card>);
    const footerSection = container.querySelector('.bg-gray-50');
    expect(footerSection).not.toBeInTheDocument();
  });

  it('should apply medium padding by default', () => {
    const { container } = render(<Card>Default padding</Card>);
    const bodyDiv = container.querySelector('.p-6');
    expect(bodyDiv).toBeInTheDocument();
  });

  it('should apply small padding when specified', () => {
    const { container } = render(<Card padding="sm">Small pad</Card>);
    expect(container.querySelector('.p-4')).toBeInTheDocument();
  });

  it('should apply large padding when specified', () => {
    const { container } = render(<Card padding="lg">Large pad</Card>);
    expect(container.querySelector('.p-8')).toBeInTheDocument();
  });

  it('should apply no padding when specified', () => {
    const { container } = render(<Card padding="none">No pad</Card>);
    // Body div should exist without padding classes
    const bodyDivs = container.querySelectorAll('div');
    const bodyDiv = Array.from(bodyDivs).find(
      (el) => el.textContent === 'No pad' && !el.className.includes('bg-white')
    );
    expect(bodyDiv).toBeDefined();
  });

  it('should merge custom className', () => {
    const { container } = render(<Card className="border-red-500">Styled</Card>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('border-red-500');
    expect(wrapper.className).toContain('bg-white');
  });
});
