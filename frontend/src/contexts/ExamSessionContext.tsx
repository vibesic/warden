import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useInternetSniffer } from '../hooks/useInternetSniffer';
import { useExamSocket } from '../hooks/useExamSocket';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { useQuestionFiles } from '../hooks/useQuestionFiles';
import { formatHMS } from '../utils/format';
import {
  INTERNET_SNIFFER_EXAM_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  VIOLATION_REPORT_COOLDOWN_MS,
} from '../config/constants';
import type { QuestionFileItem } from '../types/exam';

interface ExamSessionState {
  studentId: string;
  studentName: string;
  sessionCode: string;
  isConnected: boolean;
  isViolating: boolean;
  sessionEnded: boolean;
  showEndModal: boolean;
  remainingTime: string | null;
  questionFiles: QuestionFileItem[];
  reportViolation: (type: string, details: string, reason: string) => void;
  onLogout: () => void;
}

const ExamSessionContext = createContext<ExamSessionState | null>(null);

export const useExamSession = (): ExamSessionState => {
  const ctx = useContext(ExamSessionContext);
  if (!ctx) {
    throw new Error('useExamSession must be used within an ExamSessionProvider');
  }
  return ctx;
};

interface ProviderProps {
  studentId: string;
  studentName: string;
  sessionCode: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export const ExamSessionProvider: React.FC<ProviderProps> = ({
  studentId,
  studentName,
  sessionCode,
  onLogout,
  children,
}) => {
  const [showEndModal, setShowEndModal] = useState(false);
  const { isSecure } = useInternetSniffer(INTERNET_SNIFFER_EXAM_INTERVAL_MS);
  const [serverViolation, setServerViolation] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [violationReported, setViolationReported] = useState(false);
  const { questionFiles } = useQuestionFiles(sessionCode);
  const currentTime = useCurrentTime();

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

  const { isConnected, sendHeartbeat, reportViolation, error, sessionTimer, serverTimeOffset } =
    useExamSocket(studentId, studentName, sessionCode, handleSessionEnded, handleServerViolation);

  const remainingTime = (() => {
    if (!sessionTimer?.durationMinutes || !sessionTimer.createdAt) return null;
    const endsAt = new Date(sessionTimer.createdAt).getTime() + sessionTimer.durationMinutes * 60_000;
    const serverNow = currentTime.getTime() + serverTimeOffset;
    const diff = endsAt - serverNow;
    return formatHMS(diff);
  })();

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
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sendHeartbeat, sessionEnded]);

  // Handle Internet Violation (client-side or server-side)
  useEffect(() => {
    if (sessionEnded) return;
    if (isViolating) {
      if (!violationReported) {
        reportViolation('INTERNET_ACCESS', 'Internet access detected by client-side probe', 'CLIENT_PROBE');
        setViolationReported(true);
        setTimeout(() => setViolationReported(false), VIOLATION_REPORT_COOLDOWN_MS);
      }
    } else {
      if (serverViolation && isSecure) {
        setServerViolation(false);
      }
    }
  }, [isViolating, isSecure, serverViolation, reportViolation, violationReported, sessionEnded]);

  const value = useMemo<ExamSessionState>(() => ({
    studentId,
    studentName,
    sessionCode,
    isConnected,
    isViolating,
    sessionEnded,
    showEndModal,
    remainingTime,
    questionFiles,
    reportViolation,
    onLogout,
  }), [
    studentId,
    studentName,
    sessionCode,
    isConnected,
    isViolating,
    sessionEnded,
    showEndModal,
    remainingTime,
    questionFiles,
    reportViolation,
    onLogout,
  ]);

  return (
    <ExamSessionContext.Provider value={value}>
      {children}
    </ExamSessionContext.Provider>
  );
};
