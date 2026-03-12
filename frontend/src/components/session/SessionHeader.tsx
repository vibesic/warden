import React from 'react';
import type { Session } from '../../hooks/useTeacherSocket';
import { formatDuration } from '../../utils/format';

interface SessionHeaderProps {
  sessionCode: string | undefined;
  activeSession: Session | null;
  sortedStudentsCount: number;
  formatElapsedTime: (start: string) => string;
  formatRemainingTime: (start: string, durationMin: number) => string;
  getRemainingMs: (start: string, durationMin: number) => number;
  onEndSession: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  sessionCode,
  activeSession,
  sortedStudentsCount,
  formatElapsedTime,
  formatRemainingTime,
  getRemainingMs,
  onEndSession,
}) => {
  return (
    <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
      <div className="w-full flex flex-wrap items-center justify-between gap-6">
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Session Code</h2>
          <div className="text-2xl font-mono font-bold text-indigo-600 tracking-widest">{sessionCode}</div>
        </div>

        {activeSession?.isActive && activeSession.createdAt ? (
          <>
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Started At</h2>
              <div className="text-lg font-medium text-gray-700">
                {new Date(activeSession.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {activeSession.durationMinutes ? (
              <div>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Time Remaining</h2>
                {getRemainingMs(activeSession.createdAt, activeSession.durationMinutes) <= 0 ? (
                  <div className="text-lg font-bold text-rose-500 animate-pulse">
                    Ending session...
                  </div>
                ) : (
                  <div className={`text-2xl font-mono font-bold tabular-nums ${getRemainingMs(activeSession.createdAt, activeSession.durationMinutes) <= 300_000
                    ? 'text-rose-500'
                    : 'text-emerald-500'
                    }`}>
                    {formatRemainingTime(activeSession.createdAt, activeSession.durationMinutes)}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-0.5">
                  of {activeSession.durationMinutes} min
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Time Elapsed</h2>
                <div className="text-2xl font-mono font-bold text-emerald-500 tabular-nums">
                  {formatElapsedTime(activeSession.createdAt)}
                </div>
              </div>
            )}

            <div>
              <button
                onClick={onEndSession}
                className="bg-rose-50 hover:bg-rose-100 text-rose-600 border-2 border-rose-200 font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                End Session
              </button>
            </div>
          </>
        ) : (activeSession && !activeSession.isActive && (
          <>
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Start Date</h2>
              <div className="text-lg font-medium text-gray-600">
                {new Date(activeSession.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">End Date</h2>
              <div className="text-lg font-medium text-gray-600">
                {activeSession.endedAt ? new Date(activeSession.endedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Duration</h2>
              <div className="text-lg font-bold text-emerald-600">
                {formatDuration(activeSession.createdAt, activeSession.endedAt)}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Students</h2>
              <div className="text-lg font-bold text-black pl-1">
                {sortedStudentsCount}
              </div>
            </div>
          </>
        ))}
      </div>
    </section>
  );
};
