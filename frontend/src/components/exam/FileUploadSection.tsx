import React, { useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { formatFileSize } from '../../utils/format';

interface UploadedFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

interface Props {
  sessionCode: string;
  studentId: string;
}

export const FileUploadSection: React.FC<Props> = ({ sessionCode, studentId }) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

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
        setUploadedFiles((prev) => [data.data, ...prev]);
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
        {uploading ? 'Uploading...' : 'Upload File'}
      </label>
      {uploadError && (
        <p className="text-red-200 text-xs text-center mt-2">{uploadError}</p>
      )}
      {uploadedFiles.length > 0 && (
        <div className="mt-3 space-y-1">
          {uploadedFiles.map((f) => (
            <div key={f.id} className="flex items-center justify-between bg-white/10 rounded px-3 py-1.5 text-xs">
              <span className="truncate mr-2">{f.originalName}</span>
              <span className="text-white/60 whitespace-nowrap">{formatFileSize(f.sizeBytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
