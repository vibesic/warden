import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Input } from '@src/components/common/Input';

describe('Input', () => {
  it('should render an input element', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('should render label when provided', () => {
    render(<Input label="Username" />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('should associate label with input via htmlFor', () => {
    render(<Input label="Email" id="email-input" />);
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', 'email-input');
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'email-input');
  });

  it('should generate a random id when not provided', () => {
    render(<Input label="Auto ID" />);
    const input = screen.getByRole('textbox');
    expect(input.id).toMatch(/^input-/);
  });

  it('should render error message when error prop is set', () => {
    render(<Input error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('should set aria-invalid when error is present', () => {
    render(<Input error="Invalid" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('should set aria-describedby linking to error element', () => {
    render(<Input id="test-input" error="Error text" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-error');
    expect(screen.getByText('Error text')).toHaveAttribute('id', 'test-input-error');
  });

  it('should not set aria-invalid when no error', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });

  it('should apply error styling classes when error is set', () => {
    render(<Input error="Bad input" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-red-300');
  });

  it('should call onChange handler', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    await user.type(screen.getByRole('textbox'), 'a');
    expect(handleChange).toHaveBeenCalled();
  });

  it('should forward additional HTML attributes', () => {
    render(<Input data-testid="custom-input" maxLength={10} required />);
    const input = screen.getByTestId('custom-input');
    expect(input).toHaveAttribute('maxlength', '10');
    expect(input).toBeRequired();
  });

  it('should merge custom className on input', () => {
    render(<Input className="text-center" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('text-center');
  });

  it('should apply containerClassName', () => {
    const { container } = render(<Input containerClassName="mt-8" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('mt-8');
  });
});
