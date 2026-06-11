import { describe, it, expect, vi } from 'vitest';
import archiver from 'archiver';
import { Response } from 'express';
import { buildSubmissionsZip } from '../../../src/utils/archiveHelpers';

vi.mock('archiver');
vi.mock('../../../src/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() }
}));

describe('buildSubmissionsZip', () => {
  it('covers archiver warning and error', async () => {
    const mockOn = vi.fn();
    const mockPipe = vi.fn();
    const mockFinalize = vi.fn().mockResolvedValue(undefined);
    (archiver as any).mockReturnValue({
      on: mockOn,
      pipe: mockPipe,
      file: vi.fn(),
      finalize: mockFinalize
    });

    const mockRes = {
      setHeader: vi.fn(),
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      destroy: vi.fn()
    } as unknown as Response;

    await buildSubmissionsZip(mockRes, 'test.zip', []);

    expect(mockOn).toHaveBeenCalledWith('warning', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));

    const warningCb = mockOn.mock.calls.find(c => c[0] === 'warning')[1];
    warningCb(new Error('warn test'));

    const errorCb = mockOn.mock.calls.find(c => c[0] === 'error')[1];
    errorCb(new Error('err test'));
    
    mockRes.headersSent = true;
    errorCb(new Error('err test 2'));
  });
});
