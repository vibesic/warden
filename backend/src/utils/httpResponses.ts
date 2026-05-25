/**
 * HTTP response helpers — keep response shapes consistent across routes.
 *
 * The app convention is: `{ success, data?, message?, errors? }`.
 */
import type { Response } from 'express';

/**
 * Send a `{ success: false, message }` error response with the given
 * status code. Replaces hand-written `res.status(x).json({ success: false, message })`
 * calls scattered across route files.
 */
export const sendErrorJson = (
  res: Response,
  statusCode: number,
  message: string,
): void => {
  res.status(statusCode).json({ success: false, message });
};

/**
 * Send a `{ success: true, data }` response. `data` is optional for
 * endpoints whose success is signalled by status alone.
 */
export const sendSuccessJson = <T>(
  res: Response,
  data?: T,
  statusCode = 200,
): void => {
  res.status(statusCode).json({ success: true, data });
};
