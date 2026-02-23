import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTeacherSocket, Violation, StudentStatus } from '../hooks/useTeacherSocket';
import { AlertTriangle, Wifi, WifiOff, Download } from 'lucide-react';
import { ConfirmationModal } from './common/ConfirmationModal';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Header } from './layout/Header';
import { Table, TableColumn } from './common/Table';
import { Card } from './common/Card';
import { API_BASE_URL } from '../config/api';

interface SubmissionItem {
    id: string;
    originalName: string;
    storedName: string;
    mimeType: string | null;
    sizeBytes: number;
    createdAt: string;
    student: { studentId: string; name: string };
}
import { StatusBadge } from './common/StatusBadge';

const formatDuration = (start?: string, end?: string) => {
    if (!start) return '-';
    // If no end time (still active or just missing), use current time if online? 
    // Currently relying on lastSeenAt for 'exit time' if not online.
    if (!end) return '-';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff < 0) return '-';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
};

export const SessionDetail: React.FC = () => {
    const { sessionCode } = useParams<{ sessionCode: string }>();
    const navigate = useNavigate();
    const { isConnected, students, activeSession, endSession } = useTeacherSocket(sessionCode);
    const [selectedStudent, setSelectedStudent] = useState<{ name: string, violations: Violation[] } | null>(null);
    const [showEndSessionModal, setShowEndSessionModal] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchSubmissions = useCallback(async () => {
        if (!sessionCode) return;
        try {
            const token = localStorage.getItem('teacherToken') || '';
            const res = await fetch(`${API_BASE_URL}/api/submissions/${sessionCode}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setSubmissions(data.data);
            }
        } catch {
            // Silently fail — submissions are supplementary
        }
    }, [sessionCode]);

    // Poll submissions every 15 seconds
    useEffect(() => {
        fetchSubmissions();
        const interval = setInterval(fetchSubmissions, 15000);
        return () => clearInterval(interval);
    }, [fetchSubmissions]);

    const formatElapsedTime = (start: string) => {
        const diff = currentTime.getTime() - new Date(start).getTime();
        if (diff < 0) return '00:00:00';
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatRemainingTime = (start: string, durationMin: number): string => {
        const endsAt = new Date(start).getTime() + durationMin * 60_000;
        const diff = endsAt - currentTime.getTime();
        if (diff <= 0) return '00:00:00';
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const getRemainingMs = (start: string, durationMin: number): number => {
        const endsAt = new Date(start).getTime() + durationMin * 60_000;
        return endsAt - currentTime.getTime();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleDownload = (storedName: string) => {
        const token = localStorage.getItem('teacherToken') || '';
        window.open(`${API_BASE_URL}/api/submissions/${sessionCode}/download/${storedName}?token=${token}`, '_blank');
    };

    const sortedStudents = Object.values(students).sort((a, b) => a.studentId.localeCompare(b.studentId));

    const handleEndSessionClick = () => {
        setShowEndSessionModal(true);
    };

    const confirmEndSession = () => {
        endSession();
        setShowEndSessionModal(false);
        navigate('/teacher');
    };

    const handleLogoutClick = () => {
        if (activeSession?.isActive) {
            setShowLogoutModal(true);
        } else {
            navigate('/teacher/login');
        }
    };

    const confirmLogout = () => {
        if (activeSession?.isActive) {
            endSession(); // End session on logout
        }
        navigate('/teacher/login');
    };

    const onlineCount = sortedStudents.filter(s => s.isOnline).length;

    const violationColumns: TableColumn<Violation>[] = [
        {
            header: 'Time',
            className: 'px-4 py-3 whitespace-nowrap text-gray-600',
            cell: (v) => new Date(v.timestamp).toLocaleTimeString()
        },
        {
            header: 'Type',
            className: 'px-4 py-3 font-bold text-red-600',
            cell: (v) => v.type.replace(/_/g, ' ')
        },
        {
            header: 'Details',
            className: 'px-4 py-3 text-gray-700',
            cell: (v) => v.details || '-'
        }
    ];

    const studentHistoryColumns: TableColumn<StudentStatus>[] = [
        {
            header: 'Name',
            className: 'font-medium text-gray-900',
            cell: (s) => s.name || 'Unknown'
        },
        {
            header: 'Student ID',
            cell: (s) => <span className="font-mono text-gray-600">{s.studentId}</span>
        },
        {
            header: 'Violations',
            cell: (s) => s.violations.length > 0 ? (
                <div
                    onClick={() => setSelectedStudent({ name: s.name || s.studentId, violations: s.violations })}
                    className="cursor-pointer inline-block"
                >
                    <StatusBadge status="error" text={`${s.violations.length}`} />
                </div>
            ) : (
                <StatusBadge status="success" text="Clean" />
            )
        },
        {
            header: 'Join Time',
            cell: (s) => s.joinedAt ? new Date(s.joinedAt).toLocaleTimeString() : '-'
        },
        {
            header: 'Exit Time',
            cell: (s) => s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleTimeString() : '-'
        },
        {
            header: 'Duration',
            cell: (s) => formatDuration(s.joinedAt, s.lastSeenAt)
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header
                title={activeSession?.isActive ? 'Session Monitor' : 'Session History'}
                isConnected={isConnected}
                onLogout={handleLogoutClick}
                showBack={true}
                onBack={() => navigate('/teacher')}
            />

            <div className="p-6 md:p-8 flex-1 w-full max-w-7xl mx-auto">

                <ConfirmationModal
                    isOpen={showEndSessionModal}
                    title="End Exam Session?"
                    message="Are you sure you want to end this session? All currently connected students will be disconnected immediately and cannot rejoin."
                    confirmText="End Session"
                    isDanger={true}
                    onConfirm={confirmEndSession}
                    onCancel={() => setShowEndSessionModal(false)}
                />

                <ConfirmationModal
                    isOpen={showLogoutModal}
                    title="Active Session in Progress"
                    message="You have an exam session currently running. Logging out will END the session and disconnect all students. Are you sure you want to end the session and logout?"
                    confirmText="End Session & Logout"
                    isDanger={true}
                    onConfirm={confirmLogout}
                    onCancel={() => setShowLogoutModal(false)}
                />

                <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
                    <div className="w-full flex flex-wrap items-center justify-between gap-6">
                        {/* Session Code */}
                        <div>
                            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Session Code</h2>
                            <div className="text-2xl font-mono font-bold text-indigo-600 tracking-widest">{sessionCode}</div>
                        </div>

                        {activeSession?.isActive && activeSession.createdAt ? (
                            <>
                                {/* Started At */}
                                <div>
                                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Started At</h2>
                                    <div className="text-lg font-medium text-gray-700">
                                        {new Date(activeSession.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                {/* Timer: show countdown if duration set, otherwise elapsed */}
                                {activeSession.durationMinutes ? (
                                    <div>
                                        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Time Remaining</h2>
                                        <div className={`text-2xl font-mono font-bold tabular-nums ${getRemainingMs(activeSession.createdAt, activeSession.durationMinutes) <= 300_000
                                            ? 'text-rose-500'
                                            : 'text-emerald-500'
                                            }`}>
                                            {formatRemainingTime(activeSession.createdAt, activeSession.durationMinutes)}
                                        </div>
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

                                {/* End Session Button */}
                                <div>
                                    <button
                                        onClick={handleEndSessionClick}
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 border-2 border-rose-200 font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                                    >
                                        End Session
                                    </button>
                                </div>
                            </>
                        ) : (activeSession && !activeSession.isActive && (
                            <>
                                {/* Start Date */}
                                <div>
                                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Start Date</h2>
                                    <div className="text-lg font-medium text-gray-600">
                                        {new Date(activeSession.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>

                                {/* End Date */}
                                <div>
                                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">End Date</h2>
                                    <div className="text-lg font-medium text-gray-600">
                                        {activeSession.endedAt ? new Date(activeSession.endedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </div>
                                </div>

                                {/* Duration */}
                                <div>
                                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Duration</h2>
                                    <div className="text-lg font-bold text-emerald-600">
                                        {formatDuration(activeSession.createdAt, activeSession.endedAt)}
                                    </div>
                                </div>

                                {/* Students */}
                                <div>
                                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Students</h2>
                                    <div className="text-lg font-bold text-black pl-1">
                                        {sortedStudents.length}
                                    </div>
                                </div>
                            </>
                        ))}
                    </div>
                </section>

                {activeSession?.isActive ? (
                    <section>
                        <div className="flex justify-between items-center mb-4 px-6">
                            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                                Connected Students ({onlineCount} out of {sortedStudents.length})
                            </h2>
                            <div className="flex gap-4 text-sm items-center">
                                <div className="flex items-center gap-1">
                                    <Wifi size={16} className="text-green-500" /> <span className="text-xs text-gray-500">Online</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <WifiOff size={16} className="text-gray-400" /> <span className="text-xs text-gray-500">Offline</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sortedStudents.map(student => (
                                <div key={student.studentId} className={`relative p-5 rounded-lg border-2 transition-all ${student.isOnline ? 'bg-white border-green-100 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-75'
                                    }`}>
                                    <div className="flex justify-between items-start">
                                        {/* Name (Top Left) */}
                                        <h3 className="font-bold text-gray-800 text-lg truncate pr-2" title={student.name}>{student.name || 'Unknown'}</h3>

                                        {/* Wifi Symbol (Top Right) */}
                                        <div className={`${student.isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                                            {student.isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                        </div>
                                    </div>

                                    <div className="flex items-end justify-between mt-1">
                                        {/* Student ID (Bottom Left) */}
                                        <p className="text-sm font-mono font-bold text-gray-500">{student.studentId}</p>

                                        {/* Violation Count (Bottom Right) */}
                                        {student.violations.length > 0 ? (
                                            <button
                                                onClick={() => setSelectedStudent({ name: student.name || student.studentId, violations: student.violations })}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors border border-red-200"
                                            >
                                                <AlertTriangle size={14} />
                                                <span className="text-xs font-bold">{student.violations.length} Violations</span>
                                            </button>
                                        ) : (
                                            <div className="h-6"></div> /* Spacer to keep height consistent if no violations */
                                        )}
                                    </div>
                                </div>
                            ))}

                            {sortedStudents.length === 0 && (
                                <div className="col-span-full py-12 text-center bg-white rounded border border-dashed border-gray-300 text-gray-400">
                                    {activeSession?.isActive ? 'Waiting for students to join...' : 'No data recorded for this session.'}
                                </div>
                            )}
                        </div>
                    </section>
                ) : (
                    <section>
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">Student Participation History</h2>
                        <Card className="border-gray-200 overflow-hidden" padding="none">
                            <Table
                                data={sortedStudents}
                                columns={studentHistoryColumns}
                                keyExtractor={(s) => s.studentId}
                                emptyMessage="No students participated in this session."
                            />
                        </Card>
                    </section>
                )}

                {/* Submissions Section */}
                {submissions.length > 0 && (
                    <section className="mt-8">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">
                            Student Submissions ({submissions.length})
                        </h2>
                        <Card className="border-gray-200 overflow-hidden" padding="none">
                            <Table
                                data={submissions}
                                columns={[
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
                                                onClick={() => handleDownload(s.storedName)}
                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                title="Download"
                                            >
                                                <Download size={16} />
                                            </button>
                                        ),
                                    },
                                ]}
                                keyExtractor={(s: SubmissionItem) => s.id}
                                emptyMessage="No submissions yet."
                            />
                        </Card>
                    </section>
                )}

                {selectedStudent && (
                    <Modal
                        isOpen={!!selectedStudent}
                        onClose={() => setSelectedStudent(null)}
                        title={`Violation Log: ${selectedStudent.name}`}
                        size="xl"
                        headerClassName="bg-red-50 text-red-800"
                    >
                        <Table
                            data={selectedStudent.violations.filter(v => v.type !== 'TAB_SWITCH')}
                            columns={violationColumns}
                            keyExtractor={(_, index) => index}
                            emptyMessage="No violations recorded."
                            className="w-full text-sm text-left"
                            rowClassName="hover:bg-red-50/30"
                        />
                    </Modal>
                )}
            </div>
        </div>
    );
};
