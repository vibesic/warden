import React, { useRef } from 'react';
import { Download, Upload, Trash2, FileText } from 'lucide-react';
import { Card } from '../common/Card';
import { Table } from '../common/Table';
import { formatFileSize } from '../../utils/format';
import type { QuestionFileItem } from '../../types/exam';

interface QuestionFilesPanelProps {
  questionFiles: QuestionFileItem[];
  isActive: boolean;
  questionUploading: boolean;
  questionUploadError: string;
  onUpload: (file: File, token?: string) => Promise<void>;
  onDelete: (fileId: string, token?: string) => Promise<void>;
  onDownload: (fileId: string) => void;
}

export const QuestionFilesPanel: React.FC<QuestionFilesPanelProps> = ({
  questionFiles,
  isActive,
  questionUploading,
  questionUploadError,
  onUpload,
  onDelete,
  onDownload,
}) => {
  const questionFileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = sessionStorage.getItem('teacherToken') || '';
    await onUpload(file, token);
    if (questionFileInputRef.current) questionFileInputRef.current.value = '';
  };

  const handleDelete = async (fileId: string) => {
    const token = sessionStorage.getItem('teacherToken') || '';
    await onDelete(fileId, token);
  };

  return (
    <section className="mt-8">
      <div className="flex justify-between items-center mb-4 px-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          Question Files ({questionFiles.length})
        </h2>
        {isActive && (
          <div>
            <input
              ref={questionFileInputRef}
              type="file"
              onChange={handleInputChange}
              className="hidden"
              id="question-file-upload"
            />
            <label
              htmlFor="question-file-upload"
              className={`inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors ${questionUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Upload size={14} />
              {questionUploading ? 'Uploading...' : 'Upload Question File'}
            </label>
          </div>
        )}
      </div>
      {questionUploadError && (
        <p className="text-red-500 text-xs px-6 mb-2">{questionUploadError}</p>
      )}
      <Card className="border-gray-200 overflow-hidden" padding="none">
        {questionFiles.length > 0 ? (
          <Table
            data={questionFiles}
            columns={[
              {
                header: 'File',
                cell: (f: QuestionFileItem) => (
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-gray-800 truncate max-w-xs" title={f.originalName}>
                      {f.originalName}
                    </span>
                  </div>
                ),
              },
              {
                header: 'Size',
                cell: (f: QuestionFileItem) => (
                  <span className="text-gray-600 text-sm">{formatFileSize(f.sizeBytes)}</span>
                ),
              },
              {
                header: 'Uploaded',
                cell: (f: QuestionFileItem) => (
                  <span className="text-gray-600 text-sm whitespace-nowrap">
                    {new Date(f.createdAt).toLocaleTimeString()}
                  </span>
                ),
              },
              {
                header: '',
                cell: (f: QuestionFileItem) => (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDownload(f.id)}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    {isActive && (
                      <button
                        onClick={() => handleDelete(f.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            keyExtractor={(f: QuestionFileItem) => f.id}
            emptyMessage=""
          />
        ) : (
          <div className="py-8 text-center text-gray-400 text-sm">
            {isActive
              ? 'No question files uploaded yet. Use the button above to add files.'
              : 'No question files were uploaded for this session.'}
          </div>
        )}
      </Card>
    </section>
  );
};
