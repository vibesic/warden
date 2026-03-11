import rateLimit from 'express-rate-limit';

/*
 * Rate limits are per-IP and exist purely as DoS protection.
 *
 * Design principle: limits should NEVER fire during legitimate use —
 * including development, testing, and a full 50-student classroom
 * behind a single NAT. They only activate during obvious abuse
 * (hundreds of requests per second from automated tools).
 *
 * A real DoS attack sends 100–10 000+ req/s.
 * Our most generous limit (5000/15 min ≈ 5.5 req/s sustained)
 * still catches that while giving normal usage 10–50× headroom.
 *
 * Socket.io traffic goes to /socket.io/ (not /api/) and is unaffected.
 */

/**
 * Auth endpoint limiter (teacher login).
 * Password is a full string — even at 200/15 min (800/hour) brute-force
 * is completely impractical. Generous limit accommodates repeated
 * testing, multiple teachers, and page reloads.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

/**
 * Session code validation limiter.
 * 6-digit codes = 1M possibilities. At 1000/15 min brute-force would
 * take ~1,042 hours — still completely impractical. Easily accommodates
 * 50 students + developer testing.
 */
export const sessionValidationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

/**
 * General API limiter for all /api/* endpoints.
 * Covers file uploads, downloads, polling, and all other API traffic.
 *
 * Worst-case legitimate ≈ 636 req/15 min (50-student classroom).
 * Development adds rapid page reloads, hot-module replacement,
 * and test scripts — easily 2–3× normal traffic.
 * Set to 5000 for comfortable headroom while still catching DoS.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
