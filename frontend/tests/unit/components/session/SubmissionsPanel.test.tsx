import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmissionsPanel } from '@src/components/session/SubmissionsPanel';
import type { SubmissionItem } from '@src/hooks/useSubmissions';

const baseSubmission: SubmissionItem = {
  id: 'sub1',
  originalName: 'homework.pdf',
  storedName: 'stored-1.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-02-19T01:00:00Z',
  student: { studentId: 'S001', name: 'Alice' },
};

describe('SubmissionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render nothing when there are no submissions', () => {
    const { container } = render(
      <SubmissionsPanel
        submissions={[]}
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render header with submission count and student rows', () => {
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    expect(screen.getByText(/Student Submissions \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('S001')).toBeInTheDocument();
    expect(screen.getByText('homework.pdf')).toBeInTheDocument();
  });

  it('should render a Download all button when submissions exist', () => {
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: /^download all$/i }),
    ).toBeInTheDocument();
  });

  it('should invoke onDownloadAll when the Download all button is clicked', async () => {
    const onDownloadAll = vi.fn();
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={vi.fn()}
        onDownloadAll={onDownloadAll}
      />,
    );

    const button = screen.getByRole('button', { name: /^download all$/i });
    await userEvent.click(button);

    expect(onDownloadAll).toHaveBeenCalledTimes(1);
  });

  it('should invoke onDownload with the storedName when the per-row download button is clicked', async () => {
    const onDownload = vi.fn();
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={onDownload}
        onDownloadAll={vi.fn()}
      />,
    );

    const rowDownload = screen.getByRole('button', { name: /^download$/i });
    await userEvent.click(rowDownload);

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith('stored-1.pdf');
  });

  it('should disable the Download all button and show preparing label when isDownloadingAll is true', () => {
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
        isDownloadingAll
      />,
    );

    const button = screen.getByRole('button', { name: /preparing zip/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('should render downloadAllError when provided', () => {
    render(
      <SubmissionsPanel
        submissions={[baseSubmission]}
        onDownload={vi.fn()}
        onDownloadAll={vi.fn()}
        downloadAllError="No submissions to download"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/no submissions to download/i);
  });
});
