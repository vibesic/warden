/**
 * Exam Proctoring Service Worker
 *
 * Runs in the browser process, independent of any tab.  Its sole
 * purpose is to detect internet connectivity while the exam app is
 * closed or disconnected.
 *
 * Mechanism:
 *   1. The main app registers a Background Sync tag ("connectivity-probe").
 *   2. When the device gains ANY network connectivity the browser wakes
 *      this SW and fires the `sync` event.
 *   3. The SW probes well-known external hosts.  If any respond, it
 *      writes a timestamped record to IndexedDB.
 *   4. When the student re-opens the exam app it reads IndexedDB and
 *      reports any internet-reachable timestamps as violations.
 *
 * This file is served from /public as plain JS because Service Workers
 * cannot be bundled by Vite — they must be a static top-level script.
 */

/* ------------------------------------------------------------------ */
/*  IndexedDB helpers (duplicated from app — SW has no module imports) */
/* ------------------------------------------------------------------ */

const DB_NAME = 'exam-proctor';
const DB_VERSION = 1;
const STORE_NAME = 'sw-probes';

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

/**
 * Write a probe result into the object store.
 * @param {IDBDatabase} db
 * @param {object} record
 * @returns {Promise<void>}
 */
function putRecord(db, record) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}

/* ------------------------------------------------------------------ */
/*  Probe logic                                                       */
/* ------------------------------------------------------------------ */

var PROBE_TARGETS = [
  'https://www.google.com/favicon.ico',
  'https://www.microsoft.com/favicon.ico',
  'https://www.cloudflare.com/favicon.ico',
  'https://www.apple.com/favicon.ico',
  'https://www.amazon.com/favicon.ico',
];

/**
 * Probe external hosts using `fetch` (Service Workers cannot use <img>).
 * mode: 'no-cors' is required for cross-origin requests from a SW.
 * An opaque response (status 0) still means the network was reachable.
 * A TypeError / network error means no connectivity.
 *
 * @returns {Promise<boolean>}  true if ANY target was reachable
 */
function probeInternet() {
  // Pick 3 random targets
  var shuffled = PROBE_TARGETS.slice().sort(function () { return 0.5 - Math.random(); });
  var targets = shuffled.slice(0, 3);

  var promises = targets.map(function (url) {
    return fetch(url + '?_sw=' + Date.now(), { mode: 'no-cors', cache: 'no-store' })
      .then(function () { return true; })   // opaque or OK — network reachable
      .catch(function () { return false; }); // network error
  });

  return Promise.all(promises).then(function (results) {
    return results.some(function (r) { return r === true; });
  });
}

/**
 * Run the connectivity probe and write the result to IndexedDB.
 * @returns {Promise<void>}
 */
function probeAndStore() {
  return probeInternet().then(function (reachable) {
    if (!reachable) {
      // No internet — nothing to record (this is the expected good state)
      return;
    }
    return openDB().then(function (db) {
      return putRecord(db, {
        timestamp: Date.now(),
        reachable: true,
        source: 'background-sync',
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Service Worker lifecycle events                                   */
/* ------------------------------------------------------------------ */

self.addEventListener('install', function () {
  // Activate immediately — do not wait for old SW to release
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  // Claim all open tabs so the SW controls them immediately
  event.waitUntil(self.clients.claim());
});

/**
 * Background Sync event — fired by the browser when the device regains
 * network connectivity, even if the exam tab is closed.
 */
self.addEventListener('sync', function (event) {
  if (event.tag === 'connectivity-probe') {
    event.waitUntil(
      probeAndStore().then(function () {
        // Re-register so the next connectivity change also triggers
        return self.registration.sync.register('connectivity-probe');
      })
    );
  }
});

/**
 * Periodic Background Sync (Chrome 80+).  This fires at browser-chosen
 * intervals (minimum ~12 hours) so it is NOT reliable for frequent
 * checks, but it provides an extra safety net for long exam sessions.
 */
self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'connectivity-probe-periodic') {
    event.waitUntil(probeAndStore());
  }
});

/**
 * Message handler — the main app can ask the SW to probe on demand
 * (e.g. right after reconnection) by posting { type: 'PROBE_NOW' }.
 */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'PROBE_NOW') {
    event.waitUntil(
      probeAndStore().then(function () {
        // Notify the requesting client
        if (event.source) {
          event.source.postMessage({ type: 'PROBE_COMPLETE' });
        }
      })
    );
  }
});
