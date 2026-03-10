/**
 * IndexedDB helpers for the exam proctoring Service Worker probe store.
 *
 * The Service Worker writes probe results here; the main app reads and
 * clears them on reconnection.  Uses the same DB_NAME / STORE_NAME
 * constants as the SW file (public/exam-sw.js).
 */

const DB_NAME = 'exam-proctor';
const DB_VERSION = 1;
const STORE_NAME = 'sw-probes';

export interface SwProbeRecord {
  id?: number;
  timestamp: number;
  reachable: boolean;
  source: string;
}

/**
 * Open (or create) the IndexedDB database.
 */
const openDB = (): Promise<IDBDatabase> => {
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
};

/**
 * Read ALL probe records from the store.
 */
export const readAllProbes = async (): Promise<SwProbeRecord[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as SwProbeRecord[]);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear ALL probe records.  Called after the main app has consumed
 * and reported the records as violations.
 */
export const clearAllProbes = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Write a probe record. Used by the main-thread (e.g. on reconnection)
 * to store its own probe results alongside the SW's records.
 */
export const addProbeRecord = async (record: Omit<SwProbeRecord, 'id'>): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
