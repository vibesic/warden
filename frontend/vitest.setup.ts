import '@testing-library/jest-dom/vitest';

/* ---------- DOM stubs --------------------------------------------------- */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
});

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
});

/* ---------- Mock import.meta.env ---------------------------------------- */

// Ensure VITE_ env vars have sensible defaults for testing
if (!import.meta.env.VITE_API_URL) {
  (import.meta as Record<string, unknown>).env = {
    ...import.meta.env,
    VITE_API_URL: 'http://localhost:3333',
    PROD: false,
    DEV: true,
    MODE: 'test',
  };
}

/* ---------- Reset between tests ----------------------------------------- */

import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.style.overflow = '';
});
