import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface SessionTimerInfo {
  createdAt: string;
  durationMinutes: number | null;
}

export const useExamSocket = (studentId: string, name: string, sessionCode: string, onSessionEnded?: () => void) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTimer, setSessionTimer] = useState<SessionTimerInfo | null>(null);
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
      setIsConnected(true);
      setError('');
      // Don't set isRegisteredRef true yet, wait for ack
      isRegisteredRef.current = false;
      socket.emit('register', { studentId, name, sessionCode });
    });

    socket.on('registration_error', (msg: string) => {
      setError(msg);
      socket.disconnect(); // Disconnect if invalid
    });

    socket.on('session:ended', () => {
      if (onSessionEnded) onSessionEnded();
    });

    socket.on('registered', (data: { studentId: string; session?: SessionTimerInfo }) => {
      isRegisteredRef.current = true;
      setError('');

      if (data.session) {
        setSessionTimer(data.session);
      }

      if (violationQueue.current.length > 0) {
        violationQueue.current.forEach(v => {
          socket.emit('report_violation', { studentId, type: v.type, details: v.details });
        });
        violationQueue.current = [];
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      isRegisteredRef.current = false;
    });

    // Server-side sniffer challenge handler
    socket.on('sniffer:challenge', async (data: { challengeId: string; targetUrl: string }) => {
      const { challengeId, targetUrl } = data;
      try {
        const probeUrl = `${targetUrl}/favicon.ico?t=${Date.now()}`;
        const reachable = await new Promise<boolean>((resolve) => {
          const img = new Image();
          const timer = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = '';
            resolve(false);
          }, 4000);
          img.onload = () => {
            clearTimeout(timer);
            resolve(true);
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
          img.src = probeUrl;
        });
        socket.emit('sniffer:response', { challengeId, reachable });
      } catch {
        socket.emit('sniffer:response', { challengeId, reachable: false });
      }
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
      violationQueue.current.push({ type, details });
    }
  }, [studentId]);

  return { isConnected, sendHeartbeat, reportViolation, error, sessionTimer };
};

