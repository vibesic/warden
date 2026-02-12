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
    }, 4000); // Slightly faster than server timeout (which is check every 10s for >30s old)
    return () => clearInterval(timer);
  }, [sendHeartbeat]);

  // Handle Visibility Change (Tab Switch)
  useEffect(() => {
      const handleVisibilityChange = () => {
          if (document.hidden) {
              reportViolation('TAB_SWITCH', 'Student switched tabs or minimized window');
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reportViolation]);

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
    <div className="fixed top-0 right-0 p-2 m-2 bg-gray-900 bg-opacity-80 rounded text-white text-xs z-40">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Server: {isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isSecure ? 'bg-green-500' : 'bg-red-500'}`} />
          <span>Status: {isSecure ? 'Secure' : 'VIOLATION'}</span>
        </div>
      </div>
    </div>
  );
};
