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

/** Student registration. */
export const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6),
});

/** Violation report from student client. */
export const ViolationSchema = z.object({
  type: z.enum(VALID_VIOLATION_TYPES),
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
