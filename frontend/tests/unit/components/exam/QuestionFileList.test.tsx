import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuestionFileItem } from '@src/types/exam';

/* ------------------------------------------------------------------ */
/*  Mock the exam session context                                     */
/* ------------------------------------------------------------------ */

let mockSessionCode = 'ABC123';
let mockQuestionFiles: QuestionFileItem[] = [];

vi.mock('@src/contexts/ExamSessionContext', () => ({
  useExamSession: () => ({
    sessionCode: mockSessionCode,
    questionFiles: mockQuestionFiles,
    studentId: 'S001',
    studentName: 'Alice',
    isConnected: true,
    isViolating: false,
    sessionEnded: false,
    showEndModal: false,
    remainingTime: null,
    reportViolation: vi.fn(),
    onLogout: vi.fn(),
  }),
}));

import { QuestionFileList } from '@src/components/exam/QuestionFileList';

const mockOpen = vi.fn();

beforeEach(() => {
  vi.stubGlobal('open', mockOpen);
  vi.clearAllMocks();
  mockSessionCode = 'ABC123';
  mockQuestionFiles = [];
});

const sampleFiles: QuestionFileItem[] = [
  { id: 'q1', originalName: 'exam-paper.pdf', sizeBytes: 204800, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'q2', originalName: 'appendix.docx', sizeBytes: 51200, createdAt: '2025-01-01T00:01:00Z' },
];

describe('QuestionFileList', () => {
  it('should render nothing when questionFiles is empty', () => {
    const { container } = render(<QuestionFileList />);
    expect(container.firstChild).toBeNull();
  });

  it('should render the heading when files exist', () => {
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);
    expect(screen.getByText('Question Files')).toBeInTheDocument();
  });

  it('should render a button for each question file', () => {
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);
    expect(screen.getByText('exam-paper.pdf')).toBeInTheDocument();
    expect(screen.getByText('appendix.docx')).toBeInTheDocument();
  });

  it('should show formatted file size', () => {
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);
    // 204800 bytes = 200 KB, 51200 = 50 KB
    expect(screen.getByText('200.0 KB')).toBeInTheDocument();
    expect(screen.getByText('50.0 KB')).toBeInTheDocument();
  });

  it('should open download URL in new tab when a file is clicked', async () => {
    const user = userEvent.setup();
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);

    await user.click(screen.getByText('exam-paper.pdf'));

    expect(mockOpen).toHaveBeenCalledOnce();
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('/api/session/ABC123/questions/q1/download'),
      '_blank',
    );
  });

  it('should use the correct sessionCode in the download URL', async () => {
    const user = userEvent.setup();
    mockSessionCode = 'XYZ999';
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);

    await user.click(screen.getByText('appendix.docx'));

    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('/api/session/XYZ999/questions/q2/download'),
      '_blank',
    );
  });

  it('should render correct number of buttons', () => {
    mockQuestionFiles = sampleFiles;
    render(<QuestionFileList />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });
});
