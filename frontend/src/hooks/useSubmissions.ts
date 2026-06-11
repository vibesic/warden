import { useState, useCallback, useEffect } from 'react';
import { apiRoutes, teacherAuthHeaders } from '../config/apiRoutes';
import { SUBMISSION_POLL_INTERVAL_MS } from '../config/constants';
import { extractFetchErrorMessage, isAbortError } from '../utils/fetchErrors';

export interface SubmissionItem {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  student: { studentId: string; name: string };
}

interface UseSubmissionsResult {
  submissions: SubmissionItem[];
  handleDownload: (storedName: string) => void;
  handleDownloadAll: () => Promise<void>;
  isDownloadingAll: boolean;
  downloadAllError: string | null;
}

export const useSubmissions = (sessionCode: string | undefined, pollIntervalMs: number = SUBMISSION_POLL_INTERVAL_MS, externalUpdateTrigger?: number): UseSubmissionsResult => {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadAllError, setDownloadAllError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async (signal?: AbortSignal) => {
    if (!sessionCode) return;
    try {
      const res = await fetch(apiRoutes.submissionsList(sessionCode), {
        headers: teacherAuthHeaders(),
        signal,
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.data);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      // Silently fail — submissions are supplementary
    }
  }, [sessionCode]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSubmissions(controller.signal);

    const interval = setInterval(() => {
      fetchSubmissions();
    }, pollIntervalMs);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchSubmissions, pollIntervalMs, externalUpdateTrigger]);

  const handleDownload = useCallback((storedName: string) => {
    if (!sessionCode) return;
    const token = sessionStorage.getItem('teacherToken') || '';
    window.open(apiRoutes.submissionDownload(sessionCode, storedName, token), '_blank');
  }, [sessionCode]);

  const handleDownloadAll = useCallback(async (): Promise<void> => {
    if (!sessionCode || isDownloadingAll) return;
    setIsDownloadingAll(true);
    setDownloadAllError(null);
    try {
      const res = await fetch(apiRoutes.submissionsDownloadAll(sessionCode), {
        headers: teacherAuthHeaders(),
      });
      if (!res.ok) {
        const message = await extractFetchErrorMessage(res, 'Download failed');
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^"]+)"?/i.exec(disposition);
      const filename = match ? match[1] : `submissions_${sessionCode}.zip`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      setDownloadAllError(message);
    } finally {
      setIsDownloadingAll(false);
    }
  }, [sessionCode, isDownloadingAll]);

  return { submissions, handleDownload, handleDownloadAll, isDownloadingAll, downloadAllError };
};
