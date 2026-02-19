import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Violation {
  type: string;
  details?: string;
  timestamp: string;
}

export interface StudentStatus {
  studentId: string;
  name?: string;
  isOnline: boolean;
  joinedAt?: string;
  lastSeenAt?: string;
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
  violations: Violation[];
}

interface DashboardUpdatePayload {
  type: 'STUDENT_JOINED' | 'STUDENT_LEFT';
  studentId: string;
  name?: string;
  isOnline?: boolean;
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
  // Use state to track current session code if we want to switch rooms? 
  // But hook is re-initialized if sessionCode prop changes because of dependency array.

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('teacherToken') || '';
    socketRef.current = io(SOCKET_URL, {
      auth: { token },
    });
    const socket = socketRef.current;

    const setupListeners = () => {
      socket.on('connect', () => {
        setIsConnected(true);
        if (sessionCode) {
          socket.emit('dashboard:join_session', { sessionCode });
        } else {
          socket.emit('dashboard:join_overview');
        }
      });

      socket.on('dashboard:overview', (data: { activeSession: Session | null, history: Session[] }) => {
        setActiveSession(data.activeSession);
        setHistory(data.history || []);
      });

      socket.on('dashboard:session_state', (data: { session: Session, students: SessionStateStudent[] }) => {
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
              violations: s.violations || []
            };
          });
        }
        setStudents(studentMap);
      });

      socket.on('dashboard:session_created', (session: Session) => {
        // If in overview, update active session
        if (!sessionCode) {
          setActiveSession(session);
          // Also add to history if not there? But usually it's active.
        }
      });

      socket.on('dashboard:session_ended', (session: Session) => {
        // Update in both views
        setActiveSession(prev => prev && prev.code === session.code ? session : prev);
      });

      socket.on('dashboard:update', (data: DashboardUpdatePayload) => {
        if (!sessionCode) return;

        setStudents(prev => {
          const newState = { ...prev };
          if (data.type === 'STUDENT_JOINED') {
            if (newState[data.studentId]) {
              newState[data.studentId] = {
                ...newState[data.studentId],
                isOnline: true,
                name: data.name || newState[data.studentId].name
              };
            } else {
              newState[data.studentId] = {
                studentId: data.studentId,
                name: data.name,
                isOnline: true,
                violations: []
              };
            }
          } else if (data.type === 'STUDENT_LEFT') {
            if (newState[data.studentId]) {
              newState[data.studentId] = {
                ...newState[data.studentId],
                isOnline: false
              };
            }
          }
          return newState;
        });
      });

      socket.on('dashboard:alert', (data: DashboardAlertPayload) => {
        if (!sessionCode) return;

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

      socket.on('disconnect', () => {
        setIsConnected(false);
      });
    };

    setupListeners();

    return () => {
      socket.disconnect();
    };
  }, [sessionCode]);

  const createSession = useCallback((durationMinutes?: number) => {
    socketRef.current?.emit('teacher:create_session', durationMinutes ? { durationMinutes } : {});
  }, []);

  const endSession = useCallback(() => {
    socketRef.current?.emit('teacher:end_session');
  }, []);

  return { isConnected, students, activeSession, history, createSession, endSession };
};
