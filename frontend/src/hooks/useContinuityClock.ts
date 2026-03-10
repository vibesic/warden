/**
 * Hook: useContinuityClock
 *
 * Writes a "last alive" timestamp to localStorage every second while
 * the exam app is running.  On mount (i.e. when the student re-opens
 * or reconnects to the app) it reads the previous timestamp and
 * calculates the gap — proving how long the app was dead.
 *
 * Also captures a basic network fingerprint (effectiveType, downlink,
 * rtt) so changes in network characteristics can corroborate a
 * WiFi switch.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const LS_KEY_LAST_ALIVE = 'exam_lastAlive';
const LS_KEY_NET_TYPE = 'exam_networkType';
const LS_KEY_DOWNLINK = 'exam_downlink';
const LS_KEY_RTT = 'exam_rtt';
const LS_KEY_SESSION = 'exam_sessionCode';

/** Minimum gap (ms) worth reporting. Ignore trivial sub-10s jitter. */
const MIN_REPORTABLE_GAP_MS = 10_000;

export interface NetworkSnapshot {
  effectiveType: string;
  downlink: number;
  rtt: number;
}

export interface ContinuityGap {
  /** Timestamp (ms) when the app was last alive before the gap */
  lastAliveAt: number;
  /** Timestamp (ms) when the app resumed (now) */
  resumedAt: number;
  /** Duration of the gap in ms */
  durationMs: number;
  /** Network snapshot stored before the gap (may differ from current) */
  previousNetwork: NetworkSnapshot | null;
  /** Network snapshot right now */
  currentNetwork: NetworkSnapshot | null;
  /** True if network fingerprint changed significantly */
  networkChanged: boolean;
}

/**
 * Read the current network information from `navigator.connection`.
 * Returns null if the API is not available.
 */
const getNetworkSnapshot = (): NetworkSnapshot | null => {
  const conn = (navigator as NavigatorWithConnection).connection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType ?? 'unknown',
    downlink: conn.downlink ?? -1,
    rtt: conn.rtt ?? -1,
  };
};

/** NavigatorConnection types (not in all TS libs) */
interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

/**
 * Determine if two snapshots differ enough to suggest a network switch.
 * A change in effectiveType or large shift in downlink/rtt is evidence.
 */
const didNetworkChange = (
  prev: NetworkSnapshot | null,
  curr: NetworkSnapshot | null,
): boolean => {
  if (!prev || !curr) return false;
  if (prev.effectiveType !== curr.effectiveType) return true;
  // downlink changed by >50%
  if (prev.downlink > 0 && curr.downlink > 0) {
    const ratio = curr.downlink / prev.downlink;
    if (ratio < 0.5 || ratio > 2.0) return true;
  }
  // rtt changed by >100ms
  if (prev.rtt >= 0 && curr.rtt >= 0) {
    if (Math.abs(curr.rtt - prev.rtt) > 100) return true;
  }
  return false;
};

interface UseContinuityClockResult {
  /** The gap detected on mount (null if no significant gap) */
  gap: ContinuityGap | null;
  /** Clear the gap after it has been reported */
  clearGap: () => void;
}

export const useContinuityClock = (sessionCode: string): UseContinuityClockResult => {
  const [gap, setGap] = useState<ContinuityGap | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On mount: detect gap from previous session
  useEffect(() => {
    const storedSession = localStorage.getItem(LS_KEY_SESSION);
    const storedAlive = localStorage.getItem(LS_KEY_LAST_ALIVE);

    // Only compare if same session code (don't cross-contaminate sessions)
    if (storedSession === sessionCode && storedAlive) {
      const lastAliveAt = Number(storedAlive);
      const resumedAt = Date.now();
      const durationMs = resumedAt - lastAliveAt;

      if (durationMs >= MIN_REPORTABLE_GAP_MS) {
        const previousNetwork: NetworkSnapshot | null = (() => {
          const type = localStorage.getItem(LS_KEY_NET_TYPE);
          const dl = localStorage.getItem(LS_KEY_DOWNLINK);
          const rt = localStorage.getItem(LS_KEY_RTT);
          if (!type) return null;
          return {
            effectiveType: type,
            downlink: dl ? Number(dl) : -1,
            rtt: rt ? Number(rt) : -1,
          };
        })();

        const currentNetwork = getNetworkSnapshot();

        setGap({
          lastAliveAt,
          resumedAt,
          durationMs,
          previousNetwork,
          currentNetwork,
          networkChanged: didNetworkChange(previousNetwork, currentNetwork),
        });
      }
    }

    // Store session code
    localStorage.setItem(LS_KEY_SESSION, sessionCode);
    // Run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick: update "last alive" every second
  useEffect(() => {
    const tick = (): void => {
      localStorage.setItem(LS_KEY_LAST_ALIVE, String(Date.now()));
      const snap = getNetworkSnapshot();
      if (snap) {
        localStorage.setItem(LS_KEY_NET_TYPE, snap.effectiveType);
        localStorage.setItem(LS_KEY_DOWNLINK, String(snap.downlink));
        localStorage.setItem(LS_KEY_RTT, String(snap.rtt));
      }
    };

    tick(); // immediate
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const clearGap = useCallback(() => {
    setGap(null);
  }, []);

  return { gap, clearGap };
};
