/** Socket.io reconnection configuration */
export const SOCKET_RECONNECTION_ATTEMPTS = 50;
export const SOCKET_RECONNECTION_DELAY_MS = 2000;
export const SOCKET_RECONNECTION_DELAY_MAX_MS = 10000;

/** Heartbeat interval sent to server */
export const HEARTBEAT_INTERVAL_MS = 2000;

/** Violation report cooldown to avoid flooding */
export const VIOLATION_REPORT_COOLDOWN_MS = 10000;

/** Internet sniffer configuration */
export const INTERNET_SNIFFER_DEFAULT_INTERVAL_MS = 5000;
export const INTERNET_SNIFFER_EXAM_INTERVAL_MS = 2000;
export const IMAGE_PROBE_TIMEOUT_MS = 4000;
export const PROBE_SAMPLE_COUNT = 3;
export const PROBE_TARGETS = [
  'https://www.google.com',
  'https://www.microsoft.com',
  'https://www.apple.com',
  'https://www.cloudflare.com',
  'https://www.amazon.com',
] as const;

/** Service worker probe timeout */
export const SERVICE_WORKER_PROBE_TIMEOUT_MS = 6000;

/** Challenge probe timeout in exam socket */
export const CHALLENGE_PROBE_TIMEOUT_MS = 4000;

/** Continuity clock configuration */
export const CONTINUITY_TICK_INTERVAL_MS = 1000;
export const RTT_JITTER_THRESHOLD_MS = 100;

/** Current time hook default interval */
export const CLOCK_TICK_INTERVAL_MS = 1000;

/** Submission polling default interval */
export const SUBMISSION_POLL_INTERVAL_MS = 15000;
