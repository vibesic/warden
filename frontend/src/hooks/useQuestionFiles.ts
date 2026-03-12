import { useState, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import type { QuestionFileItem } from '../types/exam';

interface UseQuestionFilesResult {
  questionFiles: QuestionFileItem[];
  questionUploading: boolean;
  questionUploadError: string;
  fetchQuestionFiles: () => Promise<void>;
  handleQuestionUpload: (file: File, token?: string) => Promise<void>;
  handleQuestionDelete: (fileId: string, token?: string) => Promise<void>;
  handleQuestionDownload: (fileId: string) => void;
}

export const useQuestionFiles = (sessionCode: string): UseQuestionFilesResult => {
  const [questionFiles, setQuestionFiles] = useState<QuestionFileItem[]>([]);
  const [questionUploading, setQuestionUploading] = useState(false);
  const [questionUploadError, setQuestionUploadError] = useState('');

  const fetchQuestionFiles = useCallback(async () => {
    if (!sessionCode) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/session/${sessionCode}/questions`);
      const data = await res.json();
      if (data.success) {
        setQuestionFiles(data.data);
      }
    } catch {
      // Silently fail
    }
  }, [sessionCode]);

  useEffect(() => {
    fetchQuestionFiles();
  }, [fetchQuestionFiles]);

  const handleQuestionUpload = useCallback(async (file: File, token?: string) => {
    if (!sessionCode) return;
    setQuestionUploading(true);
    setQuestionUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/session/${sessionCode}/questions`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setQuestionFiles((prev) => [...prev, data.data]);
      } else {
        setQuestionUploadError(data.message || 'Upload failed');
      }
    } catch {
      setQuestionUploadError('Upload failed. Check your connection.');
    } finally {
      setQuestionUploading(false);
    }
  }, [sessionCode]);

  const handleQuestionDelete = useCallback(async (fileId: string, token?: string) => {
    if (!sessionCode) return;
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/session/${sessionCode}/questions/${fileId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setQuestionFiles((prev) => prev.filter((f) => f.id !== fileId));
      }
    } catch {
      // Silently fail
    }
  }, [sessionCode]);

  const handleQuestionDownload = useCallback((fileId: string) => {
    window.open(`${API_BASE_URL}/api/session/${sessionCode}/questions/${fileId}/download`, '_blank');
  }, [sessionCode]);

  return {
    questionFiles,
    questionUploading,
    questionUploadError,
    fetchQuestionFiles,
    handleQuestionUpload,
    handleQuestionDelete,
    handleQuestionDownload,
  };
};
