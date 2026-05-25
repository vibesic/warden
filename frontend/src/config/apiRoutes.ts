import { API_BASE_URL } from './api';

/**
 * Centralized API route builders.
 * Keep all backend paths and query strings in one place so callers never
 * concatenate URLs by hand.
 */
export const apiRoutes = {
  authVerify: (): string => `${API_BASE_URL}/api/auth/verify`,

  submissionsList: (sessionCode: string): string =>
    `${API_BASE_URL}/api/submissions/${sessionCode}`,

  submissionDownload: (sessionCode: string, storedName: string, token: string): string =>
    `${API_BASE_URL}/api/submissions/${sessionCode}/download/${storedName}?token=${encodeURIComponent(token)}`,

  submissionsDownloadAll: (sessionCode: string): string =>
    `${API_BASE_URL}/api/submissions/${sessionCode}/download-all`,

  sessionQuestions: (sessionCode: string): string =>
    `${API_BASE_URL}/api/session/${sessionCode}/questions`,

  sessionQuestion: (sessionCode: string, fileId: string): string =>
    `${API_BASE_URL}/api/session/${sessionCode}/questions/${fileId}`,

  sessionQuestionDownload: (sessionCode: string, fileId: string): string =>
    `${API_BASE_URL}/api/session/${sessionCode}/questions/${fileId}/download`,
};

/**
 * Builds the standard Bearer auth header used for teacher-authenticated
 * fetch requests. Returns an empty object if no token is available so callers
 * can spread it unconditionally.
 */
export const authHeaders = (token?: string | null): Record<string, string> => {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/**
 * Convenience: read the teacher token from sessionStorage and return
 * { Authorization } headers ready to spread into a fetch init.
 */
export const teacherAuthHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const token = sessionStorage.getItem('teacherToken');
  return authHeaders(token);
};
