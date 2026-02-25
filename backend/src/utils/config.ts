/**
 * Centralized configuration utilities.
 * Eliminates duplication of isDesktopMode / CORS-origin logic
 * that was previously scattered across app.ts and server.ts.
 */

export const isDesktopMode = (): boolean => {
  return process.env.ELECTRON === 'true' || process.env.NODE_ENV === 'production';
};

export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== 'production';
};

export const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim());
  }
  if (isDesktopMode() || isDevelopment()) {
    return ['*'];
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
};

/**
 * CORS origin callback shared by Express and Socket.io.
 */
export const corsOriginCallback = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void => {
  const allowed = getAllowedOrigins();
  if (!origin || allowed.includes('*') || allowed.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  }
};
