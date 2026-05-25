import { useState, useCallback, useEffect } from 'react';
import { apiRoutes, authHeaders } from '../config/apiRoutes';
import { isAbortError } from '../utils/fetchErrors';
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

  const fetchQuestionFiles = useCallback(async (signal?: AbortSignal) => {
    if (!sessionCode) return;
    try {
      const res = await fetch(apiRoutes.sessionQuestions(sessionCode), {
        signal
      });
      const data = await res.json();
      if (data.success) {
        setQuestionFiles(data.data);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      // Silently fail
    }
  }, [sessionCode]);

  useEffect(() => {
    const controller = new AbortController();
    fetchQuestionFiles(controller.signal);
    return () => controller.abort();
  }, [fetchQuestionFiles]);

  const handleQuestionUpload = useCallback(async (file: File, token?: string) => {
    if (!sessionCode) return;
    setQuestionUploading(true);
    setQuestionUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(apiRoutes.sessionQuestions(sessionCode), {
        method: 'POST',
        headers: authHeaders(token),
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
      const res = await fetch(apiRoutes.sessionQuestion(sessionCode, fileId), {
        method: 'DELETE',
        headers: authHeaders(token),
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
    window.open(apiRoutes.sessionQuestionDownload(sessionCode, fileId), '_blank');
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
