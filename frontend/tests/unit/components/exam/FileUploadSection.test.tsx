import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

class MockXHR {
  status = 200;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload = { onprogress: null as ((event: any) => void) | null };
  _method = '';
  _url = '';
  _data: any = null;

  open(method: string, url: string) {
    this._method = method;
    this._url = url;
  }

  send(data: any) {
    this._data = data;
    MockXHR.lastInstance = this;
  }

  static lastInstance: MockXHR | null = null;
}

beforeEach(() => {
  MockXHR.lastInstance = null;
  vi.stubGlobal('XMLHttpRequest', MockXHR);
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => ({
    json: () => Promise.resolve({ success: true, data: null }),
  }));
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  mockSessionCode = 'ABC123';
  mockStudentId = 'S001';
  
  // Fake timers are essential here because our component has intervals loops
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    const user = userEvent.setup({ delay: null });
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['content'], 'answer.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    vi.advanceTimersByTime(3000); // clear jitter
    expect(MockXHR.lastInstance).not.toBeNull();

    const xhr = MockXHR.lastInstance!;
    xhr.responseText = JSON.stringify({
      success: true,
      data: { id: 'f1', originalName: 'answer.pdf', sizeBytes: 1024, createdAt: '2025-01-01T00:00:00Z' },
    });
    xhr.onload!();
    
    vi.advanceTimersByTime(1000); // let interval process onload delay
    await waitFor(() => {
      expect(screen.getByText('answer.pdf')).toBeInTheDocument();
    });
  });

  it('should send sessionCode and studentId in form data', async () => {
    const user = userEvent.setup({ delay: null });
    mockSessionCode = 'SESS42';
    mockStudentId = 'STU99';
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);
    vi.advanceTimersByTime(3000); // clear jitter

    const formData = MockXHR.lastInstance!._data as FormData;
    expect(formData.get('sessionCode')).toBe('SESS42');
    expect(formData.get('studentId')).toBe('STU99');
  });

  it('should show error message on server failure response', async () => {
    const user = userEvent.setup({ delay: null });
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'big.zip', { type: 'application/zip' });
    await user.upload(input, file);
    vi.advanceTimersByTime(3000); // clear jitter

    const xhr = MockXHR.lastInstance!;
    xhr.responseText = JSON.stringify({
      success: false,
      message: 'File too large',
    });
    xhr.onload!();
    vi.advanceTimersByTime(1000); // let interval process onload delay

    await waitFor(() => {
      expect(screen.getByText('File too large')).toBeInTheDocument();
    });
  });

  it('should show generic error on network failure', async () => {
    const user = userEvent.setup({ delay: null });
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);
    vi.advanceTimersByTime(3000); // clear jitter

    MockXHR.lastInstance!.onerror!();
    vi.advanceTimersByTime(100);

    await waitFor(() => {
      expect(screen.getByText('Upload failed. Check your connection.')).toBeInTheDocument();
    });
  });

  it('should show "Preparing..." immediately then transition', async () => {
    const user = userEvent.setup({ delay: null });
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;
    const file = new File(['x'], 'test.txt', { type: 'text/plain' });
    await user.upload(input, file);
    
    // During jitter
    await waitFor(() => expect(screen.getByText(/Preparing.../i)).toBeInTheDocument());

    vi.advanceTimersByTime(3000); // clear jitter
    const xhr = MockXHR.lastInstance!;
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 });
    
    vi.advanceTimersByTime(200); // wait for interval loop update

    await waitFor(() => {
      expect(screen.getByText(/Uploading.../i)).toBeInTheDocument();
    });

    xhr.responseText = JSON.stringify({
      success: true,
      data: { id: 'f1', originalName: 'test.txt', sizeBytes: 4, createdAt: '2025-01-01T00:00:00Z' },
    });
    xhr.onload!();
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText('Replace File')).toBeInTheDocument();
    });
  });

  it('should replace the previously uploaded file when a new upload succeeds', async () => {
    const user = userEvent.setup({ delay: null });
    render(<FileUploadSection />);

    const input = document.getElementById('file-upload') as HTMLInputElement;

    await user.upload(input, new File(['a'], 'file1.txt', { type: 'text/plain' }));
    vi.advanceTimersByTime(3000);

    const xhr1 = MockXHR.lastInstance!;
    xhr1.responseText = JSON.stringify({
      success: true,
      data: {
        id: 'f1',
        originalName: 'file1.txt',
        sizeBytes: 100,
        createdAt: '2025-01-01T00:00:00Z',
        replaced: { count: 0, previousCreatedAt: null },
      },
    });
    xhr1.onload!();
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    MockXHR.lastInstance = null;

    await user.upload(input, new File(['b'], 'file2.txt', { type: 'text/plain' }));
    vi.advanceTimersByTime(3000);

    const xhr2 = MockXHR.lastInstance!;
    xhr2.responseText = JSON.stringify({
      success: true,
      data: {
        id: 'f2',
        originalName: 'file2.txt',
        sizeBytes: 200,
        createdAt: '2025-01-01T00:01:00Z',
        replaced: { count: 1, previousCreatedAt: '2025-01-01T00:00:00Z' },
      },
    });
    xhr2.onload!();
    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
      expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
      expect(screen.getByText(/replaced previous submission/i)).toBeInTheDocument();
    });
  });
});
