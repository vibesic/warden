import React from 'react';
import { Download } from 'lucide-react';
import { Card } from '../common/Card';
import { Table } from '../common/Table';
import { formatFileSize } from '../../utils/format';
import type { SubmissionItem } from '../../hooks/useSubmissions';

interface SubmissionsPanelProps {
  submissions: SubmissionItem[];
  onDownload: (storedName: string) => void;
}

export const SubmissionsPanel: React.FC<SubmissionsPanelProps> = React.memo(({
  submissions,
  onDownload,
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
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">
        Student Submissions ({submissions.length})
      </h2>
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
