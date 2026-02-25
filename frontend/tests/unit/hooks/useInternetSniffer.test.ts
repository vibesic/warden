import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ---------- Image class mock -------------------------------------------- */

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';

  static behaviour: 'load' | 'error' = 'error';
  static instanceCount = 0;

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    if (value) {
      MockImage.instanceCount++;
      const self = this;
      Promise.resolve().then(() => {
        if (MockImage.behaviour === 'load' && self.onload) {
          self.onload();
        } else if (MockImage.behaviour === 'error' && self.onerror) {
          self.onerror();
        }
      });
    }
  }
}

describe('useInternetSniffer', () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    vi.useFakeTimers();
    MockImage.instanceCount = 0;
    MockImage.behaviour = 'error';
    globalThis.Image = MockImage as unknown as typeof Image;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Image = originalImage;
  });

  it('should start with isSecure true', async () => {
    MockImage.behaviour = 'error';
    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    const { result } = renderHook(() => useInternetSniffer(5000));

    expect(result.current.isSecure).toBe(true);
  });

  it('should set isSecure to false when internet is detected', async () => {
    MockImage.behaviour = 'load';
    vi.useRealTimers(); // Need real timers for this test since waitFor uses setTimeout
    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    const { result } = renderHook(() => useInternetSniffer(60000));

    // Wait for the initial check to complete (runs immediately on mount)
    await waitFor(() => {
      expect(result.current.isSecure).toBe(false);
    }, { timeout: 2000 });
  });

  it('should remain secure when all probes fail', async () => {
    MockImage.behaviour = 'error';
    vi.useRealTimers(); // Need real timers for waitFor
    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    const { result } = renderHook(() => useInternetSniffer(60000));

    // Wait for the initial check to complete
    await waitFor(() => {
      // Should still be secure after probes fail
      expect(result.current.isSecure).toBe(true);
    }, { timeout: 2000 });
  });

  it('should check at the specified interval', async () => {
    MockImage.behaviour = 'error';
    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    renderHook(() => useInternetSniffer(2000));

    // Initial check creates 3 probes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const afterInitial = MockImage.instanceCount;
    expect(afterInitial).toBeGreaterThanOrEqual(3);

    // Advance by interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(MockImage.instanceCount).toBeGreaterThan(afterInitial);
  });

  it('should clear interval on unmount', async () => {
    MockImage.behaviour = 'error';
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    const { unmount } = renderHook(() => useInternetSniffer(5000));

    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('should resolve false on probe timeout', async () => {
    // Use a mock that never fires onload/onerror — simulating timeout
    class SilentImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      static instanceCount = 0;

      get src() { return this._src; }
      set src(value: string) {
        this._src = value;
        if (value) SilentImage.instanceCount++;
        // Never fires onload or onerror — image just hangs
      }
    }
    SilentImage.instanceCount = 0;
    globalThis.Image = SilentImage as unknown as typeof Image;

    const { useInternetSniffer } = await import('@src/hooks/useInternetSniffer');
    const { result } = renderHook(() => useInternetSniffer(60000));

    // Advance past the 4000ms timeout inside probeWithImage
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Should still be secure since the "Internet" probes timed out (no response)
    expect(result.current.isSecure).toBe(true);
  });
});
