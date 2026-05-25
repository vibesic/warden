import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { SUBMISSION_POLL_INTERVAL_MS } from '../config/constants';

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

export const useSubmissions = (sessionCode: string | undefined, pollIntervalMs: number = SUBMISSION_POLL_INTERVAL_MS): UseSubmissionsResult => {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadAllError, setDownloadAllError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async (signal?: AbortSignal) => {
    if (!sessionCode) return;
    try {
      const token = sessionStorage.getItem('teacherToken') || '';
      const res = await fetch(`${API_BASE_URL}/api/submissions/${sessionCode}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.data);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
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
  }, [fetchSubmissions, pollIntervalMs]);

  const handleDownload = useCallback((storedName: string) => {
    const token = sessionStorage.getItem('teacherToken') || '';
    window.open(`${API_BASE_URL}/api/submissions/${sessionCode}/download/${storedName}?token=${token}`, '_blank');
  }, [sessionCode]);

  const handleDownloadAll = useCallback(async (): Promise<void> => {
    if (!sessionCode || isDownloadingAll) return;
    setIsDownloadingAll(true);
    setDownloadAllError(null);
    try {
      const token = sessionStorage.getItem('teacherToken') || '';
      const res = await fetch(
        `${API_BASE_URL}/api/submissions/${sessionCode}/download-all`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        let message = 'Download failed';
        try {
          const body = await res.json();
          if (body && typeof body.message === 'string') message = body.message;
        } catch {
          // body might not be JSON; keep default message
        }
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
