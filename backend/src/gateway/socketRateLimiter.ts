import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface SocketRateLimitConfig {
  /** Maximum burst size (bucket capacity). */
  maxTokens: number;
  /** Tokens added per second. */
  refillRate: number;
}

/**
 * Per-event rate limit configuration (token bucket).
 *
 * These are per-socket, so classroom NAT is not a concern.
 * Limits are tuned as DoS protection only — they should never fire
 * during normal use OR development (HMR reconnects, rapid testing).
 *
 * Normal traffic → Dev worst-case → Limit (headroom)
 *
 *   register ........... 1× on connect → HMR saves every 2–3 s  → 10 burst, 1/s
 *   heartbeat .......... 0.5/s (every 2 s) → same                → 10 burst, 5/s
 *   report_violation ... bursty, on-demand → rapid tab switches   → 20 burst, 2/s
 *   sniffer:response ... 1 per 60 s        → same                → 10 burst, 2/s
 *   student:tab-closing  1× on close       → rapid close/reopen  → 5 burst, 0.5/s
 */
const EVENT_LIMITS: Record<string, SocketRateLimitConfig> = {
  register: { maxTokens: 10, refillRate: 1 },
  heartbeat: { maxTokens: 10, refillRate: 5 },
  report_violation: { maxTokens: 20, refillRate: 2 },
  'sniffer:response': { maxTokens: 10, refillRate: 2 },
  'student:tab-closing': { maxTokens: 5, refillRate: 0.5 },
};

/** Default limit for any event not explicitly configured (teacher events, etc.). */
const DEFAULT_LIMIT: SocketRateLimitConfig = { maxTokens: 20, refillRate: 5 };

/**
 * Per-socket, per-event token bucket rate limiter.
 *
 * Each socket connection maintains its own buckets, so students behind
 * the same NAT (shared IP) are rate-limited independently.
 *
 * Returns `true` if the event is allowed, `false` if it should be dropped.
 */
export const checkSocketRateLimit = (socket: Socket, eventName: string): boolean => {
  const buckets: Map<string, TokenBucket> = socket.data._rateLimitBuckets ??= new Map();
  const config = EVENT_LIMITS[eventName] ?? DEFAULT_LIMIT;
  const now = Date.now();

  let bucket = buckets.get(eventName);
  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    buckets.set(eventName, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsedMs = now - bucket.lastRefill;
  const refillAmount = (elapsedMs / 1000) * config.refillRate;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + refillAmount);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  logger.warn(
    { socketId: socket.id, event: eventName },
    'Socket event rate-limited',
  );
  return false;
};
