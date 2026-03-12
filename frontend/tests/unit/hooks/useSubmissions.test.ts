import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSubmissions } from '@src/hooks/useSubmissions';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('useSubmissions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.setItem('teacherToken', 'test-token');
  });

  afterEach(() => {
    vi.useRealTimers();
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

    await vi.waitFor(() => {
      expect(result.current.submissions).toHaveLength(1);
    });

    expect(result.current.submissions[0].originalName).toBe('hw.pdf');
  });

  it('should not fetch when sessionCode is undefined', () => {
    renderHook(() => useSubmissions(undefined));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should open download window', async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { result } = renderHook(() => useSubmissions('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.handleDownload('stored1');
    });

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/submissions/ABC123/download/stored1'),
      '_blank',
    );

    openSpy.mockRestore();
  });

  it('should poll at the specified interval', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    renderHook(() => useSubmissions('ABC123', 5000));

    // Initial fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance timer
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should handle fetch error gracefully', async () => {
    vi.useRealTimers();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSubmissions('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Should not crash, submissions stays empty
    expect(result.current.submissions).toEqual([]);
  });
});
