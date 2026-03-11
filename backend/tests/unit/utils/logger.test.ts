import { describe, it, expect } from 'vitest';
import { logger, requestLogger } from '@src/utils/logger';

describe('Logger', () => {
  it('should export a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('should export a requestLogger middleware', () => {
    expect(requestLogger).toBeDefined();
    expect(typeof requestLogger).toBe('function');
  });

  it('requestLogger should accept req, res, next (Express middleware signature)', () => {
    // pino-http returns a function with arity 3
    expect(requestLogger.length).toBeGreaterThanOrEqual(2);
  });

  it('logger should use silent level in test environment', () => {
    expect(logger.level).toBe('silent');
  });
});
