import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Socket } from 'socket.io-client';
import { createMockSocket, MockSocket } from '../../helpers/mockSocket';

/* ---------- socket.io-client mock --------------------------------------- */

let mockSocket: MockSocket;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket as unknown as Socket),
}));

/* ---------- tests ------------------------------------------------------- */

describe('useTeacherSocket', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    localStorage.clear();
    sessionStorage.setItem('teacherToken', 'test-token');
  });

  const importHook = async () => {
    const mod = await import('@src/hooks/useTeacherSocket');
    return mod.useTeacherSocket;
  };

  describe('Connection & Routing', () => {
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
      renderHook(() => useTeacherSocket('ABC123'));

      act(() => {
        mockSocket.simulateEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:join_session', {
        sessionCode: 'ABC123',
      });
    });

    it('should set isConnected to true on connect', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('connect');
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('should set isConnected to false on disconnect', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('connect');
      });
      act(() => {
        mockSocket.simulateEvent('disconnect');
      });

      expect(result.current.isConnected).toBe(false);
    });

    it('should disconnect on unmount', async () => {
      const useTeacherSocket = await importHook();
      const { unmount } = renderHook(() => useTeacherSocket());

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Overview Data', () => {
    it('should update activeSession and history on dashboard:overview', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      const session = {
        id: '1',
        code: '123456',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      };

      act(() => {
        mockSocket.simulateEvent('dashboard:overview', {
          activeSession: session,
          history: [session],
        });
      });

      expect(result.current.activeSession).toEqual(session);
      expect(result.current.history).toEqual([session]);
    });

    it('should update activeSession on dashboard:session_created', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      const newSession = {
        id: '2',
        code: '654321',
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      };

      act(() => {
        mockSocket.simulateEvent('dashboard:session_created', newSession);
      });

      expect(result.current.activeSession).toEqual(newSession);
    });
  });

  describe('Session State', () => {
    it('should populate students from dashboard:session_state', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: '1', code: 'ABC', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [
            { studentId: 'S001', name: 'Alice', isOnline: true, joinedAt: '2024-01-01T00:01:00Z', violations: [] },
          ],
        });
      });

      expect(result.current.students['S001']).toBeDefined();
      expect(result.current.students['S001'].name).toBe('Alice');
      expect(result.current.students['S001'].isOnline).toBe(true);
    });

    it('should compute serverTimeOffset from session_state', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      const fakeServerTime = Date.now() + 5000;
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          serverTime: fakeServerTime,
          students: [],
        });
      });

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

  describe('Session Ended', () => {
    it('should update activeSession when dashboard:session_ended fires', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [],
        });
      });

      expect(result.current.activeSession?.isActive).toBe(true);

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
    it('should add student on STUDENT_JOINED', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:update', {
          type: 'STUDENT_JOINED',
          studentId: 'S002',
          name: 'Bob',
          isOnline: true,
        });
      });

      expect(result.current.students['S002']).toBeDefined();
      expect(result.current.students['S002'].isOnline).toBe(true);
    });

    it('should mark student offline on STUDENT_LEFT', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_JOINED', studentId: 'S002', name: 'Bob' });
      });
      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_LEFT', studentId: 'S002' });
      });

      expect(result.current.students['S002'].isOnline).toBe(false);
    });

    it('should update existing student on rejoin and preserve violations', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: '1', code: 'ABC', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [
            { studentId: 'S001', name: 'Alice', isOnline: false, violations: [{ type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' }] },
          ],
        });
      });

      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_JOINED', studentId: 'S001', name: 'Alice' });
      });

      expect(result.current.students['S001'].isOnline).toBe(true);
      expect(result.current.students['S001'].violations).toHaveLength(1);
    });

    it('should handle STUDENT_LEFT for non-existing student safely', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_LEFT', studentId: 'S999' });
      });

      expect(result.current.students['S999']).toBeUndefined();
    });

    it('should ignore dashboard:update when no sessionCode', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_JOINED', studentId: 'S001', name: 'Alice' });
      });

      expect(Object.keys(result.current.students)).toHaveLength(0);
    });
  });

  describe('Violations', () => {
    it('should add violation on dashboard:alert', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('ABC'));

      act(() => {
        mockSocket.simulateEvent('dashboard:update', { type: 'STUDENT_JOINED', studentId: 'S001', name: 'Alice' });
      });

      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'S001',
          violation: { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        });
      });

      expect(result.current.students['S001'].violations).toHaveLength(1);
      expect(result.current.students['S001'].violations[0].type).toBe('INTERNET_ACCESS');
    });

    it('should accumulate multiple violations (most recent first)', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket('123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('dashboard:session_state', {
          session: { id: 's1', code: '123456', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
          students: [{ studentId: 'S001', name: 'Alice', isOnline: true, violations: [] }],
        });
      });

      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'S001',
          violation: { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        });
      });

      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'S001',
          violation: { type: 'DISCONNECTION', timestamp: '2024-01-01T00:06:00Z' },
        });
      });

      expect(result.current.students['S001'].violations).toHaveLength(2);
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

      act(() => {
        mockSocket.simulateEvent('dashboard:alert', {
          studentId: 'UNKNOWN',
          violation: { type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' },
        });
      });

      expect(result.current.students['UNKNOWN']).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
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

  describe('Session Actions', () => {
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

    it('should emit teacher:end_session', async () => {
      const useTeacherSocket = await importHook();
      const { result } = renderHook(() => useTeacherSocket());

      act(() => {
        result.current.endSession();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('teacher:end_session');
    });
  });
});
