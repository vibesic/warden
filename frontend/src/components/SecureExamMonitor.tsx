import React from 'react';
import { ExamSessionProvider, useExamSession } from '../contexts/ExamSessionContext';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { FullScreenAlert } from './common/FullScreenAlert';
import { QuestionFileList } from './exam/QuestionFileList';
import { FileUploadSection } from './exam/FileUploadSection';
import { DisconnectDetector } from './exam/DisconnectDetector';

interface Props {
    studentId: string;
    studentName: string;
    sessionCode: string;
    onLogout: () => void;
}

export const SecureExamMonitor: React.FC<Props> = (props) => (
    <ExamSessionProvider {...props}>
        <SecureExamMonitorInner />
    </ExamSessionProvider>
);

const SecureExamMonitorInner: React.FC = () => {
    const {
        studentId,
        isConnected,
        isViolating,
        showEndModal,
        remainingTime,
        onLogout,
    } = useExamSession();

    if (showEndModal) {
        return (
            <Modal
                isOpen={true}
                onClose={() => { }}
                title="Exam Session Ended"
                closeOnBackdropClick={false}
                footer={
                    <Button onClick={onLogout} className="w-full">
                        OK, Logout
                    </Button>
                }
            >
                <div className="text-center py-4 text-gray-600">
                    <p>The teacher has ended this exam session. You will now be logged out.</p>
                </div>
            </Modal>
        );
    }

    if (isViolating) {
        return (
            <FullScreenAlert
                title="VIOLATION DETECTED"
                subtitle="UNAUTHORIZED INTERNET ACCESS DETECTED"
                message="This incident has been logged. Please disconnect any external network devices immediately."
                variant="danger"
            >
                <div className="flex flex-col items-center gap-2">
                    <div className="text-sm opacity-75">Student ID: {studentId}</div>
                    <div className="text-xs opacity-50">Connection Status: {isConnected ? 'Server Connected' : 'Server Disconnected'}</div>
                </div>

                {onLogout && (
                    <button
                        onClick={onLogout}
                        className="mt-8 px-6 py-2 bg-white text-red-600 font-bold rounded shadow hover:bg-gray-100 transition-colors"
                    >
                        Logout
                    </button>
                )}
            </FullScreenAlert>
        );
    }

    return (
        <FullScreenAlert
            title="NO VIOLATION"
            subtitle="EXAM SESSION IN PROGRESS"
            message="Carry on you can do you things..."
            variant="success"
        >
            {remainingTime && (
                <div className="mb-6 text-center">
                    <div className="text-xs uppercase tracking-wider opacity-75 mb-1">Time Remaining</div>
                    <div className="text-4xl font-mono font-bold tabular-nums">{remainingTime}</div>
                </div>
            )}

            <div className="flex flex-col items-center gap-2 mb-6">
                <div className="text-sm opacity-75">Student ID: {studentId}</div>
                <div className="text-xs opacity-50">Connection Status: {isConnected ? 'Server Connected' : 'Server Disconnected'}</div>
            </div>

            <QuestionFileList />

            <FileUploadSection />

            <div className="flex flex-col gap-4 w-64 mx-auto">
                <button
                    onClick={onLogout}
                    className="px-6 py-2 bg-transparent border-2 border-white text-white font-bold rounded hover:bg-white/10 transition-colors"
                >
                    Logout
                </button>
            </div>

            <DisconnectDetector />
        </FullScreenAlert>
    );
};
