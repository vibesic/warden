/**
 * Centralized Zod validation schemas for the Socket.io gateway layer.
 * Moved from studentHandlers.ts and teacherHandlers.ts to a single location.
 */
import { z } from 'zod';

/**
 * Violation types — the 3 distinct categories a teacher sees on the dashboard.
 *
 *   INTERNET_ACCESS  — Student's device reached the public internet.
 *   DISCONNECTION    — Student disconnected from the exam server.
 *   SNIFFER_TIMEOUT  — Student did not respond to a server security check.
 */
export const VALID_VIOLATION_TYPES = [
  'INTERNET_ACCESS',
  'DISCONNECTION',
  'SNIFFER_TIMEOUT',
] as const;

export type ViolationType = (typeof VALID_VIOLATION_TYPES)[number];

/**
 * Granular violation reasons — sub-categorise each violation type so
 * the teacher dashboard can show exactly *what* triggered it.
 *
 * Convention:  VIOLATION_TYPE → REASON(s)
 *
 *   INTERNET_ACCESS  → CLIENT_PROBE | SERVER_SNIFFER
 *   DISCONNECTION    → TAB_CLOSED | NETWORK_LOST | HEARTBEAT_TIMEOUT
 *                      | PING_TIMEOUT | CLIENT_INITIATED | SERVER_INITIATED
 *                      | PROLONGED_ABSENCE
 *   SNIFFER_TIMEOUT  → NO_RESPONSE
 */
export const VALID_VIOLATION_REASONS = [
  // INTERNET_ACCESS reasons
  'CLIENT_PROBE',         // Client-side JavaScript probe detected internet
  'SERVER_SNIFFER',       // Server-side sniffer challenge confirmed reachability

  // DISCONNECTION reasons
  'TAB_CLOSED',           // Student closed browser tab/window (beforeunload signal)
  'NETWORK_LOST',         // WiFi drop, transport error, or network change
  'HEARTBEAT_TIMEOUT',    // No heartbeat received for >120 s (background job)
  'PING_TIMEOUT',         // Server did not receive pong within timeout
  'CLIENT_INITIATED',     // Client called socket.disconnect()
  'SERVER_INITIATED',     // Server forced disconnection
  'PROLONGED_ABSENCE',    // Reconnected after being offline >2 min

  // SNIFFER_TIMEOUT reasons
  'NO_RESPONSE',          // No sniffer challenge response within timeout
] as const;

export type ViolationReason = (typeof VALID_VIOLATION_REASONS)[number];

/**
 * Human-readable descriptions for each violation type and its reasons.
 * Used by the teacher dashboard to explain what the system detected.
 */
export const VIOLATION_DESCRIPTIONS: Record<ViolationType, {
  label: string;
  description: string;
  reasons: Partial<Record<ViolationReason, string>>;
}> = {
  INTERNET_ACCESS: {
    label: 'Internet Access',
    description: 'Student\'s device was able to reach the public internet.',
    reasons: {
      CLIENT_PROBE: 'Client-side JavaScript probe detected internet connectivity.',
      SERVER_SNIFFER: 'Server sent a challenge URL and the student\'s device confirmed it was reachable.',
    },
  },
  DISCONNECTION: {
    label: 'Disconnection',
    description: 'Student disconnected from the exam server.',
    reasons: {
      TAB_CLOSED: 'Student closed the browser tab or window.',
      NETWORK_LOST: 'Network connectivity lost (WiFi drop or transport failure).',
      HEARTBEAT_TIMEOUT: 'No heartbeat received from student for over 2 minutes.',
      PING_TIMEOUT: 'Socket connection timed out (no response from client).',
      CLIENT_INITIATED: 'Student\'s client disconnected explicitly.',
      SERVER_INITIATED: 'Server forced the disconnection.',
      PROLONGED_ABSENCE: 'Student was offline for over 2 minutes then reconnected.',
    },
  },
  SNIFFER_TIMEOUT: {
    label: 'Sniffer Timeout',
    description: 'Student did not respond to a server security check.',
    reasons: {
      NO_RESPONSE: 'No response to sniffer challenge within the timeout period.',
    },
  },
};

/** Student registration. */
export const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6),
});

/** Violation report from student client. */
export const ViolationSchema = z.object({
  type: z.enum(VALID_VIOLATION_TYPES),
  reason: z.enum(VALID_VIOLATION_REASONS).optional(),
  details: z.string().max(500).optional(),
});

/** Sniffer challenge response from student client. */
export const SnifferResponseSchema = z.object({
  challengeId: z.string(),
  reachable: z.boolean(),
});

/** Teacher creates a new exam session. */
export const CreateSessionSchema = z.object({
  durationMinutes: z.number().int().min(1).max(480),
});

/** Teacher joins a specific session view. */
export const JoinSessionSchema = z.object({
  sessionCode: z.string().min(1),
});
