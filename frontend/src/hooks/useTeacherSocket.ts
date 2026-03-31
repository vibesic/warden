import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

export interface Violation {
  type: string;
  reason?: string;
  details?: string;
  timestamp: string;
}

export interface StudentStatus {
  studentId: string;
  name?: string;
  isOnline: boolean;
  joinedAt?: string;
  lastSeenAt?: string;
  deviceType?: string;
  deviceOs?: string;
  deviceBrowser?: string;
  violations: Violation[];
}

export interface Session {
  id: string;
  code: string;
  isActive: boolean;
  durationMinutes?: number | null;
  createdAt: string;
  endedAt?: string;
  studentCount?: number;
}

interface SessionStateStudent {
  studentId: string;
  name: string;
  isOnline: boolean;
  joinedAt: string;
  lastSeenAt?: string;
  deviceType?: string;
  deviceOs?: string;
  deviceBrowser?: string;
  violations: Violation[];
}

interface DashboardUpdatePayload {
  type: 'STUDENT_JOINED' | 'STUDENT_LEFT';
  studentId: string;
  name?: string;
  isOnline?: boolean;
  deviceType?: string;
  deviceOs?: string;
  deviceBrowser?: string;
}

interface DashboardAlertPayload {
  studentId: string;
  violation: Violation;
}

export const useTeacherSocket = (sessionCode?: string | null) => {
  const socketRef = useRef<Socket | null>(null);
  const [students, setStudents] = useState<Record<string, StudentStatus>>({});
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);

  // Keep a ref of sessionCode for use inside socket event listeners without recreating the connection
  const sessionCodeRef = useRef(sessionCode);
  useEffect(() => {
    sessionCodeRef.current = sessionCode;
  }, [sessionCode]);

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  useEffect(() => {
    const token = sessionStorage.getItem('teacherToken') || '';
    socketRef.current = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    const socket = socketRef.current;

    const setupListeners = () => {
      socket.on('connect', () => {
        setIsConnected(true);
      });

      socket.on('dashboard:overview', (data: { activeSession: Session | null, history: Session[] }) => {
        setActiveSession(data.activeSession);
        setHistory(data.history || []);
      });

      socket.on('dashboard:session_state', (data: { session: Session, serverTime?: number, students: SessionStateStudent[] }) => {
        if (data.serverTime) {
          setServerTimeOffset(data.serverTime - Date.now());
        }
        setActiveSession(data.session);
        const studentMap: Record<string, StudentStatus> = {};
        if (data.students) {
          data.students.forEach((s) => {
            studentMap[s.studentId] = {
              studentId: s.studentId,
              name: s.name,
              isOnline: s.isOnline,
              joinedAt: s.joinedAt,
              lastSeenAt: s.lastSeenAt,
              deviceType: s.deviceType,
              deviceOs: s.deviceOs,
              deviceBrowser: s.deviceBrowser,
              violations: s.violations || []
            };
          });
        }
        setStudents(studentMap);
      });

      socket.on('dashboard:session_created', (session: Session) => {
        // If in overview, update active session
        if (!sessionCodeRef.current) {
          setActiveSession(session);
          // Also add to history if not there? But usually it's active.
        }
      });

      socket.on('dashboard:session_ended', (session: Session) => {
        // Update in both views
        setActiveSession(prev => prev && prev.code === session.code ? session : prev);
      });

      socket.on('dashboard:update', (data: DashboardUpdatePayload) => {
        setStudents(prev => {
          if (data.type === 'STUDENT_JOINED') {
            const student = prev[data.studentId];
            if (student) {
              return {
                ...prev,
                [data.studentId]: {
                  ...student,
                  isOnline: true,
                  name: data.name || student.name,
                  deviceType: data.deviceType || student.deviceType,
                  deviceOs: data.deviceOs || student.deviceOs,
                  deviceBrowser: data.deviceBrowser || student.deviceBrowser,
                }
              };
            } else {
              return {
                ...prev,
                [data.studentId]: {
                  studentId: data.studentId,
                  name: data.name,
                  isOnline: true,
                  deviceType: data.deviceType,
                  deviceOs: data.deviceOs,
                  deviceBrowser: data.deviceBrowser,
                  violations: []
                }
              };
            }
          } else if (data.type === 'STUDENT_LEFT') {
            const student = prev[data.studentId];
            if (student) {
              return {
                ...prev,
                [data.studentId]: {
                  ...student,
                  isOnline: false
                }
              };
            }
          }
          return prev;
        });
      });

      socket.on('dashboard:alert', (data: DashboardAlertPayload) => {
        setStudents(prev => {
          const student = prev[data.studentId];
          if (!student) return prev;

          return {
            ...prev,
            [data.studentId]: {
              ...student,
              violations: [data.violation, ...student.violations]
            }
          };
        });
      });

      socket.on('dashboard:error', (data: { message: string }) => {
        const msg = data.message || 'An unknown error occurred';
        setError(msg);
        if (msg.toLowerCase().includes('unauthorized')) {
          setIsAuthError(true);
        }
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });
    };

    setupListeners();

    return () => {
      socket.disconnect();
    };
  }, []); // Re-evaluated socket instantiation only on mount

  // Join the correct room dynamically
  useEffect(() => {
    if (!isConnected || !socketRef.current) return;
    if (sessionCode) {
      socketRef.current.emit('dashboard:join_session', { sessionCode });
    } else {
      socketRef.current.emit('dashboard:join_overview');
    }
  }, [isConnected, sessionCode]);

  const createSession = useCallback((durationMinutes?: number) => {
    socketRef.current?.emit('teacher:create_session', durationMinutes ? { durationMinutes } : {});
  }, []);

  const endSession = useCallback(() => {
    socketRef.current?.emit('teacher:end_session');
  }, []);

  return { isConnected, students, activeSession, history, error, isAuthError, serverTimeOffset, createSession, endSession };
};
