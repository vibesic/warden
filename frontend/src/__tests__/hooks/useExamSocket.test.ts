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

describe('useExamSocket', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
  });

  const importHook = async () => {
    const mod = await import('../../hooks/useExamSocket');
    return mod.useExamSocket;
  };

  it('should connect and register on mount', async () => {
    const useExamSocket = await importHook();
    renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    // Should have registered connect listener
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));

    // Simulate connect event
    act(() => {
      mockSocket.simulateEvent('connect');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('register', {
      studentId: 'S001',
      name: 'Alice',
      sessionCode: '123456',
    });
  });

  it('should set isConnected to true on connect', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('connect');
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('should set isConnected to false on disconnect', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('connect');
    });
    act(() => {
      mockSocket.simulateEvent('disconnect');
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('should set error on registration_error', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('registration_error', 'Invalid session');
    });

    expect(result.current.error).toBe('Invalid session');
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should call onSessionEnded when session:ended fires', async () => {
    const useExamSocket = await importHook();
    const onSessionEnded = vi.fn();
    renderHook(() => useExamSocket('S001', 'Alice', '123456', onSessionEnded));

    act(() => {
      mockSocket.simulateEvent('session:ended');
    });

    expect(onSessionEnded).toHaveBeenCalledOnce();
  });

  it('should set sessionTimer on registered event', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('registered', {
        studentId: 'S001',
        session: { createdAt: '2024-01-01T00:00:00Z', durationMinutes: 60 },
      });
    });

    expect(result.current.sessionTimer).toEqual({
      createdAt: '2024-01-01T00:00:00Z',
      durationMinutes: 60,
    });
  });

  it('should send heartbeat when connected and registered', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('connect');
      mockSocket.simulateEvent('registered', { studentId: 'S001' });
    });

    act(() => {
      result.current.sendHeartbeat();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('heartbeat', { studentId: 'S001' });
  });

  it('should report violation when connected and registered', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    act(() => {
      mockSocket.simulateEvent('connect');
      mockSocket.simulateEvent('registered', { studentId: 'S001' });
    });

    act(() => {
      result.current.reportViolation('INTERNET_ACCESS', 'CDN reachable');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('report_violation', {
      studentId: 'S001',
      type: 'INTERNET_ACCESS',
      details: 'CDN reachable',
    });
  });

  it('should queue violations when not yet registered', async () => {
    const useExamSocket = await importHook();
    const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    // Report violation before registered
    act(() => {
      result.current.reportViolation('INTERNET_ACCESS');
    });

    // reportViolation should not have been emitted yet
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'report_violation',
      expect.anything()
    );

    // Now register — should flush queue
    act(() => {
      mockSocket.simulateEvent('connect');
      mockSocket.simulateEvent('registered', { studentId: 'S001' });
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('report_violation', {
      studentId: 'S001',
      type: 'INTERNET_ACCESS',
      details: undefined,
    });
  });

  it('should disconnect on unmount', async () => {
    const useExamSocket = await importHook();
    const { unmount } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should not connect when studentId is empty', async () => {
    const useExamSocket = await importHook();
    renderHook(() => useExamSocket('', 'Alice', '123456'));

    // io should not have been called since early return
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  it('should call onServerViolation when violation:detected fires', async () => {
    const useExamSocket = await importHook();
    const onServerViolation = vi.fn();
    renderHook(() =>
      useExamSocket('S001', 'Alice', '123456', undefined, onServerViolation)
    );

    act(() => {
      mockSocket.simulateEvent('violation:detected', { type: 'INTERNET_ACCESS' });
    });

    expect(onServerViolation).toHaveBeenCalledWith('INTERNET_ACCESS');
  });

  it('should respond reachable=true on sniffer:challenge when image loads', async () => {
    const useExamSocket = await importHook();
    renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    // Override global Image to intercept probe
    const originalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() { return this._src; }
      set src(value: string) {
        this._src = value;
        if (value && this.onload) {
          Promise.resolve().then(() => this.onload?.());
        }
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;

    await act(async () => {
      mockSocket.simulateEvent('sniffer:challenge', {
        challengeId: 'ch-1',
        targetUrl: 'http://example.com',
      });
      // Let microtasks resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('sniffer:response', {
      challengeId: 'ch-1',
      reachable: true,
    });

    globalThis.Image = originalImage;
  });

  it('should respond reachable=false on sniffer:challenge when image errors', async () => {
    const useExamSocket = await importHook();
    renderHook(() => useExamSocket('S001', 'Alice', '123456'));

    const originalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() { return this._src; }
      set src(value: string) {
        this._src = value;
        if (value && this.onerror) {
          Promise.resolve().then(() => this.onerror?.());
        }
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;

    await act(async () => {
      mockSocket.simulateEvent('sniffer:challenge', {
        challengeId: 'ch-2',
        targetUrl: 'http://unreachable.com',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('sniffer:response', {
      challengeId: 'ch-2',
      reachable: false,
    });

    globalThis.Image = originalImage;
  });
});
