import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

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
}

export const useSubmissions = (sessionCode: string | undefined, pollIntervalMs: number = 15000): UseSubmissionsResult => {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);

  const fetchSubmissions = useCallback(async () => {
    if (!sessionCode) return;
    try {
      const token = localStorage.getItem('teacherToken') || '';
      const res = await fetch(`${API_BASE_URL}/api/submissions/${sessionCode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions(data.data);
      }
    } catch {
      // Silently fail — submissions are supplementary
    }
  }, [sessionCode]);

  useEffect(() => {
    fetchSubmissions();
    const interval = setInterval(fetchSubmissions, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchSubmissions, pollIntervalMs]);

  const handleDownload = useCallback((storedName: string) => {
    const token = localStorage.getItem('teacherToken') || '';
    window.open(`${API_BASE_URL}/api/submissions/${sessionCode}/download/${storedName}?token=${token}`, '_blank');
  }, [sessionCode]);

  return { submissions, handleDownload };
};
