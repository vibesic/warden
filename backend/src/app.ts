import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import multer from 'multer';
import { validateSession, getSessionByCode } from './services/session.service';
import { PUBLIC_DOMAINS } from './utils/domainList';
import prisma from './utils/prisma';
import { logger } from './utils/logger';
import { TeacherLoginSchema } from './types/auth';
import { generateTeacherToken, getTeacherPassword, verifyTeacherToken } from './services/auth.service';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createSubmission, getSubmissionsForSession } from './services/submission.service';

const app = express();

// Seed domains on startup (if empty)
const seedDomains = async () => {
  try {
    const count = await prisma.checkTarget.count();
    if (count === 0) {
      logger.info('Seeding check targets...');
      for (const url of PUBLIC_DOMAINS) {
        await prisma.checkTarget.create({ data: { url } }).catch(() => { /* skip duplicates */ });
      }
      logger.info({ count: PUBLIC_DOMAINS.length }, 'Check targets seeded');
    }
  } catch (error) {
    logger.error({ error }, 'Error seeding domains');
  }
};
// Run seed (non-blocking)
seedDomains();

const isDesktopMode = (): boolean => {
  return process.env.ELECTRON === 'true' || process.env.NODE_ENV === 'production';
};

if (isDesktopMode()) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  }));
} else {
  app.use(helmet());
}

const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(o => o.trim());
  }
  if (isDesktopMode()) {
    return ['*'];
  }
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
};

app.use(cors({
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    if (!origin || allowed.includes('*') || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Teacher Authentication Endpoint
app.post('/api/auth/teacher', (req, res) => {
  const result = TeacherLoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, message: 'Password is required' });
    return;
  }

  const { password } = result.data;
  if (password !== getTeacherPassword()) {
    res.status(401).json({ success: false, message: 'Invalid password' });
    return;
  }

  const token = generateTeacherToken();
  res.json({ success: true, token });
});

// Domain Check Endpoint (Teacher-only — prevents students from learning which domains are monitored)
app.get('/api/check-targets', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !verifyTeacherToken(token)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const allTargets = await prisma.checkTarget.findMany({
      where: { isEnabled: true },
      select: { url: true },
    });
    const shuffled = allTargets.sort(() => 0.5 - Math.random());
    const urls = shuffled.slice(0, 3).map((t) => t.url);
    res.json({ domains: urls });
  } catch (error) {
    logger.error({ error }, 'Error fetching check targets');
    // Fallback if DB fails
    const shuffled = [...PUBLIC_DOMAINS].sort(() => 0.5 - Math.random());
    res.json({ domains: shuffled.slice(0, 3) });
  }
});

// Session Validation Endpoint
app.get('/api/session/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await validateSession(code);
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Session validation error');
    res.status(500).json({ valid: false, reason: 'Internal Server Error' });
  }
});

// --- File Upload ---
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));

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

// Ensure uploads directory exists
import fs from 'fs';
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Student uploads a file
app.post('/api/upload', upload.single('file'), async (req, res) => {
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

    // Find the student record
    const student = await prisma.student.findFirst({
      where: { studentId: studentTxId, sessionId: session.id },
    });
    if (!student) {
      res.status(400).json({ success: false, message: 'Student not found in session' });
      return;
    }

    const submission = await createSubmission({
      studentUuid: student.id,
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

// Teacher lists submissions for a session
app.get('/api/submissions/:sessionCode', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !verifyTeacherToken(token)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

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
        student: s.student,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching submissions');
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Teacher downloads a specific file
app.get('/api/submissions/:sessionCode/download/:storedName', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
    if (!token || !verifyTeacherToken(token)) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { storedName } = req.params;
    // Prevent directory traversal
    const safeName = path.basename(storedName);
    const filePath = path.join(UPLOADS_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    // Look up original name from DB
    const submission = await prisma.submission.findFirst({
      where: { storedName: safeName },
    });

    const downloadName = submission?.originalName || safeName;
    res.download(filePath, downloadName);
  } catch (error) {
    logger.error({ error }, 'Error downloading file');
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Serve static frontend in production / desktop mode
if (isDesktopMode()) {
  const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
