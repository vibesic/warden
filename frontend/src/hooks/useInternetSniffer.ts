import { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const useInternetSniffer = (checkIntervalMs: number = 5000) => {
  const [isSecure, setIsSecure] = useState<boolean>(true);

  useEffect(() => {
    const checkConnection = async () => {
      let targets: string[] = [];

      try {
        // Fetch dynamic random targets from server
        // This ensures the client never knows the full list
        const res = await fetch(`${API_BASE_URL}/api/check-targets`);

        if (!res.ok) {
          throw new Error('Server unreachable');
        }

        const data = await res.json();
        targets = data.domains || [];
      } catch (err) {
        // If we cannot reach the server to get targets:
        // 1. It might mean we are offline (Secure!)
        // 2. OR server is down (Ambiguous)

        // However, if we fail to fetch fetch targets, we can't perform the check.
        // But if we are offline, we are secure.
        console.warn('[InternetSniffer] Could not fetch targets from server:', err);

        // To be safe, we can try a fallback hardcoded check just in case the student
        // blocked the API but not Google.
        targets = ['https://www.google.com', 'https://www.microsoft.com', 'https://www.apple.com'];
      }

      if (targets.length === 0) return;

      const targetUrls = targets.map(d => `${d}/favicon.ico?t=${Date.now()}`);
      console.log(`[InternetSniffer] Checking: ${targetUrls.join(', ')}`);

      // Check ALL targets concurrently
      // If ANY succeed (resolve), it means we have internet -> VIOLATION

      const checks = targetUrls.map(url =>
        fetch(url, { mode: 'no-cors', cache: 'no-store' })
          .then(() => {
            // Successful fetch = Internet Access = VIOLATION
            return true;
          })
          .catch(() => {
            // Network Error = No Access (Good)
            return false;
          })
      );

      const results = await Promise.all(checks);
      const internetDetected = results.some(r => r === true);

      if (internetDetected) {
        console.warn('Internet connection detected via one of the dynamic targets!');
        setIsSecure(false);
      } else {
        console.log('No internet access on checked targets (Good)');
        setIsSecure(true);
      }
    };

    const interval = setInterval(checkConnection, checkIntervalMs);
    // instant check on mount
    checkConnection();

    return () => clearInterval(interval);
  }, [checkIntervalMs]);

  return { isSecure };
};
