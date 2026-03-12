import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQuestionFiles } from '@src/hooks/useQuestionFiles';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('useQuestionFiles', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch question files on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [{ id: 'f1', originalName: 'q1.pdf' }] }),
    });

    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(result.current.questionFiles).toHaveLength(1);
    });

    expect(result.current.questionFiles[0].id).toBe('f1');
  });

  it('should not fetch when sessionCode is empty', () => {
    renderHook(() => useQuestionFiles(''));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should upload a question file', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { id: 'f2', originalName: 'test.pdf' } }) });

    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.handleQuestionUpload(file, 'token-123');
    });

    expect(result.current.questionFiles).toHaveLength(1);
    expect(result.current.questionUploading).toBe(false);
    expect(result.current.questionUploadError).toBe('');
  });

  it('should set upload error when upload fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, message: 'File too large' }) });

    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const file = new File(['content'], 'big.pdf');
    await act(async () => {
      await result.current.handleQuestionUpload(file);
    });

    expect(result.current.questionUploadError).toBe('File too large');
  });

  it('should set upload error on network failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const file = new File(['content'], 'test.pdf');
    await act(async () => {
      await result.current.handleQuestionUpload(file);
    });

    expect(result.current.questionUploadError).toBe('Upload failed. Check your connection.');
  });

  it('should delete a question file', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [{ id: 'f1', originalName: 'q1.pdf' }] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });

    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(result.current.questionFiles).toHaveLength(1);
    });

    await act(async () => {
      await result.current.handleQuestionDelete('f1', 'token-123');
    });

    expect(result.current.questionFiles).toHaveLength(0);
  });

  it('should open download window for question file', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { result } = renderHook(() => useQuestionFiles('ABC123'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.handleQuestionDownload('f1');
    });

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/session/ABC123/questions/f1/download'),
      '_blank',
    );

    openSpy.mockRestore();
  });

  it('should not upload when sessionCode is empty', async () => {
    const { result } = renderHook(() => useQuestionFiles(''));

    const file = new File(['content'], 'test.pdf');
    await act(async () => {
      await result.current.handleQuestionUpload(file);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should not delete when sessionCode is empty', async () => {
    const { result } = renderHook(() => useQuestionFiles(''));

    await act(async () => {
      await result.current.handleQuestionDelete('f1');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
