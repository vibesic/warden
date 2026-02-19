import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ error: err, stack: err.stack }, 'Non-operational error');
    }

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Unexpected errors
  logger.error({ error: err, stack: err.stack }, 'Unhandled error');

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};

export const notFoundHandler = (
  _req: Request,
  res: Response,
): void => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
};
