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

describe('useExamSocket', () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
  });

  const importHook = async () => {
    const mod = await import('@src/hooks/useExamSocket');
    return mod.useExamSocket;
  };

  describe('Connection & Registration', () => {
    it('should connect and register on mount', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));

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

    it('should disconnect on unmount', async () => {
      const useExamSocket = await importHook();
      const { unmount } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Empty Inputs Guard', () => {
    it('should not connect when studentId is empty', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('', 'Alice', '123456'));
      expect(mockSocket.on).not.toHaveBeenCalled();
    });

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

  describe('Session Ended Flow', () => {
    it('should call onSessionEnded and disconnect when session:ended fires', async () => {
      const useExamSocket = await importHook();
      const onSessionEnded = vi.fn();
      renderHook(() => useExamSocket('S001', 'Alice', '123456', onSessionEnded));

      act(() => {
        mockSocket.simulateEvent('session:ended');
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(onSessionEnded).toHaveBeenCalledOnce();
    });

    it('should reset isRegistered so heartbeat stops after session ends', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('registered', { studentId: 'S001' });
      });

      act(() => {
        mockSocket.simulateEvent('session:ended');
      });

      mockSocket.emit.mockClear();
      act(() => {
        result.current.sendHeartbeat();
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith('heartbeat', expect.anything());
    });
  });

  describe('Registration Error Handling', () => {
    it('should disconnect and set error on registration_error', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('registration_error', 'Invalid session');
      });

      expect(result.current.error).toBe('Invalid session');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle Session has ended error', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('registration_error', 'Session has ended');
      });

      expect(result.current.error).toBe('Session has ended');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Heartbeat', () => {
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
      });

      mockSocket.emit.mockClear();
      act(() => {
        result.current.sendHeartbeat();
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith('heartbeat', expect.anything());
    });
  });

  describe('Violation Reporting', () => {
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

    it('should queue violations when not yet registered and flush on registration', async () => {
      const useExamSocket = await importHook();
      const { result } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      mockSocket.connected = false;
      act(() => {
        result.current.reportViolation('INTERNET_ACCESS', 'first');
        result.current.reportViolation('DISCONNECTION', 'second');
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith('report_violation', expect.anything());

      mockSocket.connected = true;
      act(() => {
        mockSocket.simulateEvent('connect');
        mockSocket.simulateEvent('registered', { studentId: 'S001' });
      });

      const violationCalls = mockSocket.emit.mock.calls.filter(
        (args: unknown[]) => args[0] === 'report_violation',
      );
      expect(violationCalls).toHaveLength(2);
      expect(violationCalls[0][1]).toMatchObject({ type: 'INTERNET_ACCESS', details: 'first' });
      expect(violationCalls[1][1]).toMatchObject({ type: 'DISCONNECTION', details: 'second' });
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

      act(() => {
        mockSocket.simulateEvent('violation:detected', { type: 'INTERNET_ACCESS' });
      });
    });
  });

  describe('Sniffer Challenge', () => {
    it('should respond reachable=true when image loads', async () => {
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
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('sniffer:response', {
        challengeId: 'ch-1',
        reachable: true,
      });

      globalThis.Image = originalImage;
    });

    it('should respond reachable=false when image errors', async () => {
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

  describe('Tab-Closing Signal (beforeunload)', () => {
    it('should register a beforeunload listener on mount', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      const beforeUnloadCalls = addSpy.mock.calls.filter(
        (args) => args[0] === 'beforeunload',
      );
      expect(beforeUnloadCalls).toHaveLength(1);

      addSpy.mockRestore();
    });

    it('should emit student:tab-closing on beforeunload when connected', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      act(() => {
        mockSocket.simulateEvent('connect');
      });

      window.dispatchEvent(new Event('beforeunload'));

      const tabClosingCalls = mockSocket.emit.mock.calls.filter(
        (args: unknown[]) => args[0] === 'student:tab-closing',
      );
      expect(tabClosingCalls).toHaveLength(1);
    });

    it('should NOT emit student:tab-closing when disconnected', async () => {
      const useExamSocket = await importHook();
      renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      mockSocket.connected = false;

      window.dispatchEvent(new Event('beforeunload'));

      const tabClosingCalls = mockSocket.emit.mock.calls.filter(
        (args: unknown[]) => args[0] === 'student:tab-closing',
      );
      expect(tabClosingCalls).toHaveLength(0);
    });

    it('should remove beforeunload listener on unmount', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const useExamSocket = await importHook();
      const { unmount } = renderHook(() => useExamSocket('S001', 'Alice', '123456'));

      unmount();

      const beforeUnloadCalls = removeSpy.mock.calls.filter(
        (args) => args[0] === 'beforeunload',
      );
      expect(beforeUnloadCalls).toHaveLength(1);

      removeSpy.mockRestore();
    });
  });
});
