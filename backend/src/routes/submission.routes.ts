/**
 * Submission routes.
 * Handles file uploads (students) and file listing / download (teachers).
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { createUploadMiddleware } from '../utils/upload';
import { getSessionByCode } from '../services/session.service';
import { createSubmission, getSubmissionsForSession, findSubmissionByStoredName } from '../services/submission.service';
import { findSessionStudentByStudentId } from '../services/student.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { requireSession } from '../middleware/sessionMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { serveFileDownload, deleteUploadedFile, getSecureFilePath } from '../utils/fileHelpers';
import { sendErrorJson } from '../utils/httpResponses';
import { logger } from '../utils/logger';

const upload = createUploadMiddleware();

const router = Router();

const handleUploadError = (res: Response, file: Express.Multer.File | undefined, message: string) => {
  if (file) deleteUploadedFile(file.filename);
  sendErrorJson(res, 400, message);
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
    const { submission, replaced } = await createSubmission({
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
        replaced,
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
    sendErrorJson(res, 404, 'File not found');
    return;
  }

  serveFileDownload(safeName, submission.originalName, res);
}, 'Error downloading file'));

/** Teacher downloads all submissions for a session as a ZIP archive. */
router.get('/submissions/:sessionCode/download-all', requireTeacherAuth, requireSession('sessionCode'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const session = res.locals.session;
  const submissions = await getSubmissionsForSession(session.id);

  if (submissions.length === 0) {
    sendErrorJson(res, 404, 'No submissions to download');
    return;
  }

  const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const zipFilename = `submissions_${sanitize(session.sessionCode || session.id)}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  // Use a low compression level (1) so the teacher gets the archive quickly
  // on a LAN. Most student submissions are already-compressed formats
  // (pdf, docx, images, zips) where deflate level 9 buys little but costs
  // significant CPU time and stalls the response on large sessions.
  const archive = archiver('zip', { zlib: { level: 1 } });

  archive.on('warning', (err) => {
    logger.warn({ err }, 'Archive warning');
  });

  archive.on('error', (err) => {
    logger.error({ err }, 'Archive error');
    if (!res.headersSent) {
      sendErrorJson(res, 500, 'Error creating archive');
    } else {
      res.destroy(err);
    }
  });

  archive.pipe(res);

  const usedNames = new Set<string>();
  for (const submission of submissions) {
    const filePath = getSecureFilePath(submission.storedName);
    if (!fs.existsSync(filePath)) {
      logger.warn({ storedName: submission.storedName }, 'Submission file missing on disk; skipping');
      continue;
    }

    const studentId = sanitize(submission.sessionStudent.student.studentId);
    const ext = path.extname(submission.originalName);
    const baseName = path.basename(submission.originalName, ext);
    let entryName = `${studentId}_${sanitize(baseName)}${ext}`;

    let counter = 1;
    while (usedNames.has(entryName)) {
      entryName = `${studentId}_${sanitize(baseName)}_${counter}${ext}`;
      counter += 1;
    }
    usedNames.add(entryName);

    archive.file(filePath, { name: entryName });
  }

  await archive.finalize();
}, 'Error downloading all submissions'));

export { router as submissionRoutes };
