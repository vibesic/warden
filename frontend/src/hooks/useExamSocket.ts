import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const useExamSocket = (studentId: string, name: string, sessionCode: string, onSessionEnded?: () => void) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const isRegisteredRef = useRef(false);
  const violationQueue = useRef<{ type: string, details?: string }[]>([]);

  useEffect(() => {
    if (!studentId || !name || !sessionCode) return;

    // Prevent multiple connections if parameters haven't changed and socket exists
    if (socketRef.current?.connected) return;

    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to exam server');
      setIsConnected(true);
      setError('');
      // Don't set isRegisteredRef true yet, wait for ack
      isRegisteredRef.current = false;
      socket.emit('register', { studentId, name, sessionCode });
    });

    socket.on('registration_error', (msg: string) => {
      console.error('Registration failed:', msg);
      setError(msg);
      socket.disconnect(); // Disconnect if invalid
    });

    socket.on('session:ended', () => {
      console.log('Session ended by teacher');
      if (onSessionEnded) onSessionEnded();
    });

    socket.on('registered', () => {
      console.log('Registration confirmed, flushing queue. Queue length:', violationQueue.current.length);
      isRegisteredRef.current = true;
      setError(''); // Clear error if any (e.g. from retry)

      if (violationQueue.current.length > 0) {
        violationQueue.current.forEach(v => {
          console.log('Flushing violation:', v);
          socket.emit('report_violation', { studentId, type: v.type, details: v.details });
        });
        violationQueue.current = [];
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from exam server');
      setIsConnected(false);
      isRegisteredRef.current = false;
    });

    return () => {
      socket.disconnect();
    };
  }, [studentId, name, sessionCode, onSessionEnded]);

  const sendHeartbeat = useCallback(() => {
    if (socketRef.current?.connected && isRegisteredRef.current) {
      socketRef.current.emit('heartbeat', { studentId });
    }
  }, [studentId]);

  const reportViolation = useCallback((type: string, details?: string) => {
    if (socketRef.current?.connected && isRegisteredRef.current) {
      socketRef.current.emit('report_violation', { studentId, type, details });
    } else {
      console.warn('Socket offline or not registered, queuing violation report');
      violationQueue.current.push({ type, details });
    }
  }, [studentId]);

  return { isConnected, sendHeartbeat, reportViolation, error };
};

