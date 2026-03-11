import React, { useEffect, useState, useCallback } from 'react';
import { useInternetSniffer } from '../hooks/useInternetSniffer';
import { useExamSocket } from '../hooks/useExamSocket';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { FullScreenAlert } from './common/FullScreenAlert';
import { API_BASE_URL } from '../config/api';
import { formatHMS } from '../utils/format';
import { QuestionFileList, type QuestionFileItem } from './exam/QuestionFileList';
import { FileUploadSection } from './exam/FileUploadSection';
import { DisconnectDetector } from './exam/DisconnectDetector';

interface Props {
    studentId: string;
    studentName: string;
    sessionCode: string;
    onLogout: () => void;
}

export const SecureExamMonitor: React.FC<Props> = ({ studentId, studentName, sessionCode, onLogout }) => {
    const [showEndModal, setShowEndModal] = useState(false);
    const { isSecure } = useInternetSniffer(2000);
    const [serverViolation, setServerViolation] = useState(false);

    const [sessionEnded, setSessionEnded] = useState(false);

    const handleSessionEnded = useCallback(() => {
        setSessionEnded(true);
        setShowEndModal(true);
    }, []);

    const handleServerViolation = useCallback((type: string) => {
        if (type === 'INTERNET_ACCESS') {
            setServerViolation(true);
        }
    }, []);

    const isViolating = !isSecure || serverViolation;

    const { isConnected, sendHeartbeat, reportViolation, error, sessionTimer } = useExamSocket(studentId, studentName, sessionCode, handleSessionEnded, handleServerViolation);
    const [violationReported, setViolationReported] = useState(false);
    const currentTime = useCurrentTime();
    const [questionFiles, setQuestionFiles] = useState<QuestionFileItem[]>([]);

    const formatRemainingTime = useCallback((): string | null => {
        if (!sessionTimer?.durationMinutes || !sessionTimer.createdAt) return null;
        const endsAt = new Date(sessionTimer.createdAt).getTime() + sessionTimer.durationMinutes * 60_000;
        const diff = endsAt - currentTime.getTime();
        return formatHMS(diff);
    }, [sessionTimer, currentTime]);

    const remainingTime = formatRemainingTime();

    // Fetch question files once on mount
    useEffect(() => {
        const fetchQuestionFiles = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/session/${sessionCode}/questions`);
                const data = await res.json();
                if (data.success) {
                    setQuestionFiles(data.data);
                }
            } catch {
                // Silently fail
            }
        };
        fetchQuestionFiles();
    }, [sessionCode]);

    // Show error if registration fails
    useEffect(() => {
        if (error) {
            alert(`Connection Error: ${error}`);
            onLogout();
        }
    }, [error, onLogout]);

    // Heartbeat loop
    useEffect(() => {
        if (sessionEnded) return;
        sendHeartbeat();
        const timer = setInterval(() => {
            sendHeartbeat();
        }, 2000);
        return () => clearInterval(timer);
    }, [sendHeartbeat, sessionEnded]);

    // Handle Internet Violation (client-side or server-side)
    useEffect(() => {
        if (sessionEnded) return;
        if (isViolating) {
            if (!violationReported) {
                reportViolation('INTERNET_ACCESS', 'Internet access detected by client-side probe', 'CLIENT_PROBE');
                setViolationReported(true);
                setTimeout(() => setViolationReported(false), 10000);
            }
        } else {
            if (serverViolation && isSecure) {
                setServerViolation(false);
            }
        }
    }, [isViolating, isSecure, serverViolation, reportViolation, violationReported, sessionEnded]);

    if (showEndModal) {
        return (
            <Modal
                isOpen={true}
                onClose={() => { }} // Block closing
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

            <QuestionFileList sessionCode={sessionCode} questionFiles={questionFiles} />

            <FileUploadSection sessionCode={sessionCode} studentId={studentId} />

            <div className="flex flex-col gap-4 w-64 mx-auto">
                <button
                    onClick={onLogout}
                    className="px-6 py-2 bg-transparent border-2 border-white text-white font-bold rounded hover:bg-white/10 transition-colors"
                >
                    Logout
                </button>
            </div>

            <DisconnectDetector
                isConnected={isConnected}
                sessionCode={sessionCode}
                reportViolation={reportViolation}
            />
        </FullScreenAlert>
    );
};
