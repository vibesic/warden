import { useState, useCallback, useEffect } from 'react';
import { apiRoutes, authHeaders } from '../config/apiRoutes';
import { isAbortError } from '../utils/fetchErrors';
import type { QuestionFileItem } from '../types/exam';

export interface UseQuestionFilesResult {
  questionFiles: QuestionFileItem[];
  questionUploading: boolean;
  questionUploadProgress: number;
  questionUploadError: string;
  fetchQuestionFiles: () => Promise<void>;
  handleQuestionUpload: (file: File, token?: string) => Promise<void>;
  handleQuestionDelete: (fileId: string, token?: string) => Promise<void>;
  handleQuestionDownload: (fileId: string) => void;
}

export const useQuestionFiles = (sessionCode: string, externalUpdateTrigger?: number): UseQuestionFilesResult => {
  const [questionFiles, setQuestionFiles] = useState<QuestionFileItem[]>([]);
  const [questionUploading, setQuestionUploading] = useState(false);
  const [questionUploadProgress, setQuestionUploadProgress] = useState(0);
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
  }, [fetchQuestionFiles, externalUpdateTrigger]);

  const handleQuestionUpload = useCallback(async (file: File, token?: string) => {
    if (!sessionCode) return;
    setQuestionUploading(true);
    setQuestionUploadProgress(0);
    setQuestionUploadError('');

    return new Promise<void>((resolve) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiRoutes.sessionQuestions(sessionCode));

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.max(1, Math.round((event.loaded / event.total) * 100));
          setQuestionUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setQuestionUploadProgress(100);
        setTimeout(() => {
          setQuestionUploading(false);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.success) {
                setQuestionFiles((prev) => [...prev, data.data]);
              } else {
                setQuestionUploadError(data.message || 'Upload failed');
              }
            } catch {
              setQuestionUploadError('Invalid response from server');
            }
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              setQuestionUploadError(data.message || 'Upload failed');
            } catch {
              setQuestionUploadError('Upload failed. Check your connection.');
            }
          }
          resolve();
        }, 500);
      };

      xhr.onerror = () => {
        setQuestionUploading(false);
        setQuestionUploadError('Upload failed. Check your connection.');
        resolve();
      };

      xhr.send(formData);
    });
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
    questionUploadProgress,
    questionUploadError,
    fetchQuestionFiles,
    handleQuestionUpload,
    handleQuestionDelete,
    handleQuestionDownload,
  };
};
