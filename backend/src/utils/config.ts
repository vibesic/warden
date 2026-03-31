/**
 * Centralized configuration utilities.
 * Provides production-mode detection, CORS-origin logic,
 * and shared config used by app.ts and server.ts.
 */

export const isProductionMode = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV !== 'production';
};

export const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim());
  }
  if (isProductionMode()) {
    return ['*'];
  }
  return [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
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
