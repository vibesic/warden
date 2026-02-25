/**
 * Mock data factories for test fixtures.
 *
 * Provides typed factory functions that return commonly-used mock
 * objects. Use spread overrides to customise individual fields.
 *
 * Usage:
 *   const session = mockSession({ isActive: false, endedAt: new Date() });
 */

/** Active session with sensible defaults. */
export const mockSession = (overrides?: Record<string, unknown>) => ({
  id: 's1',
  code: '123456',
  isActive: true,
  createdAt: new Date(),
  durationMinutes: 60,
  endedAt: null,
  ...overrides,
});

/** Student identity record. */
export const mockStudent = (overrides?: Record<string, unknown>) => ({
  id: 'stu-1',
  studentId: 'test_student_1',
  name: 'Test Student',
  ...overrides,
});

/** Session-student participation record. */
export const mockSessionStudent = (overrides?: Record<string, unknown>) => ({
  id: 'ss-1',
  studentId: 'stu-1',
  sessionId: 's1',
  isOnline: true,
  lastHeartbeat: new Date(),
  ipAddress: '127.0.0.1',
  student: {
    studentId: 'test_student_1',
    name: 'Test Student',
  },
  ...overrides,
});

/** Violation record. */
export const mockViolation = (overrides?: Record<string, unknown>) => ({
  id: 'v-1',
  sessionStudentId: 'ss-1',
  type: 'DISCONNECTION',
  details: '',
  timestamp: new Date(),
  ...overrides,
});

/** Submission record. */
export const mockSubmission = (overrides?: Record<string, unknown>) => ({
  id: 'sub-1',
  originalName: 'homework.pdf',
  storedName: '1708300000-abc123.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  sessionStudentId: 'ss-1',
  sessionId: 's1',
  createdAt: new Date(),
  ...overrides,
});
