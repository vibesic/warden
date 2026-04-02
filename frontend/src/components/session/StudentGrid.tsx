import React from 'react';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import type { StudentStatus, Violation } from '../../hooks/useTeacherSocket';
import type { Session } from '../../hooks/useTeacherSocket';
import { getDeviceIcon } from '../../utils/deviceIcon';

interface StudentGridProps {
  filteredStudents: StudentStatus[];
  sortedStudentsCount: number;
  onlineCount: number;
  connectionFilter: 'all' | 'online' | 'offline';
  onFilterChange: (filter: 'all' | 'online' | 'offline') => void;
  onSelectStudent: (student: { name: string; violations: Violation[] }) => void;
  activeSession: Session | null;
}

export const StudentGrid: React.FC<StudentGridProps> = React.memo(({
  filteredStudents,
  sortedStudentsCount,
  onlineCount,
  connectionFilter,
  onFilterChange,
  onSelectStudent,
  activeSession,
}) => {
  return (
    <section>
      <div className="flex justify-between items-center mb-4 px-6">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          Connected Students ({onlineCount} out of {sortedStudentsCount})
        </h2>
        <div className="flex gap-4 text-sm items-center">
          <select
            value={connectionFilter}
            onChange={(e) => onFilterChange(e.target.value as 'all' | 'online' | 'offline')}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            aria-label="Filter by status"
          >
            <option value="all">All Students</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
          </select>
          <div className="flex items-center gap-1">
            <Wifi size={16} className="text-green-500" /> <span className="text-xs text-gray-500">Online</span>
          </div>
          <div className="flex items-center gap-1">
            <WifiOff size={16} className="text-gray-400" /> <span className="text-xs text-gray-500">Offline</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStudents.map(student => (
          <div key={student.studentId} className={`relative p-5 rounded-lg border-2 transition-all ${student.isOnline ? 'bg-white border-green-100 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-75'
            }`}>
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-gray-800 text-lg truncate pr-2" title={student.name}>{student.name || 'Unknown'}</h3>
              <div className={`${student.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                {student.isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400" title={`${student.deviceOs || 'Unknown OS'} · ${student.deviceBrowser || 'Unknown Browser'}`}>
              {getDeviceIcon(student.deviceType)}
              <span className="truncate">{student.deviceOs || 'Unknown'} · {student.deviceBrowser || 'Unknown'}</span>
            </div>

            <div className="flex items-end justify-between mt-1">
              <p className="text-sm font-mono font-bold text-gray-500">{student.studentId}</p>
              {student.violations.length > 0 ? (
                <button
                  onClick={() => onSelectStudent({ name: student.name || student.studentId, violations: student.violations })}
                  className="flex items-center gap-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors border border-red-200"
                >
                  <AlertTriangle size={14} />
                  <span className="text-xs font-bold">{student.violations.length} Violations</span>
                </button>
              ) : (
                <div className="h-6"></div>
              )}
            </div>
          </div>
        ))}

        {filteredStudents.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded border border-dashed border-gray-300 text-gray-400">
            {sortedStudentsCount === 0
              ? (activeSession?.isActive ? 'Waiting for students to join...' : 'No data recorded for this session.')
              : `No ${connectionFilter} students.`
            }
          </div>
        )}
      </div>
    </section>
  );
});
