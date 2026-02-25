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

describe('useExamSocket — Reliability & Security', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
  });

  const importHook = async () => {
    const mod = await import('../../hooks/useExamSocket');
    return mod.useExamSocket;
  };

  describe('Session Ended Flow', () => {
    it('should disconnect socket when session:ended is received', async () => {
      const useExamSocket = await importHook();
      const onSessionEnded = vi.fn();
      renderHook(() => useExamSocket('S001', 'Alice', '123456', onSessionEnded));

      act(() => {
        mockSocket.simulateEvent('session:ended');
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(onSessionEnded).toHaveBeenCalledOnce();
    });

    it('should reset isRegistered when session:ended fires', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      // Register first
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('registered', { studentId: 'S001' });
      });

      // Session ends
      act(() => {
        mockSocket.simulateEvent('session:ended');
      });

      // Heartbeat should not emit because isRegistered is false
      mockSocket.emit.mockClear();
      act(() => {
        result.current.sendHeartbeat();
      });

      // Should not have emitted heartbeat
      expect(mockSocket.emit).not.toHaveBeenCalledWith('heartbeat', expect.anything());
    });
  });

  describe('Registration Error Handling', () => {
    it('should disconnect and set error on registration_error', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('registration_error', 'Invalid session code');
      });

      expect(result.current.error).toBe('Invalid session code');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect and set error on Session has ended', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('registration_error', 'Session has ended');
      });

      expect(result.current.error).toBe('Session has ended');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Violation Queue Flushing', () => {
    it('should flush multiple queued violations on registration', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      // Queue violations before registered
      mockSocket.connected = false;
      act(() => {
        result.current.reportViolation('INTERNET_ACCESS', 'first');
        result.current.reportViolation('CONNECTION_LOST', 'second');
      });

      // Now register
      mockSocket.connected = true;
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('registered', { studentId: 'S001' });
      });

      // Both should be flushed
      const violationCalls = mockSocket.emit.mock.calls.filter(
        (args: unknown[]) => args[0] === 'report_violation',
      );
      expect(violationCalls).toHaveLength(2);
      expect(violationCalls[0][1]).toMatchObject({ type: 'INTERNET_ACCESS', details: 'first' });
      expect(violationCalls[1][1]).toMatchObject({ type: 'CONNECTION_LOST', details: 'second' });
    });
  });

  describe('Empty Inputs Guard', () => {
    it('should not connect when name is empty', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', '', '123456'));
      expect(mockSocket.on).not.toHaveBeenCalled();
    });

    it('should not connect when sessionCode is empty', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', ''));
      expect(mockSocket.on).not.toHaveBeenCalled();
    });
  });

  describe('Server Violation Handler', () => {
    it('should call onServerViolation with correct type', async () => {
      const useExamSocket = await importHook();
      const onServerViolation = vi.fn();
      renderHook(() => useExamSocket('S001', 'Alice', '123456', undefined, onServerViolation));

      act(() => {
        mockSocket.simulateEvent('violation:detected', { type: 'INTERNET_ACCESS' });
      });

      expect(onServerViolation).toHaveBeenCalledWith('INTERNET_ACCESS');
    });

    it('should not crash when onServerViolation is not provided', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      // Should not throw
      act(() => {
        mockSocket.simulateEvent('violation:detected', { type: 'INTERNET_ACCESS' });
      });
    });
  });

  describe('Heartbeat Guards', () => {
    it('should not send heartbeat when not connected', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      mockSocket.connected = false;
      act(() => {
        result.current.sendHeartbeat();
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith('heartbeat', expect.anything());
    });

    it('should not send heartbeat when connected but not registered', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        // NOT simulating 'registered'
      });

      mockSocket.emit.mockClear();
      act(() => {
        result.current.sendHeartbeat();
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith('heartbeat', expect.anything());
    });
  });
});
