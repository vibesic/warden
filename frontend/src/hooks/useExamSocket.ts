import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import {
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_RECONNECTION_DELAY_MAX_MS,
  CHALLENGE_PROBE_TIMEOUT_MS,
} from '../config/constants';

export interface SessionTimerInfo {
  createdAt: string;
  durationMinutes: number | null;
}

export const useExamSocket = (studentId: string, name: string, sessionCode: string, onSessionEnded?: () => void, onServerViolation?: (type: string) => void) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [sessionTimer, setSessionTimer] = useState<SessionTimerInfo | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const isRegisteredRef = useRef(false);
  const violationQueue = useRef<{ type: string; reason?: string; details?: string }[]>([]);
  const onSessionEndedRef = useRef(onSessionEnded);
  const onServerViolationRef = useRef(onServerViolation);

  onSessionEndedRef.current = onSessionEnded;
  onServerViolationRef.current = onServerViolation;

  useEffect(() => {
    if (!studentId || !name || !sessionCode) return;

    // Prevent multiple connections if parameters haven't changed and socket exists
    if (socketRef.current?.connected) return;

    socketRef.current = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX_MS,
      transports: ['websocket'],
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
      isRegisteredRef.current = false;
      socket.disconnect();
      onSessionEndedRef.current?.();
    });

    // Server-pushed violation — sniffer detected internet access server-side
    socket.on('violation:detected', (data: { type: string }) => {
      onServerViolationRef.current?.(data.type);
    });

    socket.on('registered', (data: { studentId: string; session?: SessionTimerInfo; serverTime?: number }) => {
      isRegisteredRef.current = true;
      setError('');

      if (data.session) {
        setSessionTimer(data.session);
      }

      if (data.serverTime) {
        setServerTimeOffset(data.serverTime - Date.now());
      }

      if (violationQueue.current.length > 0) {
        violationQueue.current.forEach(v => {
          socket.emit('report_violation', { studentId, type: v.type, reason: v.reason, details: v.details });
        });
        violationQueue.current = [];
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      isRegisteredRef.current = false;
    });

    // Notify server before tab/window closes so it can distinguish
    // intentional close from WiFi loss.
    const handleBeforeUnload = (): void => {
      if (socket.connected) {
        socket.emit('student:tab-closing');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

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
          }, CHALLENGE_PROBE_TIMEOUT_MS);
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
      window.removeEventListener('beforeunload', handleBeforeUnload);
      socket.disconnect();
    };
    // onSessionEnded/onServerViolation accessed via refs to avoid re-creating socket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, name, sessionCode]);

  const sendHeartbeat = useCallback(() => {
    if (socketRef.current?.connected && isRegisteredRef.current) {
      socketRef.current.emit('heartbeat', { studentId });
    }
  }, [studentId]);

  const reportViolation = useCallback((type: string, details?: string, reason?: string) => {
    if (socketRef.current?.connected && isRegisteredRef.current) {
      socketRef.current.emit('report_violation', { studentId, type, reason, details });
    } else {
      // Deduplicate queued violations — prevent burst of identical reports
      // when WiFi flaps cause rapid disconnect/reconnect cycles.
      const isDuplicate = violationQueue.current.some(
        (v) => v.type === type && v.details === details,
      );
      if (!isDuplicate) {
        violationQueue.current.push({ type, reason, details });
      }
    }
  }, [studentId]);

  return { isConnected, sendHeartbeat, reportViolation, error, sessionTimer, serverTimeOffset };
};

