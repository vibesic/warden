/**
 * Submission routes.
 * Handles file uploads (students) and file listing / download (teachers).
 */
import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { getSessionByCode } from '../services/session.service';
import { createSubmission, getSubmissionsForSession } from '../services/submission.service';
import { requireTeacherAuth } from '../middleware/authMiddleware';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'));

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
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const router = Router();

/** Student uploads a file. */
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const { sessionCode, studentId: studentTxId } = req.body as { sessionCode?: string; studentId?: string };

    if (!file) {
      res.status(400).json({ success: false, message: 'No file provided' });
      return;
    }
    if (!sessionCode || !studentTxId) {
      res.status(400).json({ success: false, message: 'sessionCode and studentId are required' });
      return;
    }

    const session = await getSessionByCode(sessionCode);
    if (!session || !session.isActive) {
      res.status(400).json({ success: false, message: 'Invalid or inactive session' });
      return;
    }

    const sessionStudent = await prisma.sessionStudent.findFirst({
      where: {
        session: { id: session.id },
        student: { studentId: studentTxId },
      },
    });
    if (!sessionStudent) {
      res.status(400).json({ success: false, message: 'Student not found in session' });
      return;
    }

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
    logger.error({ error }, 'File upload error');
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

/** Teacher lists submissions for a session. */
router.get('/submissions/:sessionCode', requireTeacherAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await getSessionByCode(req.params.sessionCode);
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

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
  } catch (error) {
    logger.error({ error }, 'Error fetching submissions');
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

/** Teacher downloads a specific file. */
router.get('/submissions/:sessionCode/download/:storedName', requireTeacherAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionCode, storedName } = req.params;
    const safeName = path.basename(storedName);

    const session = await getSessionByCode(sessionCode);
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    const submission = await prisma.submission.findFirst({
      where: { storedName: safeName, sessionId: session.id },
    });

    if (!submission) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found on disk' });
      return;
    }

    res.download(filePath, submission.originalName);
  } catch (error) {
    logger.error({ error }, 'Error downloading file');
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export { router as submissionRoutes };
