/**
 * Question file routes.
 * Teachers upload question files for a session; students download them.
 */
import { Router, Request, Response } from 'express';
import { createUploadMiddleware } from '../utils/upload';
import {
  createQuestionFile,
  getQuestionFilesForSession,
  getQuestionFileById,
  deleteQuestionFile,
} from '../services/question.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';
import { requireActiveSession, requireSession } from '../middleware/sessionMiddleware';
import { asyncHandler } from '../utils/asyncHandler';
import { serveFileDownload, deleteUploadedFile } from '../utils/fileHelpers';

const upload = createUploadMiddleware('q-');

const router = Router();

/** Teacher uploads a question file to a session. */
router.post(
  '/session/:code/questions',
  requireTeacherAuth,
  requireActiveSession(),
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    const session = res.locals.session;

    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }

    try {
      const questionFile = await createQuestionFile({
        sessionId: session.id,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype || null,
        sizeBytes: file.size,
      });

      res.json({
        success: true,
        data: {
          id: questionFile.id,
          originalName: questionFile.originalName,
          sizeBytes: questionFile.sizeBytes,
          createdAt: questionFile.createdAt.toISOString(),
        },
      });
    } catch (error) {
      deleteUploadedFile(file.filename);
      throw error;
    }
  }, 'Question file upload error', { success: false, message: 'Upload failed' }),
);

/** List question files for a session (public — students need this). */
router.get(
  '/session/:code/questions',
  requireSession(),
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const session = res.locals.session;
    const files = await getQuestionFilesForSession(session.id);

    res.json({
      success: true,
      data: files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  }, 'Error listing question files'),
);

/** Download a question file (public — students need this). */
router.get(
  '/session/:code/questions/:id/download',
  requireSession(),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const session = res.locals.session;
    const questionFile = await getQuestionFileById(req.params.id);
    if (!questionFile || questionFile.sessionId !== session.id) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    serveFileDownload(questionFile.storedName, questionFile.originalName, res);
  }, 'Error downloading question file'),
);

/** Teacher deletes a question file from a session. */
router.delete(
  '/session/:code/questions/:id',
  requireTeacherAuth,
  requireSession(),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const session = res.locals.session;
    const questionFile = await getQuestionFileById(req.params.id);
    if (!questionFile || questionFile.sessionId !== session.id) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    deleteUploadedFile(questionFile.storedName);
    await deleteQuestionFile(questionFile.id);

    res.json({ success: true, message: 'File deleted' });
  }, 'Error deleting question file'),
);

export { router as questionRoutes };
