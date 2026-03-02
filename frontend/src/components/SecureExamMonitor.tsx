import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useInternetSniffer } from '../hooks/useInternetSniffer';
import { useExamSocket } from '../hooks/useExamSocket';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { FullScreenAlert } from './common/FullScreenAlert';
import { API_BASE_URL } from '../config/api';
import { formatFileSize, formatHMS } from '../utils/format';

interface UploadedFile {
    id: string;
    originalName: string;
    sizeBytes: number;
    createdAt: string;
}

interface Props {
    studentId: string;
    studentName: string;
    sessionCode: string;
    onLogout: () => void;
}

export const SecureExamMonitor: React.FC<Props> = ({ studentId, studentName, sessionCode, onLogout }) => {
    const [showEndModal, setShowEndModal] = useState(false);
    const { isSecure } = useInternetSniffer(2000); // Check every 2s
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
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const formatRemainingTime = useCallback((): string | null => {
        if (!sessionTimer?.durationMinutes || !sessionTimer.createdAt) return null;
        const endsAt = new Date(sessionTimer.createdAt).getTime() + sessionTimer.durationMinutes * 60_000;
        const diff = endsAt - currentTime.getTime();
        return formatHMS(diff);
    }, [sessionTimer, currentTime]);

    const remainingTime = formatRemainingTime();

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadError('');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('sessionCode', sessionCode);
            formData.append('studentId', studentId);

            const res = await fetch(`${API_BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (data.success) {
                setUploadedFiles((prev) => [data.data, ...prev]);
            } else {
                setUploadError(data.message || 'Upload failed');
            }
        } catch {
            setUploadError('Upload failed. Check your connection.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Show error if registration fails (e.g. invalid code)
    useEffect(() => {
        if (error) {
            alert(`Connection Error: ${error}`);
            onLogout();
        }
    }, [error, onLogout]);

    // Heartbeat loop
    useEffect(() => {
        if (sessionEnded) return;
        // Immediate heartbeat
        sendHeartbeat();
        const timer = setInterval(() => {
            sendHeartbeat();
        }, 2000); // Check every 2s
        return () => clearInterval(timer);
    }, [sendHeartbeat, sessionEnded]);

    // Track Disconnection (Logic: If we lose server connection, they might have switched networks)
    const [lastDisconnectTime, setLastDisconnectTime] = useState<number | null>(null);

    useEffect(() => {
        if (!isConnected && !lastDisconnectTime) {
            // Just disconnected
            setLastDisconnectTime(Date.now());
        } else if (isConnected && lastDisconnectTime) {
            // Reconnected
            const duration = Date.now() - lastDisconnectTime;
            if (duration > 120_000) { // Only log if disconnected for > 2 minutes
                const seconds = Math.round(duration / 1000);
                reportViolation('CONNECTION_LOST', `Client disconnected from exam server for ${seconds}s. Possible network switch.`);
            }
            setLastDisconnectTime(null);
        }
    }, [isConnected, lastDisconnectTime, reportViolation]);

    // Handle Internet Violation (client-side or server-side)
    useEffect(() => {
        if (sessionEnded) return;
        if (isViolating) {
            // Internet detected!
            if (!violationReported) {
                reportViolation('INTERNET_ACCESS', 'Internet access detected by client-side probe');
                setViolationReported(true); // Don't spam

                setTimeout(() => setViolationReported(false), 10000);
            }
        } else {
            // Reset server violation when client-side says secure again
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

            {/* File Upload Section */}
            <div className="w-full max-w-sm mx-auto mb-6">
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                />
                <label
                    htmlFor="file-upload"
                    className={`block w-full text-center px-6 py-3 bg-white text-green-700 font-bold rounded-lg cursor-pointer hover:bg-gray-100 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''
                        }`}
                >
                    {uploading ? 'Uploading...' : 'Upload File'}
                </label>
                {uploadError && (
                    <p className="text-red-200 text-xs text-center mt-2">{uploadError}</p>
                )}
                {uploadedFiles.length > 0 && (
                    <div className="mt-3 space-y-1">
                        {uploadedFiles.map((f) => (
                            <div key={f.id} className="flex items-center justify-between bg-white/10 rounded px-3 py-1.5 text-xs">
                                <span className="truncate mr-2">{f.originalName}</span>
                                <span className="text-white/60 whitespace-nowrap">{formatFileSize(f.sizeBytes)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-4 w-64 mx-auto">
                <button
                    onClick={onLogout}
                    className="px-6 py-2 bg-transparent border-2 border-white text-white font-bold rounded hover:bg-white/10 transition-colors"
                >
                    Logout
                </button>
            </div>
        </FullScreenAlert>
    );
};
