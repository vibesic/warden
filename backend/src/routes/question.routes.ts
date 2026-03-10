/**
 * Question file routes.
 * Teachers upload question files for a session; students download them.
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { logger } from '../utils/logger';
import { getSessionByCode } from '../services/session.service';
import {
  createQuestionFile,
  getQuestionFilesForSession,
  getQuestionFileById,
  deleteQuestionFile,
} from '../services/question.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';

const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'),
);

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = path.extname(file.originalname);
    cb(null, `q-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const router = Router();

/** Teacher uploads a question file to a session. */
router.post(
  '/session/:code/questions',
  requireTeacherAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file;
      const { code } = req.params;

      if (!file) {
        res.status(400).json({ success: false, message: 'No file provided' });
        return;
      }

      const session = await getSessionByCode(code);
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      if (!session.isActive) {
        res.status(400).json({ success: false, message: 'Session is no longer active' });
        return;
      }

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
      logger.error({ error }, 'Question file upload error');
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  },
);

/** List question files for a session (public — students need this). */
router.get(
  '/session/:code/questions',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await getSessionByCode(req.params.code);
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

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
    } catch (error) {
      logger.error({ error }, 'Error listing question files');
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },
);

/** Download a question file (public — students need this). */
router.get(
  '/session/:code/questions/:id/download',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await getSessionByCode(req.params.code);
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const questionFile = await getQuestionFileById(req.params.id);
      if (!questionFile || questionFile.sessionId !== session.id) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }

      const safeName = path.basename(questionFile.storedName);
      const filePath = path.join(UPLOADS_DIR, safeName);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, message: 'File not found on disk' });
        return;
      }

      res.download(filePath, questionFile.originalName);
    } catch (error) {
      logger.error({ error }, 'Error downloading question file');
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },
);

/** Teacher deletes a question file from a session. */
router.delete(
  '/session/:code/questions/:id',
  requireTeacherAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await getSessionByCode(req.params.code);
      if (!session) {
        res.status(404).json({ success: false, message: 'Session not found' });
        return;
      }

      const questionFile = await getQuestionFileById(req.params.id);
      if (!questionFile || questionFile.sessionId !== session.id) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }

      // Remove from disk
      const safeName = path.basename(questionFile.storedName);
      const filePath = path.join(UPLOADS_DIR, safeName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await deleteQuestionFile(questionFile.id);

      res.json({ success: true, message: 'File deleted' });
    } catch (error) {
      logger.error({ error }, 'Error deleting question file');
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },
);

export { router as questionRoutes };
