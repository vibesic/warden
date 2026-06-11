import React, { useRef, useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import { formatFileSize } from '../../utils/format';
import { useExamSession } from '../../contexts/ExamSessionContext';

interface UploadedFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
  replaced?: { count: number; previousCreatedAt: string | null };
}

export const FileUploadSection: React.FC = React.memo(() => {
  const { sessionCode, studentId } = useExamSession();
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch existing submission on mount
    const fetchSubmission = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/upload/${encodeURIComponent(sessionCode)}/${encodeURIComponent(studentId)}`);
        const data = await res.json();
        if (data.success && data.data) {
          setUploadedFile(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch initial submission metadata', err);
      }
    };
    fetchSubmission();
  }, [sessionCode, studentId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');

    // Jitter delay to stagger simultaneous uploads
    const delayMs = Math.random() * 3000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionCode', sessionCode);
    formData.append('studentId', studentId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/upload`);

    let currentVisualProgress = 0;
    let actualProgress = 0;
    let isUploadComplete = false;
    let xhrStatus = 0;
    let xhrResponseText = '';
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const finalizeUpload = () => {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (xhrStatus >= 200 && xhrStatus < 300) {
        try {
          const data = JSON.parse(xhrResponseText);
          if (data.success) {
            setUploadedFile(data.data);
          } else {
            setUploadError(data.message || 'Upload failed');
          }
        } catch {
          setUploadError('Invalid response from server');
        }
      } else {
        try {
          const data = JSON.parse(xhrResponseText);
          setUploadError(data.message || 'Upload failed');
        } catch {
          setUploadError('Upload failed. Check your connection.');
        }
      }
    };

    intervalId = setInterval(() => {
      if (isUploadComplete && currentVisualProgress >= 100) {
        if (intervalId) clearInterval(intervalId);
        setTimeout(() => finalizeUpload(), 500);
        return;
      }

      // Fast track to 100 if actual is done, otherwise approach actual or 90
      if (isUploadComplete) {
        currentVisualProgress += 20; // catch up faster when done
      } else {
        const increment = Math.floor(Math.random() * 10) + 5; // 5% to 15%
        currentVisualProgress += increment;
        const cap = Math.max(90, actualProgress);
        if (currentVisualProgress > cap) {
          currentVisualProgress = cap;
        }
      }

      if (currentVisualProgress > 100) currentVisualProgress = 100;
      setUploadProgress(currentVisualProgress);
    }, 100);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        actualProgress = Math.round((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      isUploadComplete = true;
      xhrStatus = xhr.status;
      xhrResponseText = xhr.responseText;
    };

    xhr.onerror = () => {
      if (intervalId) clearInterval(intervalId);
      setUploading(false);
      setUploadError('Upload failed. Check your connection.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    xhr.send(formData);
  };

  const formatPreviousTime = (iso: string | null): string => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto mb-6">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        className="hidden"
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className={`block w-full text-center px-6 py-3 bg-white text-green-700 font-bold rounded-lg cursor-pointer hover:bg-gray-100 transition-colors relative overflow-hidden ${uploading ? 'opacity-50 pointer-events-none' : ''
          }`}
      >
        {uploading && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-green-200 transition-all duration-200 ease-out z-0"
            style={{ width: `${uploadProgress}%` }}
          />
        )}
        <span className="relative z-10">
          {uploading ? (uploadProgress === 0 ? 'Preparing...' : `Uploading... ${uploadProgress}%`) : uploadedFile ? 'Replace File' : 'Upload File'}
        </span>
      </label>
      {uploadError && (
        <p className="text-red-200 text-xs text-center mt-2">{uploadError}</p>
      )}
      {uploadedFile && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between bg-white/10 rounded px-3 py-1.5 text-xs">
            <a
              href={`${API_BASE_URL}/api/upload/${encodeURIComponent(sessionCode)}/${encodeURIComponent(studentId)}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate mr-2 hover:underline text-blue-300 flex-1 flex items-center"
              title="Download your submission"
            >
              <svg className="w-4 h-4 mr-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {uploadedFile.originalName}
            </a>
            <span className="text-white/60 whitespace-nowrap ml-2">{formatFileSize(uploadedFile.sizeBytes)}</span>
          </div>
          {uploadedFile.replaced && uploadedFile.replaced.count > 0 && (
            <p className="text-white/70 text-xs text-center">
              Replaced previous submission
              {uploadedFile.replaced.previousCreatedAt
                ? ` from ${formatPreviousTime(uploadedFile.replaced.previousCreatedAt)}`
                : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
