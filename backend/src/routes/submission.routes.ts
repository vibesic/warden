/**
 * Submission routes.
 * Handles file uploads (students) and file listing / download (teachers).
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import { createUploadMiddleware } from '../utils/upload';
import { getSessionByCode } from '../services/session.service';
import { createSubmission, getSubmissionsForSession, findSubmissionByStoredName } from '../services/submission.service';
import { findSessionStudentByStudentId } from '../services/student.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { requireSession } from '../middleware/sessionMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { serveFileDownload, deleteUploadedFile } from '../utils/fileHelpers';

const upload = createUploadMiddleware();

const router = Router();

const handleUploadError = (res: Response, file: Express.Multer.File | undefined, message: string) => {
  if (file) deleteUploadedFile(file.filename);
  res.status(400).json({ success: false, message });
};

/** Student uploads a file. */
router.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  const { sessionCode, studentId: studentTxId } = req.body as { sessionCode?: string; studentId?: string };

  if (!file) {
    return handleUploadError(res, file, 'No file provided');
  }
  
  if (!sessionCode || !studentTxId) {
    return handleUploadError(res, file, 'sessionCode and studentId are required');
  }

  const session = await getSessionByCode(sessionCode);
  if (!session || !session.isActive) {
    return handleUploadError(res, file, 'Invalid or inactive session');
  }

  const sessionStudent = await findSessionStudentByStudentId(session.id, studentTxId);
  if (!sessionStudent) {
    return handleUploadError(res, file, 'Student not found in session');
  }

  try {
    const submission = await createSubmission({
      sessionStudentId: sessionStudent.id,
      sessionId: session.id,
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype || null,
      sizeBytes: file.size,
    });

    res.json({
      success: true,
      data: {
        id: submission.id,
        originalName: submission.originalName,
        sizeBytes: submission.sizeBytes,
        createdAt: submission.createdAt.toISOString(),
      },
    });
  } catch (error) {
    deleteUploadedFile(file.filename);
    throw error;
  }
}, 'File upload error', { success: false, message: 'Upload failed' }));

/** Teacher lists submissions for a session. */
router.get('/submissions/:sessionCode', requireTeacherAuth, requireSession('sessionCode'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const session = res.locals.session;
  const submissions = await getSubmissionsForSession(session.id);
  res.json({
    success: true,
    data: submissions.map((s) => ({
      id: s.id,
      originalName: s.originalName,
      storedName: s.storedName,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      createdAt: s.createdAt.toISOString(),
      student: s.sessionStudent.student,
    })),
  });
}, 'Error fetching submissions'));

/** Teacher downloads a specific file. */
router.get('/submissions/:sessionCode/download/:storedName', requireTeacherAuth, requireSession('sessionCode'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { storedName } = req.params;
  const safeName = path.basename(storedName);
  const session = res.locals.session;

  const submission = await findSubmissionByStoredName(safeName, session.id);

  if (!submission) {
    res.status(404).json({ success: false, message: 'File not found' });
    return;
  }

  serveFileDownload(safeName, submission.originalName, res);
}, 'Error downloading file'));

export { router as submissionRoutes };
