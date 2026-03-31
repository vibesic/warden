import React, { useCallback } from 'react';
import { API_BASE_URL } from '../../config/api';
import { formatFileSize } from '../../utils/format';
import { useExamSession } from '../../contexts/ExamSessionContext';

export type { QuestionFileItem } from '../../types/exam';

export const QuestionFileList: React.FC = React.memo(() => {
  const { sessionCode, questionFiles } = useExamSession();
  const handleDownload = useCallback((fileId: string) => {
    window.open(`${API_BASE_URL}/api/session/${sessionCode}/questions/${fileId}/download`, '_blank');
  }, [sessionCode]);

  if (questionFiles.length === 0) return null;

  return (
    <div className="w-full max-w-sm mx-auto mb-6">
      <h3 className="text-sm font-bold text-center mb-3 opacity-90">Question Files</h3>
      <div className="space-y-1.5">
        {questionFiles.map((f) => (
          <button
            key={f.id}
            onClick={() => handleDownload(f.id)}
            className="flex items-center justify-between w-full bg-white/10 hover:bg-white/20 rounded px-3 py-2 text-xs transition-colors"
          >
            <span className="truncate mr-2">{f.originalName}</span>
            <span className="text-white/60 whitespace-nowrap">{formatFileSize(f.sizeBytes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
