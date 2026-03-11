/**
 * Express async route handler wrapper.
 *
 * Eliminates the repeated try/catch + logger.error + 500 response
 * pattern that appears in every route handler (~15 occurrences).
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

/**
 * Wrap an async Express route handler to catch unhandled rejections.
 * Logs the error and sends a 500 JSON response automatically.
 *
 * @param fn      Async route handler
 * @param errMsg  Optional log message (defaults to 'Unhandled route error')
 * @param errorResponse Optional custom 500 response body
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  errMsg: string = 'Unhandled route error',
  errorResponse: Record<string, unknown> = { success: false, message: 'Internal Server Error' },
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch((error: unknown) => {
      logger.error({ error }, errMsg);
      if (!res.headersSent) {
        res.status(500).json(errorResponse);
      }
    });
  };
};
