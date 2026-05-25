/**
 * Centralized room-name builders for the Socket.io gateway.
 *
 * Keeping room name construction in one place prevents typos and makes
 * future renames safe (rename here, every caller follows automatically).
 *
 * Rooms used by the gateway:
 * - `session:<code>`               — everyone in a session (students + teachers)
 * - `student:session:<code>`       — only student sockets in a session
 * - `teacher:session:<code>`       — only teacher dashboards for a session
 * - `sessionStudent:<id>`          — all sockets belonging to a single
 *                                   sessionStudent record (used to count
 *                                   active connections for that student).
 */

export const roomNames = {
  session: (sessionCode: string): string => `session:${sessionCode}`,
  studentSession: (sessionCode: string): string => `student:session:${sessionCode}`,
  teacherSession: (sessionCode: string): string => `teacher:session:${sessionCode}`,
  sessionStudent: (sessionStudentId: string): string => `sessionStudent:${sessionStudentId}`,
};
