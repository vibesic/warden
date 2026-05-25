/**
 * Pending disconnect manager.
 *
 * Owns the in-memory map of pending-disconnect timers and the periodic
 * sweep that prunes stale entries. Extracted from `studentHandlers.ts`
 * so the socket handler stays focused on event wiring.
 *
 * When a student socket disconnects we schedule a delayed "disconnect"
 * action after a grace period. If the same studentId re-registers (or
 * `cancelPendingDisconnect` is called) within that window, the pending
 * action is cancelled.
 */
import { logger } from '../utils/logger';
import { DISCONNECT_GRACE_MS, PENDING_DISCONNECT_SWEEP_INTERVAL_MS } from './constants';

interface PendingDisconnect {
  timer: NodeJS.Timeout;
  createdAt: number;
  cancelled: boolean;
}

let disconnectGraceMs = DISCONNECT_GRACE_MS;
const pendingDisconnects = new Map<string, PendingDisconnect>();
let sweepInterval: NodeJS.Timeout | null = null;

/**
 * Override the grace period duration. Intended for tests so they do not
 * have to wait the full duration.
 */
export const setDisconnectGraceMs = (ms: number): void => {
  disconnectGraceMs = ms;
};

/** Current grace period (ms). */
export const getDisconnectGraceMs = (): number => disconnectGraceMs;

/**
 * Start a periodic sweep that removes stale pending entries. Acts as a
 * safety net if a setTimeout callback never fires.
 */
export const startPendingDisconnectSweep = (): void => {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    const now = Date.now();
    const maxAge = disconnectGraceMs * 2;
    for (const [studentId, entry] of pendingDisconnects) {
      if (now - entry.createdAt > maxAge) {
        entry.cancelled = true;
        clearTimeout(entry.timer);
        pendingDisconnects.delete(studentId);
        logger.warn({ studentId }, 'Stale pending disconnect entry swept');
      }
    }
  }, PENDING_DISCONNECT_SWEEP_INTERVAL_MS);
};

/** Stop the pending disconnect sweep. Called on shutdown and in tests. */
export const stopPendingDisconnectSweep = (): void => {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
};

/**
 * Cancel a pending disconnect for a student. Called when the student
 * re-registers within the grace window. Returns true if an entry was
 * actually cancelled.
 */
export const cancelPendingDisconnect = (studentId: string): boolean => {
  const entry = pendingDisconnects.get(studentId);
  if (entry && !entry.cancelled) {
    entry.cancelled = true;
    clearTimeout(entry.timer);
    pendingDisconnects.delete(studentId);
    logger.info({ studentId }, 'Reconnected within grace period — disconnect violation cancelled');
    return true;
  }
  return false;
};

/** Cancel every pending entry. Intended for test teardown. */
export const clearAllPendingDisconnects = (): void => {
  for (const entry of pendingDisconnects.values()) {
    entry.cancelled = true;
    clearTimeout(entry.timer);
  }
  pendingDisconnects.clear();
};

/** Pending disconnect count, exposed for testing. */
export const getPendingDisconnectCount = (): number => pendingDisconnects.size;

/**
 * Schedule a delayed action for a student disconnect. The action will
 * run after the configured grace period unless `cancelPendingDisconnect`
 * is called first.
 *
 * The action receives an `isCancelled()` helper that callers should
 * consult between awaits — the entry stays in the map during async work
 * so a late reconnection can still flag it as cancelled.
 */
export const schedulePendingDisconnect = (
  studentId: string,
  action: (helpers: { isCancelled: () => boolean }) => Promise<void>,
): void => {
  const entry: PendingDisconnect = {
    timer: null as unknown as NodeJS.Timeout,
    createdAt: Date.now(),
    cancelled: false,
  };

  entry.timer = setTimeout(async () => {
    try {
      if (entry.cancelled) return;
      await action({ isCancelled: () => entry.cancelled });
    } catch (error) {
      logger.error({ error, studentId }, 'Error in disconnect grace period handler');
    } finally {
      pendingDisconnects.delete(studentId);
    }
  }, disconnectGraceMs);

  pendingDisconnects.set(studentId, entry);
};
