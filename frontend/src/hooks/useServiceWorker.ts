/**
 * Hook: useServiceWorker
 *
 * Registers the exam monitoring Service Worker and sets up
 * Background Sync so the SW can probe for internet connectivity
 * even when the exam tab is closed.
 *
 * On mount:
 *   1. Registers /exam-sw.js
 *   2. Registers a Background Sync tag "connectivity-probe"
 *
 * Exposes:
 *   - `supported`: whether the browser supports SW + Background Sync
 *   - `registered`: whether registration succeeded
 *   - `requestProbe()`: ask the SW to probe immediately (via postMessage)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { SERVICE_WORKER_PROBE_TIMEOUT_MS } from '../config/constants';

interface UseServiceWorkerResult {
  /** Browser supports Service Workers + Background Sync */
  supported: boolean;
  /** SW was successfully registered and sync tag queued */
  registered: boolean;
  /** Ask the SW to probe internet right now (returns when done) */
  requestProbe: () => Promise<void>;
}

export const useServiceWorker = (): UseServiceWorkerResult => {
  const [supported, setSupported] = useState(false);
  const [registered, setRegistered] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const hasSw = 'serviceWorker' in navigator;
    // Background Sync is only available over HTTPS or localhost
    const hasSync = hasSw && 'SyncManager' in window;
    setSupported(hasSw);

    if (!hasSw) return;

    const register = async (): Promise<void> => {
      try {
        const reg = await navigator.serviceWorker.register('/exam-sw.js', {
          scope: '/',
        });
        registrationRef.current = reg;

        // Wait for the SW to be active before registering sync
        const sw = reg.active ?? reg.installing ?? reg.waiting;
        if (sw && sw.state !== 'activated') {
          await new Promise<void>((resolve) => {
            sw.addEventListener('statechange', function handler() {
              if (sw.state === 'activated') {
                sw.removeEventListener('statechange', handler);
                resolve();
              }
            });
          });
        }

        // Register Background Sync tag
        if (hasSync) {
          try {
            await reg.sync.register('connectivity-probe');
          } catch {
            // Sync registration can fail on HTTP (non-localhost)
            // Gracefully degrade — the on-demand probe via postMessage
            // and the localStorage clock still work.
          }
        }

        setRegistered(true);
      } catch {
        // SW registration failed (e.g. non-HTTPS non-localhost)
        setRegistered(false);
      }
    };

    void register();

    return () => {
      // Do NOT unregister on unmount — the SW must persist across
      // tab closes.  It will be unregistered explicitly when the
      // student logs out / exam ends.
    };
  }, []);

  /**
   * Ask the active Service Worker to probe internet immediately
   * via postMessage.  Returns a promise that resolves when the SW
   * replies with PROBE_COMPLETE.
   */
  const requestProbe = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const sw = registrationRef.current?.active;
      if (!sw) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve();
      }, SERVICE_WORKER_PROBE_TIMEOUT_MS);

      const handler = (event: MessageEvent): void => {
        if (event.data?.type === 'PROBE_COMPLETE') {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve();
        }
      };

      navigator.serviceWorker.addEventListener('message', handler);
      sw.postMessage({ type: 'PROBE_NOW' });
    });
  }, []);

  return { supported, registered, requestProbe };
};
