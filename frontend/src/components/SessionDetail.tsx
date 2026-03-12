import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTeacherSocket } from '../hooks/useTeacherSocket';
import type { Violation } from '../hooks/useTeacherSocket';
import { useSessionTimer } from '../hooks/useSessionTimer';
import { useQuestionFiles } from '../hooks/useQuestionFiles';
import { useSubmissions } from '../hooks/useSubmissions';
import { ConfirmationModal } from './common/ConfirmationModal';
import { Header } from './layout/Header';
import { SessionHeader } from './session/SessionHeader';
import { StudentGrid } from './session/StudentGrid';
import { StudentHistoryTable } from './session/StudentHistoryTable';
import { QuestionFilesPanel } from './session/QuestionFilesPanel';
import { SubmissionsPanel } from './session/SubmissionsPanel';
import { ViolationLogModal } from './session/ViolationLogModal';

export const SessionDetail: React.FC = () => {
    const { sessionCode } = useParams<{ sessionCode: string }>();
    const navigate = useNavigate();
    const { isConnected, students, activeSession, isAuthError, serverTimeOffset, endSession } = useTeacherSocket(sessionCode);
    const { formatElapsedTime, formatRemainingTime, getRemainingMs } = useSessionTimer(serverTimeOffset);
    const { questionFiles, questionUploading, questionUploadError, handleQuestionUpload, handleQuestionDelete, handleQuestionDownload } = useQuestionFiles(sessionCode || '');
    const { submissions, handleDownload: handleSubmissionDownload } = useSubmissions(sessionCode);

    const [selectedStudent, setSelectedStudent] = useState<{ name: string; violations: Violation[] } | null>(null);
    const [showEndSessionModal, setShowEndSessionModal] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [connectionFilter, setConnectionFilter] = useState<'all' | 'online' | 'offline'>('all');

    useEffect(() => {
        if (isAuthError) {
            localStorage.removeItem('teacherMode');
            localStorage.removeItem('teacherToken');
            navigate('/teacher/login');
        }
    }, [isAuthError, navigate]);

    const sortedStudents = Object.values(students).sort((a, b) => a.studentId.localeCompare(b.studentId));
    const onlineCount = sortedStudents.filter(s => s.isOnline).length;
    const filteredStudents = sortedStudents.filter((s) => {
        if (connectionFilter === 'online') return s.isOnline;
        if (connectionFilter === 'offline') return !s.isOnline;
        return true;
    });

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
            endSession();
        }
        navigate('/teacher/login');
    };

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

                <SessionHeader
                    sessionCode={sessionCode}
                    activeSession={activeSession}
                    sortedStudentsCount={sortedStudents.length}
                    formatElapsedTime={formatElapsedTime}
                    formatRemainingTime={formatRemainingTime}
                    getRemainingMs={getRemainingMs}
                    onEndSession={() => setShowEndSessionModal(true)}
                />

                {activeSession?.isActive ? (
                    <StudentGrid
                        filteredStudents={filteredStudents}
                        sortedStudentsCount={sortedStudents.length}
                        onlineCount={onlineCount}
                        connectionFilter={connectionFilter}
                        onFilterChange={setConnectionFilter}
                        onSelectStudent={setSelectedStudent}
                        activeSession={activeSession}
                    />
                ) : (
                    <StudentHistoryTable
                        students={sortedStudents}
                        onSelectStudent={setSelectedStudent}
                    />
                )}

                <QuestionFilesPanel
                    questionFiles={questionFiles}
                    isActive={activeSession?.isActive ?? false}
                    questionUploading={questionUploading}
                    questionUploadError={questionUploadError}
                    onUpload={handleQuestionUpload}
                    onDelete={handleQuestionDelete}
                    onDownload={handleQuestionDownload}
                />

                <SubmissionsPanel
                    submissions={submissions}
                    onDownload={handleSubmissionDownload}
                />

                <ViolationLogModal
                    selectedStudent={selectedStudent}
                    onClose={() => setSelectedStudent(null)}
                />
            </div>
        </div>
    );
};
