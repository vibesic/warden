import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Socket } from 'socket.io-client';

/* ---------- socket.io-client mock --------------------------------------- */

type EventHandler = (...args: unknown[]) => void;

interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
  handlers: Record<string, EventHandler[]>;
  simulateEvent: (event: string, ...args: unknown[]) => void;
}

const createMockSocket = (): MockSocket => {
  const handlers: Record<string, EventHandler[]> = {};
  const mockSocket: MockSocket = {
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return mockSocket;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
    handlers,
    simulateEvent: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
  return mockSocket;
};

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket as unknown as Socket),
}));

/* ---------- tests ------------------------------------------------------- */

describe('useTeacherSocket — Reliability & Security', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    localStorage.clear();
    localStorage.setItem('teacherToken', 'valid-token');
  });

  const importHook = async () => {
    const mod = await import('@src/hooks/useTeacherSocket');
    return mod.useTeacherSocket;
  };

  describe('Server Time Offset (Clock Skew)', () => {
    it('should compute serverTimeOffset from session_state', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      // Simulate connect + session_state with serverTime
      const fakeServerTime = Date.now() + 5000; // Server is 5s ahead
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          serverTime: fakeServerTime,
          students: [],
        });
      });

      // serverTimeOffset should be approximately 5000ms (server ahead of client)
      expect(result.current.serverTimeOffset).toBeGreaterThan(4000);
      expect(result.current.serverTimeOffset).toBeLessThan(6000);
    });

    it('should default serverTimeOffset to 0 when no serverTime provided', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [],
        });
      });

      expect(result.current.serverTimeOffset).toBe(0);
    });
  });

  describe('Auth Error Detection', () => {
    it('should set isAuthError when Unauthorized error received', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('dashboard:error', {
          message: 'Unauthorized: invalid or missing teacher token',
        });
      });

      expect(result.current.isAuthError).toBe(true);
      expect(result.current.error).toContain('Unauthorized');
    });

    it('should NOT set isAuthError for non-auth errors', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('dashboard:error', {
          message: 'Session not found',
        });
      });

      expect(result.current.isAuthError).toBe(false);
      expect(result.current.error).toBe('Session not found');
    });
  });

  describe('Session State Updates', () => {
    it('should handle dashboard:session_ended and update activeSession', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      // First get session state
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [],
        });
      });

      expect(result.current.activeSession?.isActive).toBe(true);

      // Session ends
      act(() => {
        mockSocket.simulateEvent('dashboard:session_ended', {
          id: 's1',
          code: '123456',
          isActive: false,
          createdAt: '2024-01-01T00:00:00Z',
          endedAt: '2024-01-01T01:00:00Z',
        });
      });

      expect(result.current.activeSession?.isActive).toBe(false);
    });
  });

  describe('Student Tracking', () => {
    it('should accumulate violations for same student', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      // Set up initial students
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [
            { studentId: 'S001', name: 'Alice', isOnline: true, violations: [] },
          ],
        });
      });

      // First violation
      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'S001',
          violation: { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        });
      });

      expect(result.current.students['S001'].violations).toHaveLength(1);

      // Second violation
      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'S001',
          violation: { type: 'DISCONNECTION', timestamp: '2024-01-01T00:06:00Z' },
        });
      });

      expect(result.current.students['S001'].violations).toHaveLength(2);
      // Most recent violation should be first (prepended)
      expect(result.current.students['S001'].violations[0].type).toBe('DISCONNECTION');
    });

    it('should ignore alert for unknown student gracefully', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [],
        });
      });

      // Alert for non-existing student - should not crash
      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'UNKNOWN',
          violation: { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        });
      });

      expect(result.current.students['UNKNOWN']).toBeUndefined();
    });
  });

  describe('Create Session Flow', () => {
    it('should emit teacher:create_session with durationMinutes', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        result.current.createSession(90);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('teacher:create_session', { durationMinutes: 90 });
    });

    it('should emit teacher:create_session with empty object when no duration', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        result.current.createSession();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('teacher:create_session', {});
    });
  });

  describe('End Session Flow', () => {
    it('should emit teacher:end_session', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        result.current.endSession();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('teacher:end_session');
    });
  });

  describe('Overview Mode vs Session Mode', () => {
    it('should join overview when no sessionCode', async () => {
      const useTeacherSocket = await importHook();
      renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:join_overview');
    });

    it('should join session when sessionCode provided', async () => {
      const useTeacherSocket = await importHook();
      renderHook(() => useTeacherSocket('ABCDEF'));

      act(() => {
        mockSocket.simulateEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:join_session', { sessionCode: 'ABCDEF' });
    });
  });
});
