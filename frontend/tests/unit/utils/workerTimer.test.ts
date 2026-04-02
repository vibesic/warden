import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('workerTimer', () => {
  let originalWorker: any;
  let originalCreateObjectURL: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    originalWorker = globalThis.Worker;
    originalCreateObjectURL = globalThis.URL.createObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.Worker = originalWorker;
    if (globalThis.URL) globalThis.URL.createObjectURL = originalCreateObjectURL;
  });

  it('should fallback to setInterval when Worker is unavailable', async () => {
    delete (globalThis as any).Worker;
    const { setWorkerInterval, clearWorkerInterval } = await import('../../../src/utils/workerTimer');
    
    const callback = vi.fn();
    const id = setWorkerInterval(callback, 100);
    expect(id).toBeDefined();
    
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    clearWorkerInterval(id);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    
    clearWorkerInterval(999);
  });

  it('should initialize and use Worker when available', async () => {
    const postMessageMock = vi.fn();
    let workerOnMessage: any;

    class MockWorker {
      set onmessage(cb: any) { workerOnMessage = cb; }
      postMessage = postMessageMock;
    }
    
    globalThis.Worker = MockWorker as any;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:url');

    const { setWorkerInterval, clearWorkerInterval } = await import('../../../src/utils/workerTimer?' + Date.now());

    const callback = vi.fn();
    const id = setWorkerInterval(callback, 100);

    expect(postMessageMock).toHaveBeenCalledWith({ command: 'start', id, interval: 100 });
    
    workerOnMessage({ data: { id } });
    expect(callback).toHaveBeenCalledTimes(1);

    workerOnMessage({ data: { id: 999 } });

    clearWorkerInterval(id);
    expect(postMessageMock).toHaveBeenCalledWith({ command: 'stop', id });
    
    clearWorkerInterval(id);
  });

  it('should gracefully fallback if Worker instantiation throws', async () => {
    class MockWorker {
      constructor() { throw new Error('Blocked by CSP'); }
    }
    
    globalThis.Worker = MockWorker as any;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:url');

    const { setWorkerInterval, clearWorkerInterval } = await import('../../../src/utils/workerTimer?' + Date.now());

    const callback = vi.fn();
    const id = setWorkerInterval(callback, 100);
    
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    clearWorkerInterval(id);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
