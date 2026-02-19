import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeacherSocket } from '../hooks/useTeacherSocket';
import { ConfirmationModal } from './common/ConfirmationModal';
import { Header } from './layout/Header';
import { Table, TableColumn } from './common/Table';
import { Button } from './common/Button';
import { Card } from './common/Card';
import { StatusBadge } from './common/StatusBadge';

interface Props {
    onLogout: () => void;
}

const formatDuration = (start: string, end?: string) => {
    if (!end) return '-';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
};

export const TeacherDashboard: React.FC<Props> = ({ onLogout }) => {
    const { isConnected, activeSession, history, createSession, endSession } = useTeacherSocket();
    const navigate = useNavigate();
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [durationMinutes, setDurationMinutes] = useState<string>('');

    const handleLogoutClick = () => {
        if (activeSession && activeSession.isActive) {
            setShowLogoutModal(true);
        } else {
            onLogout();
        }
    };

    const confirmLogout = () => {
        if (activeSession && activeSession.isActive) {
            endSession(); // End the session to logout students
        }
        setShowLogoutModal(false);
        onLogout();
    };

    const handleCreateSession = () => {
        setIsCreating(true);
        const dur = durationMinutes ? parseInt(durationMinutes, 10) : undefined;
        createSession(dur && dur > 0 ? dur : undefined);
    };

    useEffect(() => {
        if (isCreating && activeSession) {
            setIsCreating(false);
            navigate(`/teacher/session/${activeSession.code}`);
        }
    }, [activeSession, isCreating, navigate]);

    const historyColumns: TableColumn<typeof history[0]>[] = [
        {
            header: 'Start Date',
            cell: (session) => (
                <span className="text-gray-800 whitespace-nowrap">{new Date(session.createdAt).toLocaleString()}</span>
            )
        },
        {
            header: 'End Date',
            cell: (session) => session.endedAt ? (
                <span className="text-gray-800 whitespace-nowrap">{new Date(session.endedAt).toLocaleString()}</span>
            ) : (
                <span className="text-gray-400">-</span>
            )
        },
        {
            header: 'Duration',
            cell: (session) => <span className="text-gray-600 text-sm">{formatDuration(session.createdAt, session.endedAt)}</span>
        },
        {
            header: 'Students',
            cell: (session) => <span className="text-gray-900 font-medium">{session.studentCount || 0}</span>
        },
        {
            header: 'Session Code',
            cell: (session) => <span className="font-mono font-bold text-indigo-900">{session.code}</span>
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header
                title="Proctor Dashboard"
                isConnected={isConnected}
                onLogout={handleLogoutClick}
            />

            <div className="p-6 md:p-8 flex-1 w-full max-w-7xl mx-auto space-y-8">

                <ConfirmationModal
                    isOpen={showLogoutModal}
                    title="Active Session in Progress"
                    message="You have an exam session currently running. Logging out will END the session and disconnect all students. Are you sure you want to end the session and logout?"
                    confirmText="End Session & Logout"
                    isDanger={true}
                    onConfirm={confirmLogout}
                    onCancel={() => setShowLogoutModal(false)}
                />

                {/* Active Session Card */}
                {activeSession ? (
                    <Card className="border-indigo-100 overflow-hidden pl-6 pr-6 pt-6 pb-6" padding="none">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 mb-1">Exam In Progress</h2>
                                <p className="text-3xl font-mono font-bold text-indigo-600 tracking-wider">
                                    {activeSession.code}
                                </p>
                            </div>

                            <Button
                                onClick={() => navigate(`/teacher/session/${activeSession.code}`)}
                                className="w-full md:w-auto px-8 py-3 shadow-sm"
                            >
                                See Details
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <Card className="border-dashed border-gray-300" padding="md">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-700">No Active Session</h2>
                                <p className="text-gray-500 text-sm">Ready to start a new exam?</p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        max="480"
                                        placeholder="Duration (min)"
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                        className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                    <span className="text-xs text-gray-400 whitespace-nowrap">optional</span>
                                </div>
                                <Button
                                    onClick={handleCreateSession}
                                    variant="secondary"
                                    className="w-full sm:w-auto px-6 py-2"
                                    isLoading={isCreating}
                                >
                                    Create New Session
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Recent Sessions */}
                <section>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4 pl-6">Recent History</h3>
                    <Card className="border-gray-200 overflow-hidden" padding="none">
                        <Table
                            data={history.filter(s => !s.isActive)}
                            columns={historyColumns}
                            keyExtractor={(item) => item.id}
                            emptyMessage="No past sessions found."
                            onRowClick={(session) => navigate(`/teacher/session/${session.code}`)}
                        />
                    </Card>
                </section>
            </div>
        </div>
    );
};
