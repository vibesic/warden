import { ZodSchema } from 'zod';
import { logger } from './logger';

/**
 * Common Zod validation wrapper for Express routes and Socket handlers.
 * @param schema Zod Schema to parse data against
 * @param data Raw input to validate
 * @param logMessage Message to prepend for failure logs
 */
export const validateData = <T>(schema: ZodSchema<T>, data: unknown, logMessage = 'Validation failed'): T | null => {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.warn({ issues: result.error.issues }, logMessage);
    return null;
  }
  return result.data;
};