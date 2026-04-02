import { useState, useEffect, useCallback, useRef } from 'react';
import { setWorkerInterval, clearWorkerInterval } from '../utils/workerTimer';
import {
  IMAGE_PROBE_TIMEOUT_MS,
  INTERNET_SNIFFER_DEFAULT_INTERVAL_MS,
  PROBE_SAMPLE_COUNT,
  PROBE_TARGETS,
} from '../config/constants';

/**
 * Probes a URL by loading it as an image.
 * Resolves `true` if the resource loads (internet reachable), `false` if it fails.
 * This is more reliable than `fetch` with `mode: 'no-cors'` because:
 * - `<img>` fires `onload` only on actual successful network responses
 * - `onerror` fires on network failures (no internet)
 * - Not affected by opaque response ambiguity
 */
const probeWithImage = (url: string, timeoutMs: number = IMAGE_PROBE_TIMEOUT_MS): Promise<boolean> => {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      resolve(false); // Timeout = no internet (good)
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(true); // Loaded = internet detected (violation)
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(false); // Error = no internet (good)
    };

    img.src = url;
  });
};

// PROBE_TARGETS imported from config/constants

export const useInternetSniffer = (checkIntervalMs: number = INTERNET_SNIFFER_DEFAULT_INTERVAL_MS) => {
  const [isSecure, setIsSecure] = useState<boolean>(true);
  const runningRef = useRef(false);

  const checkConnection = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      // Pick random targets from hardcoded list
      const shuffled = [...PROBE_TARGETS].sort(() => 0.5 - Math.random());
      const targets = shuffled.slice(0, PROBE_SAMPLE_COUNT);

      // Use favicon.ico with cache-busting for each target
      const targetUrls = targets.map(d => `${d}/favicon.ico?t=${Date.now()}`);

      // Check ALL targets concurrently using <img> probes
      const results = await Promise.all(targetUrls.map(url => probeWithImage(url)));
      const internetDetected = results.some(r => r === true);

      if (internetDetected) {
        setIsSecure(false);
      } else {
        setIsSecure(true);
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = setWorkerInterval(checkConnection, checkIntervalMs);
    checkConnection();
    return () => clearWorkerInterval(interval);
  }, [checkIntervalMs, checkConnection]);

  return { isSecure };
};
