import React from 'react';
import { Modal } from '../common/Modal';
import { Table, TableColumn } from '../common/Table';
import type { Violation } from '../../hooks/useTeacherSocket';

interface ViolationLogModalProps {
  selectedStudent: { name: string; violations: Violation[] } | null;
  onClose: () => void;
}

const violationColumns: TableColumn<Violation>[] = [
  {
    header: 'Time',
    className: 'px-4 py-3 whitespace-nowrap text-gray-600',
    cell: (v) => new Date(v.timestamp).toLocaleTimeString(),
  },
  {
    header: 'Type',
    className: 'px-4 py-3 font-bold text-red-600',
    cell: (v) => v.type.replace(/_/g, ' '),
  },
  {
    header: 'Reason',
    className: 'px-4 py-3 font-medium text-orange-700',
    cell: (v) => v.reason ? v.reason.replace(/_/g, ' ') : '-',
  },
  {
    header: 'Details',
    className: 'px-4 py-3 text-gray-700',
    cell: (v) => v.details || '-',
  },
];

export const ViolationLogModal: React.FC<ViolationLogModalProps> = ({
  selectedStudent,
  onClose,
}) => {
  if (!selectedStudent) return null;

  return (
    <Modal
      isOpen={!!selectedStudent}
      onClose={onClose}
      title={`Violation Log: ${selectedStudent.name}`}
      size="xl"
      headerClassName="bg-red-50 text-red-800"
    >
      <Table
        data={selectedStudent.violations}
        columns={violationColumns}
        keyExtractor={(_, index) => index}
        emptyMessage="No violations recorded."
        className="w-full text-sm text-left"
        rowClassName="hover:bg-red-50/30"
      />
    </Modal>
  );
};
