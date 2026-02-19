import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Probes a URL by loading it as an image.
 * Resolves `true` if the resource loads (internet reachable), `false` if it fails.
 * This is more reliable than `fetch` with `mode: 'no-cors'` because:
 * - `<img>` fires `onload` only on actual successful network responses
 * - `onerror` fires on network failures (no internet)
 * - Not affected by opaque response ambiguity
 */
const probeWithImage = (url: string, timeoutMs: number = 4000): Promise<boolean> => {
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

export const useInternetSniffer = (checkIntervalMs: number = 5000) => {
  const [isSecure, setIsSecure] = useState<boolean>(true);

  const checkConnection = useCallback(async () => {
    let targets: string[] = [];

    try {
      const res = await fetch(`${API_BASE_URL}/api/check-targets`);

      if (!res.ok) {
        throw new Error('Server unreachable');
      }

      const data = await res.json();
      targets = data.domains || [];
    } catch {
      // If server unreachable, use hardcoded fallbacks
      targets = ['https://www.google.com', 'https://www.microsoft.com', 'https://www.apple.com'];
    }

    if (targets.length === 0) return;

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
  }, []);

  useEffect(() => {
    const interval = setInterval(checkConnection, checkIntervalMs);
    checkConnection();
    return () => clearInterval(interval);
  }, [checkIntervalMs, checkConnection]);

  return { isSecure };
};
