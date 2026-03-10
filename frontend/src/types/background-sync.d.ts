/**
 * Type augmentations for the Background Sync API.
 *
 * The Background Sync API is a W3C draft specification supported in
 * Chromium-based browsers.  TypeScript's built-in DOM lib does not
 * include these types, so we declare them here.
 */

interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager;
}
