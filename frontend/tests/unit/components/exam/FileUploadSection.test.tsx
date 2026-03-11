import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock the exam session context                                     */
/* ------------------------------------------------------------------ */

let mockSessionCode = 'ABC123';
let mockStudentId = 'S001';

vi.mock('@src/contexts/ExamSessionContext', () => ({
  useExamSession: () => ({
    sessionCode: mockSessionCode,
    studentId: mockStudentId,
    studentName: 'Alice',
    isConnected: true,
    isViolating: false,
    sessionEnded: false,
    showEndModal: false,
    remainingTime: null,
    questionFiles: [],
    reportViolation: vi.fn(),
    onLogout: vi.fn(),
  }),
}));

import { FileUploadSection } from '@src/components/exam/FileUploadSection';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  mockSessionCode = 'ABC123';
  mockStudentId = 'S001';
});

describe('FileUploadSection', () => {
  it('should render the upload label', () => {
    render(<FileUploadSection />);
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('should have a hidden file input', () => {
    render(<FileUploadSection />);
    const input = document.getElementById('file-upload') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('file');
  });

  it('should upload file and display it on success', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: { id: 'f1', originalName: 'answer.pdf', sizeBytes: 1024, createdAt: '2025-01-01T00:00:00Z' },
      }),
    });

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['content'], 'answer.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('answer.pdf')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/upload');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('should send sessionCode and studentId in form data', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: { id: 'f2', originalName: 'test.txt', sizeBytes: 100, createdAt: '2025-01-01T00:00:00Z' },
      }),
    });

    mockSessionCode = 'SESS42';
    mockStudentId = 'STU99';
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    const formData = mockFetch.mock.calls[0][1].body as FormData;
    expect(formData.get('sessionCode')).toBe('SESS42');
    expect(formData.get('studentId')).toBe('STU99');
  });

  it('should show error message on server failure response', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: false,
        message: 'File too large',
      }),
    });

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'big.zip', { type: 'application/zip' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('File too large')).toBeInTheDocument();
    });
  });

  it('should show generic error on network failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Upload failed. Check your connection.')).toBeInTheDocument();
    });
  });

  it('should show "Uploading..." while upload is in progress', async () => {
    const user = userEvent.setup();
    let resolveUpload: (value: unknown) => void;
    const uploadPromise = new Promise((resolve) => { resolveUpload = resolve; });

    mockFetch.mockReturnValueOnce(uploadPromise);

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);

    expect(screen.getByText('Uploading...')).toBeInTheDocument();

    // Resolve and clean up
    resolveUpload!({
      json: () => Promise.resolve({ success: true, data: { id: 'f1', originalName: 'test.txt', sizeBytes: 4, createdAt: '2025-01-01T00:00:00Z' } }),
    });

    await waitFor(() => {
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });
  });

  it('should show file size for uploaded files', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        data: { id: 'f3', originalName: 'report.pdf', sizeBytes: 2048, createdAt: '2025-01-01T00:00:00Z' },
      }),
    });

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });
  });

  it('should accumulate multiple uploaded files', async () => {
    const user = userEvent.setup();

    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { id: 'f1', originalName: 'file1.txt', sizeBytes: 100, createdAt: '2025-01-01T00:00:00Z' },
        }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: true,
          data: { id: 'f2', originalName: 'file2.txt', sizeBytes: 200, createdAt: '2025-01-01T00:01:00Z' },
        }),
      });

    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;

    await user.upload(input, new File(['a'], 'file1.txt', { type: 'text/plain' }));
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    await user.upload(input, new File(['b'], 'file2.txt', { type: 'text/plain' }));
    await waitFor(() => {
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
  });
});
