/**
 * Shared formatting utilities.
 *
 * Eliminates duplication of formatFileSize, formatDuration,
 * and formatCountdown that were previously copy-pasted across
 * SessionDetail, TeacherDashboard, and SecureExamMonitor.
 */

/** Human-readable file size (e.g. "1.5 MB"). */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Duration between two ISO strings (e.g. "12m 34s").
 * Returns "-" when either date is missing or the diff is negative.
 */
export const formatDuration = (start?: string, end?: string): string => {
  if (!start || !end) return '-';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff < 0) return '-';
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Format a millisecond diff as HH:MM:SS.
 * Returns '00:00:00' when diff <= 0.
 */
export const formatHMS = (diffMs: number): string => {
  if (diffMs <= 0) return '00:00:00';
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
