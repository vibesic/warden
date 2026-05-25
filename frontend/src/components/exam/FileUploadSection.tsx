import React, { useRef, useState } from 'react';
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
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    // Jitter delay to stagger simultaneous uploads
    const delayMs = Math.random() * 3000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionCode', sessionCode);
      formData.append('studentId', studentId);

      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        // Submissions are unique per student per session: the latest upload
        // replaces any previous one, so the local list mirrors that.
        setUploadedFile(data.data);
      } else {
        setUploadError(data.message || 'Upload failed');
      }
    } catch {
      setUploadError('Upload failed. Check your connection.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
        className={`block w-full text-center px-6 py-3 bg-white text-green-700 font-bold rounded-lg cursor-pointer hover:bg-gray-100 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''
          }`}
      >
        {uploading ? 'Uploading...' : uploadedFile ? 'Replace File' : 'Upload File'}
      </label>
      {uploadError && (
        <p className="text-red-200 text-xs text-center mt-2">{uploadError}</p>
      )}
      {uploadedFile && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between bg-white/10 rounded px-3 py-1.5 text-xs">
            <span className="truncate mr-2">{uploadedFile.originalName}</span>
            <span className="text-white/60 whitespace-nowrap">{formatFileSize(uploadedFile.sizeBytes)}</span>
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
