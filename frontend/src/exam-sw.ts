/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = 'exam-proctor';
const DB_VERSION = 1;
const STORE_NAME = 'sw-probes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db: IDBDatabase, record: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const PROBE_TARGETS = [
  'https://www.google.com/favicon.ico',
  'https://www.microsoft.com/favicon.ico',
  'https://www.cloudflare.com/favicon.ico',
  'https://www.apple.com/favicon.ico',
  'https://www.amazon.com/favicon.ico',
];

function probeInternet(): Promise<boolean> {
  const shuffled = [...PROBE_TARGETS].sort(() => 0.5 - Math.random());
  const targets = shuffled.slice(0, 3);

  const promises = targets.map(url =>
    fetch(url + '?_sw=' + Date.now(), { mode: 'no-cors', cache: 'no-store' })
      .then(() => true)
      .catch(() => false)
  );

  return Promise.all(promises).then(results => results.some(r => r === true));
}

function probeAndStore(): Promise<void> {
  return probeInternet().then(reachable => {
    if (!reachable) return;
    return openDB().then(db => putRecord(db, {
      timestamp: Date.now(),
      reachable: true,
      source: 'background-sync',
    }));
  });
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'connectivity-probe') {
    event.waitUntil(
      probeAndStore().then(() => {
        return (self.registration as any).sync.register('connectivity-probe');
      })
    );
  }
});

self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'connectivity-probe-periodic') {
    event.waitUntil(probeAndStore());
  }
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'PROBE_NOW') {
    event.waitUntil(
      probeAndStore().then(() => {
        if (event.source) {
          (event.source as Client).postMessage({ type: 'PROBE_COMPLETE' });
        }
      })
    );
  }
});

export {}; // Ensure it's treated as a module
