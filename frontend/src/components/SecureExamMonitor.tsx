import React, { useEffect, useState } from 'react';
import { useInternetSniffer } from '../hooks/useInternetSniffer';
import { useExamSocket } from '../hooks/useExamSocket';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { FullScreenAlert } from './common/FullScreenAlert';

interface Props {
  studentId: string;
  studentName: string;
  sessionCode: string;
  onLogout: () => void;
}

export const SecureExamMonitor: React.FC<Props> = ({ studentId, studentName, sessionCode, onLogout }) => {
  const [showEndModal, setShowEndModal] = useState(false);
  const { isSecure } = useInternetSniffer(2000); // Check every 2s

  const handleSessionEnded = React.useCallback(() => {
    setShowEndModal(true);
  }, []);

  const { isConnected, sendHeartbeat, reportViolation, error } = useExamSocket(studentId, studentName, sessionCode, handleSessionEnded);
  const [violationReported, setViolationReported] = useState(false);

  // Show error if registration fails (e.g. invalid code)
  useEffect(() => {
    if (error) {
        alert(`Connection Error: ${error}`);
        onLogout();
    }
  }, [error, onLogout]);

  // Heartbeat loop
  useEffect(() => {
    // Immediate heartbeat
    sendHeartbeat();
    const timer = setInterval(() => {
      sendHeartbeat();
    }, 2000); // Check every 2s
    return () => clearInterval(timer);
  }, [sendHeartbeat]);

  // Track Disconnection (Logic: If we lose server connection, they might have switched networks)
  const [lastDisconnectTime, setLastDisconnectTime] = useState<number | null>(null);

  useEffect(() => {
      if (!isConnected && !lastDisconnectTime) {
          // Just disconnected
          setLastDisconnectTime(Date.now());
      } else if (isConnected && lastDisconnectTime) {
          // Reconnected
          const duration = Date.now() - lastDisconnectTime;
          if (duration > 5000) { // Only log if disconnected for > 5 seconds
              const seconds = Math.round(duration / 1000);
              reportViolation('CONNECTION_LOST', `Client disconnected from exam server for ${seconds}s. Possible network switch.`);
          }
          setLastDisconnectTime(null);
      }
  }, [isConnected, lastDisconnectTime, reportViolation]);

  // Handle Internet Violation
  useEffect(() => {
    if (!isSecure) {
      // Internet detected!
      if (!violationReported) {
        reportViolation('INTERNET_ACCESS', 'Access to google.com detected');
        setViolationReported(true); // Don't spam
        
        // Reset spam block after some time or keep it persistent?
        // Maybe keep reporting periodically?
        setTimeout(() => setViolationReported(false), 10000);
      }
    }
  }, [isSecure, reportViolation, violationReported]);

  if (showEndModal) {
      return (
          <Modal 
            isOpen={true} 
            onClose={() => {}} // Block closing
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

  if (!isSecure) {
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
        <div className="flex flex-col items-center gap-2 mb-8">
            <div className="text-sm opacity-75">Student ID: {studentId}</div>
            <div className="text-xs opacity-50">Connection Status: {isConnected ? 'Server Connected' : 'Server Disconnected'}</div>
        </div>

        <div className="flex flex-col gap-4 w-64 mx-auto">
            <Button 
                onClick={() => alert('Upload feature coming soon')} 
                className="bg-white text-green-600 hover:bg-gray-100 font-bold"
            >
                Upload File
            </Button>
            
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
