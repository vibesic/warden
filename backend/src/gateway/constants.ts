/**
 * Shared timing constants for the Socket.io gateway layer.
 *
 * Centralises the magic numbers that were previously scattered
 * across studentHandlers.ts, backgroundJobs.ts, and helpers.ts.
 */

/** Grace period before a disconnect is recorded as a violation (ms). */
export const DISCONNECT_GRACE_MS = 45_000;

/** Interval between pending-disconnect sweep passes (ms). */
export const PENDING_DISCONNECT_SWEEP_INTERVAL_MS = 60_000;

/** Interval between heartbeat-checker runs (ms). */
export const HEARTBEAT_CHECK_INTERVAL_MS = 60_000;

/** A student is considered "dead" if no heartbeat for this long (ms). */
export const HEARTBEAT_DEAD_THRESHOLD_MS = 120_000;

/** Interval between sniffer challenge broadcasts (ms). */
export const SNIFFER_CHALLENGE_INTERVAL_MS = 60_000;

/** Time to wait for a sniffer challenge response before flagging (ms). */
export const SNIFFER_RESPONSE_TIMEOUT_MS = 15_000;

/** Interval between session-timer expiry checks (ms). */
export const TIMER_CHECK_INTERVAL_MS = 3_000;

/** Cooldown for DISCONNECTION violations per student (ms). */
export const DISCONNECTION_COOLDOWN_MS = 300_000;
