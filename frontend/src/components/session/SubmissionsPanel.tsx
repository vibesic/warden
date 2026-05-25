import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Card } from '../common/Card';
import { Table } from '../common/Table';
import { formatFileSize } from '../../utils/format';
import type { SubmissionItem } from '../../hooks/useSubmissions';

interface SubmissionsPanelProps {
  submissions: SubmissionItem[];
  onDownload: (storedName: string) => void;
  onDownloadAll: () => void;
  isDownloadingAll?: boolean;
  downloadAllError?: string | null;
}

export const SubmissionsPanel: React.FC<SubmissionsPanelProps> = React.memo(({
  submissions,
  onDownload,
  onDownloadAll,
  isDownloadingAll = false,
  downloadAllError = null,
}) => {
  const columns = React.useMemo(() => [
    {
      header: 'Student',
      cell: (s: SubmissionItem) => (
        <div>
          <div className="font-medium text-gray-900">{s.student.name}</div>
          <div className="text-xs font-mono text-gray-500">{s.student.studentId}</div>
        </div>
      ),
    },
    {
      header: 'File',
      cell: (s: SubmissionItem) => (
        <span className="text-gray-800 truncate block max-w-xs" title={s.originalName}>
          {s.originalName}
        </span>
      ),
    },
    {
      header: 'Size',
      cell: (s: SubmissionItem) => (
        <span className="text-gray-600 text-sm">{formatFileSize(s.sizeBytes)}</span>
      ),
    },
    {
      header: 'Uploaded',
      cell: (s: SubmissionItem) => (
        <span className="text-gray-600 text-sm whitespace-nowrap">
          {new Date(s.createdAt).toLocaleTimeString()}
        </span>
      ),
    },
    {
      header: '',
      cell: (s: SubmissionItem) => (
        <button
          onClick={() => onDownload(s.storedName)}
          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
          title="Download"
        >
          <Download size={16} />
        </button>
      ),
    },
  ], [onDownload]);

  if (submissions.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4 pl-6 pr-2 gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          Student Submissions ({submissions.length})
        </h2>
        <div className="flex items-center gap-3">
          {downloadAllError && (
            <span className="text-xs text-red-600" role="alert">{downloadAllError}</span>
          )}
          <button
            type="button"
            onClick={onDownloadAll}
            disabled={isDownloadingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Download all submissions as ZIP"
            aria-busy={isDownloadingAll}
          >
            {isDownloadingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isDownloadingAll ? 'Preparing ZIP...' : 'Download all'}
          </button>
        </div>
      </div>
      <Card className="border-gray-200 overflow-hidden" padding="none">
        <Table
          data={submissions}
          columns={columns}
          keyExtractor={(s: SubmissionItem) => s.id}
          emptyMessage="No submissions yet."
        />
      </Card>
    </section>
  );
});
