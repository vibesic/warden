import { useState, useEffect } from 'react';
import { CLOCK_TICK_INTERVAL_MS } from '../config/constants';

/**
 * Returns a `Date` that ticks every `intervalMs` milliseconds.
 * Deduplicates the timer-tick pattern used across SessionDetail
 * and SecureExamMonitor.
 */
export const useCurrentTime = (intervalMs: number = CLOCK_TICK_INTERVAL_MS): Date => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    const timer = setInterval(updateTime, intervalMs);

    // Ensure the timer syncs immediately when standard timer throttling is bypassed (e.g. tab becomes active)
    document.addEventListener('visibilitychange', updateTime);
    window.addEventListener('focus', updateTime);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateTime);
      window.removeEventListener('focus', updateTime);
    };
  }, [intervalMs]);

  return currentTime;
};
