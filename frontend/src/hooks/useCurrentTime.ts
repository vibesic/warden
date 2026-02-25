import { useState, useEffect } from 'react';

/**
 * Returns a `Date` that ticks every `intervalMs` milliseconds.
 * Deduplicates the timer-tick pattern used across SessionDetail
 * and SecureExamMonitor.
 */
export const useCurrentTime = (intervalMs: number = 1000): Date => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return currentTime;
};
