/**
 * Resolves the API base URL.
 * - In development: uses VITE_API_URL env var or falls back to localhost:3333
 * - In production (Docker): uses the same origin (relative URL)
 */
export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (import.meta.env.PROD) {
    // The browser dynamically determines the LAN IP, and the backend is exposed on port 4444 via Windows proxy!
    return `${window.location.protocol}//${window.location.hostname}:4444`;
  }

  return 'http://localhost:4444';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Resolves the Socket.IO connection URL.
 * Same logic as API base URL — in production the socket connects to the same origin.
 */
export const getSocketUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (import.meta.env.PROD) {
    return `${window.location.protocol}//${window.location.hostname}:4444`;
  }

  return 'http://localhost:4444';
};

export const SOCKET_URL = getSocketUrl();
