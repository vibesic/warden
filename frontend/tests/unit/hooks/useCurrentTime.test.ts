import { renderHook, act } from '@testing-library/react';
import { useCurrentTime } from '@src/hooks/useCurrentTime';

describe('useCurrentTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the initial current time', () => {
    const { result } = renderHook(() => useCurrentTime(1000));
    expect(result.current).toBeInstanceOf(Date);
  });

  it('should update the current time after intervalMs', () => {
    const { result } = renderHook(() => useCurrentTime(1000));
    const initialTime = result.current;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should update on visibilitychange', () => {
    const { result } = renderHook(() => useCurrentTime(1000));
    const initialTime = result.current;

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 5000));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.getTime()).toBeGreaterThan(initialTime.getTime());
  });

  it('should update on focus', () => {
    const { result } = renderHook(() => useCurrentTime(1000));
    const initialTime = result.current;

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 5000));
      window.dispatchEvent(new Event('focus'));
    });

    expect(result.current.getTime()).toBeGreaterThan(initialTime.getTime());
  });
});
