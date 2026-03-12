import React from 'react';
import type { StudentStatus, Violation } from '../../hooks/useTeacherSocket';
import { Card } from '../common/Card';
import { Table, TableColumn } from '../common/Table';
import { StatusBadge } from '../common/StatusBadge';
import { formatDuration } from '../../utils/format';
import { getDeviceIcon } from '../../utils/deviceIcon';

interface StudentHistoryTableProps {
  students: StudentStatus[];
  onSelectStudent: (student: { name: string; violations: Violation[] }) => void;
}

export const StudentHistoryTable: React.FC<StudentHistoryTableProps> = ({
  students,
  onSelectStudent,
}) => {
  const columns: TableColumn<StudentStatus>[] = [
    {
      header: 'Name',
      className: 'font-medium text-gray-900',
      cell: (s) => s.name || 'Unknown',
    },
    {
      header: 'Student ID',
      cell: (s) => <span className="font-mono text-gray-600">{s.studentId}</span>,
    },
    {
      header: 'Device',
      cell: (s) => (
        <div className="flex items-center gap-1.5 text-gray-500" title={`${s.deviceOs || 'Unknown'} · ${s.deviceBrowser || 'Unknown'}`}>
          {getDeviceIcon(s.deviceType)}
          <span className="text-xs">{s.deviceOs || 'Unknown'}</span>
        </div>
      ),
    },
    {
      header: 'Violations',
      cell: (s) => s.violations.length > 0 ? (
        <div
          onClick={() => onSelectStudent({ name: s.name || s.studentId, violations: s.violations })}
          className="cursor-pointer inline-block"
        >
          <StatusBadge status="error" text={`${s.violations.length}`} />
        </div>
      ) : (
        <StatusBadge status="success" text="Clean" />
      ),
    },
    {
      header: 'Join Time',
      cell: (s) => s.joinedAt ? new Date(s.joinedAt).toLocaleTimeString() : '-',
    },
    {
      header: 'Exit Time',
      cell: (s) => s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleTimeString() : '-',
    },
    {
      header: 'Duration',
      cell: (s) => formatDuration(s.joinedAt, s.lastSeenAt),
    },
  ];

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">Student Participation History</h2>
      <Card className="border-gray-200 overflow-hidden" padding="none">
        <Table
          data={students}
          columns={columns}
          keyExtractor={(s) => s.studentId}
          emptyMessage="No students participated in this session."
        />
      </Card>
    </section>
  );
};
