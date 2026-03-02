/**
 * Centralized Zod validation schemas for the Socket.io gateway layer.
 * Moved from studentHandlers.ts and teacherHandlers.ts to a single location.
 */
import { z } from 'zod';

/** Violation type enum shared by schemas and services. */
export const VALID_VIOLATION_TYPES = [
  'INTERNET_ACCESS',
  'DISCONNECTION',
  'CONNECTION_LOST',
  'SNIFFER_TIMEOUT',
] as const;

export type ViolationType = (typeof VALID_VIOLATION_TYPES)[number];

/**
 * Granular violation reasons — sub-categorise each violation type so
 * the teacher dashboard can show exactly *what* triggered it.
 *
 * Convention:  VIOLATION_TYPE.REASON
 *   INTERNET_ACCESS  → CLIENT_PROBE | SERVER_SNIFFER
 *   DISCONNECTION    → TAB_CLOSED | WIFI_LOST | TRANSPORT_ERROR
 *                      | PING_TIMEOUT | HEARTBEAT_TIMEOUT | CLIENT_DISCONNECT
 *                      | SERVER_DISCONNECT
 *   CONNECTION_LOST  → NETWORK_SWITCH
 *   SNIFFER_TIMEOUT  → NO_RESPONSE
 */
export const VALID_VIOLATION_REASONS = [
  // INTERNET_ACCESS reasons
  'CLIENT_PROBE',       // Client-side JavaScript probe detected internet
  'SERVER_SNIFFER',     // Server-side sniffer challenge confirmed reachability

  // DISCONNECTION reasons
  'TAB_CLOSED',         // Student closed browser tab/window (beforeunload signal)
  'WIFI_LOST',          // Transport closed — WiFi drop or network change
  'TRANSPORT_ERROR',    // Network transport error
  'PING_TIMEOUT',       // Server did not receive pong within timeout
  'HEARTBEAT_TIMEOUT',  // No heartbeat received for >120 s (background job)
  'CLIENT_DISCONNECT',  // Client called socket.disconnect()
  'SERVER_DISCONNECT',  // Server forced disconnection

  // CONNECTION_LOST reasons
  'NETWORK_SWITCH',     // Client reconnected after prolonged disconnect (>2 min)

  // SNIFFER_TIMEOUT reasons
  'NO_RESPONSE',        // No sniffer challenge response within timeout
] as const;

export type ViolationReason = (typeof VALID_VIOLATION_REASONS)[number];

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
