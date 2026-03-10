/**
 * Unit tests for the useServiceWorker hook.
 *
 * Since jsdom does not provide a real Service Worker environment,
 * we mock the navigator.serviceWorker API to test the hook's
 * registration logic, Background Sync setup, and requestProbe()
 * messaging flow.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useServiceWorker } from '@src/hooks/useServiceWorker';

/* ------------------------------------------------------------------ */
/*  Mock Service Worker API                                           */
/* ------------------------------------------------------------------ */

interface MockSWRegistration {
  active: { postMessage: ReturnType<typeof vi.fn>; state: string } | null;
  installing: null;
  waiting: null;
  sync: { register: ReturnType<typeof vi.fn> };
}

let mockRegistration: MockSWRegistration;
let messageListeners: Array<(event: MessageEvent) => void>;

const setupSWMock = (options?: { registerThrows?: boolean; syncThrows?: boolean }): void => {
  messageListeners = [];
  mockRegistration = {
    active: { postMessage: vi.fn(), state: 'activated' },
    installing: null,
    waiting: null,
    sync: {
      register: options?.syncThrows
        ? vi.fn().mockRejectedValue(new Error('sync not allowed'))
        : vi.fn().mockResolvedValue(undefined),
    },
  };

  const registerFn = options?.registerThrows
    ? vi.fn().mockRejectedValue(new Error('SW registration failed'))
    : vi.fn().mockResolvedValue(mockRegistration);

  Object.defineProperty(navigator, 'serviceWorker', {
    writable: true,
    configurable: true,
    value: {
      register: registerFn,
      addEventListener: vi.fn((_event: string, handler: (event: MessageEvent) => void) => {
        messageListeners.push(handler);
      }),
      removeEventListener: vi.fn((_event: string, handler: (event: MessageEvent) => void) => {
        messageListeners = messageListeners.filter(h => h !== handler);
      }),
      ready: Promise.resolve(mockRegistration),
    },
  });

  // SyncManager must exist for the hook to attempt sync registration
  Object.defineProperty(window, 'SyncManager', {
    writable: true,
    configurable: true,
    value: class SyncManager { },
  });
};

const removeSWMock = (): void => {
  // Fully remove the property so 'serviceWorker' in navigator is false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).serviceWorker;
  // @ts-expect-error — cleaning up test global
  delete window.SyncManager;
};

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('useServiceWorker', () => {
  afterEach(() => {
    removeSWMock();
  });

  describe('when Service Workers are supported', () => {
    beforeEach(() => {
      setupSWMock();
    });

    it('should set supported to true', async () => {
      const { result } = renderHook(() => useServiceWorker());

      // Wait for async registration
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.supported).toBe(true);
    });

    it('should register the service worker at /exam-sw.js', async () => {
      renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/exam-sw.js', { scope: '/' });
    });

    it('should register the connectivity-probe sync tag', async () => {
      renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(mockRegistration.sync.register).toHaveBeenCalledWith('connectivity-probe');
    });

    it('should set registered to true after successful registration', async () => {
      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.registered).toBe(true);
    });

    it('should gracefully handle sync registration failure', async () => {
      removeSWMock();
      setupSWMock({ syncThrows: true });

      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Should still be registered (SW itself succeeded)
      expect(result.current.registered).toBe(true);
    });

    it('should wait for SW to activate when in installing state', async () => {
      removeSWMock();
      messageListeners = [];

      // Create a SW that starts in `installing` state
      type StateHandler = () => void;
      let stateChangeHandler: StateHandler | null = null;
      const installingSW = {
        postMessage: vi.fn(),
        state: 'installing' as string,
        addEventListener: vi.fn((_event: string, handler: StateHandler) => {
          stateChangeHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };

      const reg = {
        active: null,
        installing: installingSW,
        waiting: null,
        sync: { register: vi.fn().mockResolvedValue(undefined) },
      };

      Object.defineProperty(navigator, 'serviceWorker', {
        writable: true,
        configurable: true,
        value: {
          register: vi.fn().mockResolvedValue(reg),
          addEventListener: vi.fn((_event: string, handler: (event: MessageEvent) => void) => {
            messageListeners.push(handler);
          }),
          removeEventListener: vi.fn(),
          ready: Promise.resolve(reg),
        },
      });

      Object.defineProperty(window, 'SyncManager', {
        writable: true,
        configurable: true,
        value: class SyncManager { },
      });

      const { result } = renderHook(() => useServiceWorker());

      // Give time for register() to be called
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      // SW should have had statechange listener registered
      expect(installingSW.addEventListener).toHaveBeenCalledWith(
        'statechange',
        expect.any(Function)
      );

      // Simulate the SW transitioning to activated
      installingSW.state = 'activated';
      await act(async () => {
        stateChangeHandler?.();
        await new Promise(r => setTimeout(r, 20));
      });

      expect(result.current.registered).toBe(true);
      expect(reg.sync.register).toHaveBeenCalledWith('connectivity-probe');
    });
  });

  describe('when Service Workers are NOT supported', () => {
    beforeEach(() => {
      // Do NOT set up the SW mock — navigator.serviceWorker is undefined
      removeSWMock();
    });

    it('should set supported to false', () => {
      const { result } = renderHook(() => useServiceWorker());
      expect(result.current.supported).toBe(false);
    });

    it('should set registered to false', () => {
      const { result } = renderHook(() => useServiceWorker());
      expect(result.current.registered).toBe(false);
    });
  });

  describe('when SW registration fails', () => {
    beforeEach(() => {
      setupSWMock({ registerThrows: true });
    });

    it('should set registered to false', async () => {
      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(result.current.registered).toBe(false);
    });
  });

  describe('requestProbe', () => {
    beforeEach(() => {
      setupSWMock();
    });

    it('should send PROBE_NOW message to the active SW', async () => {
      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Start the probe
      let probeResolved = false;
      const probePromise = result.current.requestProbe().then(() => {
        probeResolved = true;
      });

      // Simulate SW responding
      await act(async () => {
        messageListeners.forEach(h =>
          h(new MessageEvent('message', { data: { type: 'PROBE_COMPLETE' } }))
        );
        await probePromise;
      });

      expect(probeResolved).toBe(true);
      expect(mockRegistration.active!.postMessage).toHaveBeenCalledWith({ type: 'PROBE_NOW' });
    });

    it('should resolve immediately if no active SW', async () => {
      mockRegistration.active = null;

      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      // Should resolve without hanging
      await act(async () => {
        await result.current.requestProbe();
      });
    });

    it('should resolve on timeout if SW does not respond', async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() => useServiceWorker());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const probePromise = result.current.requestProbe();

      // Advance past the 6s timeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000);
      });

      await probePromise;
      // If we get here without hanging, the timeout worked

      vi.useRealTimers();
    });
  });
});
