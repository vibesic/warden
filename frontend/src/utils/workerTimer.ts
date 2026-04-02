const workerCode = `
  const timers = new Map();
  self.onmessage = (e) => {
    const { command, id, interval } = e.data;
    if (command === 'start') {
      if (timers.has(id)) clearInterval(timers.get(id));
      const sysId = setInterval(() => {
        postMessage({ id });
      }, interval);
      timers.set(id, sysId);
    } else if (command === 'stop') {
      const sysId = timers.get(id);
      if (sysId) {
        clearInterval(sysId);
        timers.delete(id);
      }
    }
  };
`;

let worker: Worker | null = null;
const callbackMap = new Map<number, () => void>();
let nextId = 1;

const initWorker = () => {
  if (worker || typeof Worker === 'undefined' || typeof URL === 'undefined') return;
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => {
      const id = e.data.id;
      const cb = callbackMap.get(id);
      if (cb) cb();
    };
  } catch (err) {
    // Graceful fallback if Worker fails to initialize
    console.warn('Worker initialization failed, falling back to setInterval', err);
  }
};

export const setWorkerInterval = (callback: () => void, ms: number): number => {
  if (typeof Worker === 'undefined' || typeof URL === 'undefined') {
    // Fallback for tests/environments without Web Workers
    const sysId = setInterval(callback, ms) as unknown as number;
    callbackMap.set(sysId, callback);
    return sysId;
  }
  
  if (!worker) initWorker();
  
  // If worker initialization failed, fallback again
  if (!worker) {
    const sysId = setInterval(callback, ms) as unknown as number;
    callbackMap.set(sysId, callback);
    return sysId;
  }

  const id = nextId++;
  callbackMap.set(id, callback);
  worker?.postMessage({ command: 'start', id, interval: ms });
  return id;
};

export const clearWorkerInterval = (id: number): void => {
  if (!callbackMap.has(id)) return;
  
  if (typeof Worker === 'undefined' || typeof URL === 'undefined' || !worker) {
    clearInterval(id as number);
    callbackMap.delete(id);
    return;
  }

  callbackMap.delete(id);
  worker?.postMessage({ command: 'stop', id });
};
