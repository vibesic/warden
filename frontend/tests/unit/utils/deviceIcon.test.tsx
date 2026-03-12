import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getDeviceIcon } from '@src/utils/deviceIcon';

describe('getDeviceIcon', () => {
  it('should return Monitor icon for undefined deviceType', () => {
    const { container } = render(getDeviceIcon());
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should return Monitor icon for unknown deviceType', () => {
    const { container } = render(getDeviceIcon('desktop'));
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should return Smartphone icon for mobile', () => {
    const { container } = render(getDeviceIcon('mobile'));
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should return Tablet icon for tablet', () => {
    const { container } = render(getDeviceIcon('tablet'));
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('should respect custom size parameter', () => {
    const { container } = render(getDeviceIcon('mobile', 24));
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });
});
