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
import { createSubmission, getSubmissionsForSession, findSubmissionByStoredName, getSubmissionsForStudent } from '../services/submission.service';
import { findSessionStudentByStudentId } from '../services/student.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { requireSession } from '../middleware/sessionMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { serveFileDownload, deleteUploadedFile, getSecureFilePath, sanitizePathSegment } from '../utils/fileHelpers';
import { buildSubmissionsZip } from '../utils/archiveHelpers';
import { sendErrorJson } from '../utils/httpResponses';
import { logger } from '../utils/logger';
import { roomNames } from '../gateway/roomNames';
import type { Server as SocketIOServer } from 'socket.io';

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

    const io = req.app.get('io') as SocketIOServer | undefined;
    if (io) {
      io.to(roomNames.teacherSession(sessionCode)).emit('dashboard:update', {
        type: 'SUBMISSION_UPDATED',
        studentId: studentTxId,
      });
    }

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

/** Student downloads their own submission. */
router.get('/upload/:sessionCode/:studentId/download', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { sessionCode, studentId: studentTxId } = req.params;

  const session = await getSessionByCode(sessionCode);
  if (!session || !session.isActive) {
    sendErrorJson(res, 404, 'Invalid or inactive session');
    return;
  }

  const sessionStudent = await findSessionStudentByStudentId(session.id, studentTxId);
  if (!sessionStudent) {
    sendErrorJson(res, 404, 'Student not found in session');
    return;
  }

  const submissions = await getSubmissionsForStudent(sessionStudent.id, session.id);
  if (submissions.length === 0) {
    sendErrorJson(res, 404, 'No submission found');
    return;
  }

  const submission = submissions[0]; // there is at most 1
  const filePath = getSecureFilePath(submission.storedName);
  if (!fs.existsSync(filePath)) {
    sendErrorJson(res, 404, 'File missing on disk');
    return;
  }

  res.download(filePath, submission.originalName, (err) => {
    if (err) {
      logger.error(`Error sending file ${submission.storedName}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Error downloading file' });
      }
    }
  });
}, 'Error downloading student submission'));

/** Student gets their own submission metadata. */
router.get('/upload/:sessionCode/:studentId', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { sessionCode, studentId: studentTxId } = req.params;

  const session = await getSessionByCode(sessionCode);
  if (!session || !session.isActive) {
    sendErrorJson(res, 404, 'Invalid or inactive session');
    return;
  }

  const sessionStudent = await findSessionStudentByStudentId(session.id, studentTxId);
  if (!sessionStudent) {
    sendErrorJson(res, 404, 'Student not found in session');
    return;
  }

  const submissions = await getSubmissionsForStudent(sessionStudent.id, session.id);
  if (submissions.length === 0) {
    res.json({ success: true, data: null });
    return;
  }

  const submission = submissions[0];
  res.json({
    success: true,
    data: {
      id: submission.id,
      originalName: submission.originalName,
      sizeBytes: submission.sizeBytes,
      createdAt: submission.createdAt.toISOString(),
      replaced: { count: 0, previousCreatedAt: null } // We don't track replacement history across reloads currently
    },
  });
}, 'Error fetching student submission'));

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

/** Teacher downloads a specific file as a ZIP archive. */
router.get('/submissions/:sessionCode/download/:storedName', requireTeacherAuth, requireSession('sessionCode'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { storedName } = req.params;
  const safeName = path.basename(storedName);
  const session = res.locals.session;

  const submission = await findSubmissionByStoredName(safeName, session.id);

  if (!submission) {
    sendErrorJson(res, 404, 'File not found');
    return;
  }

  const filePath = getSecureFilePath(submission.storedName);
  if (!fs.existsSync(filePath)) {
    sendErrorJson(res, 404, 'File missing on disk');
    return;
  }

  const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const studentId = sanitizePathSegment(submission.sessionStudent.student.studentId);
  const zipFilename = `submission_${sanitize(session.code || session.id)}_${studentId}.zip`;

  await buildSubmissionsZip(res, zipFilename, [submission]);
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
  const zipFilename = `submissions_${sanitize(session.code || session.id)}.zip`;

  await buildSubmissionsZip(res, zipFilename, submissions);
}, 'Error downloading all submissions'));

export { router as submissionRoutes };
