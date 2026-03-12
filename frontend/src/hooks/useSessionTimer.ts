import { useCallback } from 'react';
import { useCurrentTime } from './useCurrentTime';
import { formatHMS } from '../utils/format';

interface UseSessionTimerResult {
  formatElapsedTime: (start: string) => string;
  formatRemainingTime: (start: string, durationMin: number) => string;
  getRemainingMs: (start: string, durationMin: number) => number;
}

export const useSessionTimer = (serverTimeOffset: number = 0): UseSessionTimerResult => {
  const currentTime = useCurrentTime();

  const formatElapsedTime = useCallback((start: string): string => {
    const serverNow = currentTime.getTime() + serverTimeOffset;
    return formatHMS(serverNow - new Date(start).getTime());
  }, [currentTime, serverTimeOffset]);

  const formatRemainingTime = useCallback((start: string, durationMin: number): string => {
    const endsAt = new Date(start).getTime() + durationMin * 60_000;
    const serverNow = currentTime.getTime() + serverTimeOffset;
    return formatHMS(endsAt - serverNow);
  }, [currentTime, serverTimeOffset]);

  const getRemainingMs = useCallback((start: string, durationMin: number): number => {
    const endsAt = new Date(start).getTime() + durationMin * 60_000;
    const serverNow = currentTime.getTime() + serverTimeOffset;
    return endsAt - serverNow;
  }, [currentTime, serverTimeOffset]);

  return { formatElapsedTime, formatRemainingTime, getRemainingMs };
};
