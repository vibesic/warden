import { useState, useEffect } from 'react';

export const useInternetSniffer = (checkIntervalMs: number = 5000) => {
  const [isSecure, setIsSecure] = useState<boolean>(true); // Default assume secure/no-internet? Or unknown.
  // Actually, better to default to true (no violation) until proven otherwise.

  useEffect(() => {
    const checkConnection = async () => {
      try {
        // Try to fetch a highly available public resource
        // mode: 'no-cors' needed to avoid CORS errors block, but allow network success to pass
        await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
          mode: 'no-cors',
          cache: 'no-store'
        });

        // If we reach here, the fetch completed (even if 404 or opaque), meaning Internet IS accessible.
        console.warn('Internet connection detected!');
        setIsSecure(false);
      } catch (error) {
        // Fetch failed (network error) -> This is what we want!
        // console.log('No internet (Good)');
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
