/**
 * Unit tests for the IndexedDB probe store utility.
 *
 * jsdom does not ship a real IndexedDB implementation, so we use
 * the `fake-indexeddb` polyfill — a minimal in-memory shim that
 * exercises the same IDBDatabase / IDBTransaction API surface the
 * production code relies on.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readAllProbes, clearAllProbes, addProbeRecord } from '@src/utils/probeStore';
import type { SwProbeRecord } from '@src/utils/probeStore';

/* ------------------------------------------------------------------ */
/*  In-memory IndexedDB shim for jsdom                                */
/* ------------------------------------------------------------------ */

/**
 * jsdom provides a minimal IDBFactory.  If it works, great.
 * If not, the tests will fail with a clear message rather than
 * silently skipping.  `fake-indexeddb` can be installed as a
 * devDependency if needed; for now jsdom's built-in is sufficient
 * for this simple object-store pattern.
 */

describe('probeStore', () => {
  beforeEach(async () => {
    // Clear any leftover data between tests
    try {
      await clearAllProbes();
    } catch {
      // DB may not exist yet on first run — that's fine
    }
  });

  describe('addProbeRecord', () => {
    it('should write a record to the store', async () => {
      await addProbeRecord({
        timestamp: 1000,
        reachable: true,
        source: 'test',
      });

      const all = await readAllProbes();
      expect(all).toHaveLength(1);
      expect(all[0].timestamp).toBe(1000);
      expect(all[0].reachable).toBe(true);
      expect(all[0].source).toBe('test');
    });

    it('should auto-increment the id', async () => {
      await addProbeRecord({ timestamp: 1, reachable: true, source: 'a' });
      await addProbeRecord({ timestamp: 2, reachable: false, source: 'b' });

      const all = await readAllProbes();
      expect(all).toHaveLength(2);
      // IDs should be unique and incrementing
      const ids = all.map((r: SwProbeRecord) => r.id);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('readAllProbes', () => {
    it('should return empty array when store is empty', async () => {
      const all = await readAllProbes();
      expect(all).toEqual([]);
    });

    it('should return all stored records', async () => {
      await addProbeRecord({ timestamp: 100, reachable: true, source: 'sw' });
      await addProbeRecord({ timestamp: 200, reachable: false, source: 'sw' });
      await addProbeRecord({ timestamp: 300, reachable: true, source: 'manual' });

      const all = await readAllProbes();
      expect(all).toHaveLength(3);
      expect(all.map((r: SwProbeRecord) => r.timestamp)).toEqual([100, 200, 300]);
    });
  });

  describe('clearAllProbes', () => {
    it('should remove all records', async () => {
      await addProbeRecord({ timestamp: 1, reachable: true, source: 'test' });
      await addProbeRecord({ timestamp: 2, reachable: true, source: 'test' });

      let all = await readAllProbes();
      expect(all).toHaveLength(2);

      await clearAllProbes();

      all = await readAllProbes();
      expect(all).toEqual([]);
    });

    it('should be safe to call on empty store', async () => {
      // Should not throw
      await clearAllProbes();
      const all = await readAllProbes();
      expect(all).toEqual([]);
    });
  });
});
