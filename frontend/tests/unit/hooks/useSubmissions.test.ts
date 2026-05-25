import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSubmissions } from '@src/hooks/useSubmissions';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// A fetch resolver that never settles, used to keep the hook's initial
// fetchSubmissions() pending so it cannot cause state updates after a test
// ends (which would trigger React's `act(...)` warning).
const pendingResponse = () => new Promise(() => {});

describe('useSubmissions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.setItem('teacherToken', 'test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should fetch submissions on mount', async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: [{ id: 's1', originalName: 'hw.pdf', storedName: 'stored1', mimeType: 'application/pdf', sizeBytes: 1024, createdAt: '2024-01-01', student: { studentId: 'S001', name: 'Alice' } }],
      }),
    });

    const { result } = renderHook(() => useSubmissions('ABC123'));

    await waitFor(() => {
      expect(result.current.submissions).toHaveLength(1);
    });

    expect(result.current.submissions[0].originalName).toBe('hw.pdf');
  });

  it('should not fetch when sessionCode is undefined', () => {
    renderHook(() => useSubmissions(undefined));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should open download window', async () => {
    mockFetch.mockImplementation(pendingResponse);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { result, unmount } = renderHook(() => useSubmissions('ABC123'));

    act(() => {
      result.current.handleDownload('stored1');
    });

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/submissions/ABC123/download/stored1'),
      '_blank',
    );

    unmount();
  });

  it('should poll at the specified interval', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    const { unmount } = renderHook(() => useSubmissions('ABC123', 5000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('should handle fetch error gracefully', async () => {
    vi.useRealTimers();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSubmissions('ABC123'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.submissions).toEqual([]);
    });
  });

  describe('handleDownloadAll', () => {
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let anchorClickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // jsdom doesn't implement these; stub them.
      (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL =
        vi.fn().mockReturnValue('blob:fake');
      (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
        vi.fn();
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');
      anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('should fetch ZIP, trigger anchor download, and toggle isDownloadingAll', async () => {
      // First call: initial submissions fetch (pending, never resolves)
      mockFetch.mockImplementationOnce(pendingResponse);
      // Second call: the download-all request
      const zipBlob = new Blob(['PK'], { type: 'application/zip' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(zipBlob),
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-disposition'
              ? 'attachment; filename="submissions_ABC123.zip"'
              : null,
        },
      });

      const { result } = renderHook(() => useSubmissions('ABC123'));

      expect(result.current.isDownloadingAll).toBe(false);

      let downloadPromise: Promise<void> = Promise.resolve();
      act(() => {
        downloadPromise = result.current.handleDownloadAll();
      });

      await waitFor(() => {
        expect(result.current.isDownloadingAll).toBe(true);
      });

      await act(async () => {
        await downloadPromise;
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/submissions\/ABC123\/download-all$/),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
      expect(createObjectURLSpy).toHaveBeenCalledWith(zipBlob);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake');
      expect(result.current.isDownloadingAll).toBe(false);
      expect(result.current.downloadAllError).toBeNull();
    });

    it('should set downloadAllError when the server responds with non-OK', async () => {
      mockFetch.mockImplementationOnce(pendingResponse);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ success: false, message: 'No submissions to download' }),
        headers: { get: () => null },
      });

      const { result } = renderHook(() => useSubmissions('ABC123'));

      await act(async () => {
        await result.current.handleDownloadAll();
      });

      expect(result.current.downloadAllError).toBe('No submissions to download');
      expect(result.current.isDownloadingAll).toBe(false);
      expect(anchorClickSpy).not.toHaveBeenCalled();
    });

    it('should set downloadAllError when fetch itself rejects', async () => {
      mockFetch.mockImplementationOnce(pendingResponse);
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const { result } = renderHook(() => useSubmissions('ABC123'));

      await act(async () => {
        await result.current.handleDownloadAll();
      });

      expect(result.current.downloadAllError).toBe('Network down');
      expect(result.current.isDownloadingAll).toBe(false);
    });

    it('should be a no-op when sessionCode is undefined', async () => {
      const { result } = renderHook(() => useSubmissions(undefined));

      await act(async () => {
        await result.current.handleDownloadAll();
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.isDownloadingAll).toBe(false);
    });

    it('should ignore re-entrant calls while a download is already in progress', async () => {
      mockFetch.mockImplementationOnce(pendingResponse);
      let resolveDownload: (value: unknown) => void = () => {};
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDownload = resolve;
          }),
      );

      const { result } = renderHook(() => useSubmissions('ABC123'));

      let firstCall: Promise<void> = Promise.resolve();
      act(() => {
        firstCall = result.current.handleDownloadAll();
      });

      await waitFor(() => {
        expect(result.current.isDownloadingAll).toBe(true);
      });

      // Second invocation while the first is still in flight: should be ignored
      await act(async () => {
        await result.current.handleDownloadAll();
      });

      // Initial fetchSubmissions + first download-all call = 2 total
      expect(mockFetch).toHaveBeenCalledTimes(2);

      resolveDownload({
        ok: true,
        blob: () => Promise.resolve(new Blob(['PK'])),
        headers: { get: () => 'attachment; filename="x.zip"' },
      });

      await act(async () => {
        await firstCall;
      });
    });
  });
});
