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

describe('useTeacherSocket', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    localStorage.setItem('teacherToken', 'test-token');
  });

  const importHook = async () => {
    const mod = await import('../../hooks/useTeacherSocket');
    return mod.useTeacherSocket;
  };

  it('should connect and join overview when no sessionCode', async () => {
    const useTeacherSocket = await importHook();
    renderHook(() => useTeacherSocket());

    act(() => {
      mockSocket.simulateEvent('connect');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('dashboard:join_overview');
  });

  it('should connect and join session when sessionCode is provided', async () => {
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

  it('should update students on dashboard:session_state', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket('ABC'));

    const session = {
      id: '1',
      code: 'ABC',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    act(() => {
      mockSocket.simulateEvent('dashboard:session_state', {
        session,
        students: [
          {
            studentId: 'S001',
            name: 'Alice',
            isOnline: true,
            joinedAt: '2024-01-01T00:01:00Z',
            violations: [],
          },
        ],
      });
    });

    expect(result.current.students['S001']).toBeDefined();
    expect(result.current.students['S001'].name).toBe('Alice');
    expect(result.current.students['S001'].isOnline).toBe(true);
  });

  it('should update students on dashboard:update STUDENT_JOINED', async () => {
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

  it('should update students on dashboard:update STUDENT_LEFT', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket('ABC'));

    // First join
    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId: 'S002',
        name: 'Bob',
      });
    });

    // Then leave
    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_LEFT',
        studentId: 'S002',
      });
    });

    expect(result.current.students['S002'].isOnline).toBe(false);
  });

  it('should add violations on dashboard:alert', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket('ABC'));

    // First add a student
    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId: 'S001',
        name: 'Alice',
      });
    });

    // Then trigger alert
    act(() => {
      mockSocket.simulateEvent('dashboard:alert', {
        studentId: 'S001',
        violation: {
          type: 'INTERNET_ACCESS',
          timestamp: '2024-01-01T00:05:00Z',
        },
      });
    });

    expect(result.current.students['S001'].violations).toHaveLength(1);
    expect(result.current.students['S001'].violations[0].type).toBe('INTERNET_ACCESS');
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

  it('should emit teacher:create_session when createSession is called', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket());

    act(() => {
      result.current.createSession(60);
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('teacher:create_session', {
      durationMinutes: 60,
    });
  });

  it('should emit teacher:create_session without duration when none provided', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket());

    act(() => {
      result.current.createSession();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('teacher:create_session', {});
  });

  it('should emit teacher:end_session when endSession is called', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket());

    act(() => {
      result.current.endSession();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('teacher:end_session');
  });

  it('should disconnect on unmount', async () => {
    const useTeacherSocket = await importHook();
    const { unmount } = renderHook(() => useTeacherSocket());

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should handle dashboard:session_ended and update activeSession', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket());

    const session = {
      id: '1',
      code: '123456',
      isActive: true,
      createdAt: '2024-01-01T00:00:00Z',
    };

    // Set active session first via overview
    act(() => {
      mockSocket.simulateEvent('dashboard:overview', {
        activeSession: session,
        history: [session],
      });
    });

    // Now simulate session ended with matching code
    const endedSession = { ...session, isActive: false, endedAt: '2024-01-01T01:00:00Z' };
    act(() => {
      mockSocket.simulateEvent('dashboard:session_ended', endedSession);
    });

    expect(result.current.activeSession?.isActive).toBe(false);
  });

  it('should update existing student on STUDENT_JOINED', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket('ABC'));

    // Add student via session_state
    act(() => {
      mockSocket.simulateEvent('dashboard:session_state', {
        session: { id: '1', code: 'ABC', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
        students: [
          { studentId: 'S001', name: 'Alice', isOnline: false, violations: [{ type: 'INTERNET_ACCESS', timestamp: '2024-01-01T00:05:00Z' }] },
        ],
      });
    });

    // Rejoin — existing student
    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId: 'S001',
        name: 'Alice',
      });
    });

    expect(result.current.students['S001'].isOnline).toBe(true);
    // Violations should be preserved
    expect(result.current.students['S001'].violations).toHaveLength(1);
  });

  it('should ignore dashboard:update when no sessionCode', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket()); // No sessionCode

    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_JOINED',
        studentId: 'S001',
        name: 'Alice',
      });
    });

    // Should not have added any students (guard returns early)
    expect(Object.keys(result.current.students)).toHaveLength(0);
  });

  it('should handle STUDENT_LEFT for non-existing student safely', async () => {
    const useTeacherSocket = await importHook();
    const { result } = renderHook(() => useTeacherSocket('ABC'));

    act(() => {
      mockSocket.simulateEvent('dashboard:update', {
        type: 'STUDENT_LEFT',
        studentId: 'S999',
      });
    });

    // Should not crash; student doesn't exist
    expect(result.current.students['S999']).toBeUndefined();
  });
});
