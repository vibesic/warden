/**
 * Shared file upload configuration.
 * Eliminates duplicated multer setup between submission and question routes.
 */
import path from 'path';
import fs from 'fs';
import multer from 'multer';

/** Resolved uploads directory, shared across all upload routes. */
export const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'),
);

// Ensure the uploads directory exists at startup.
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Maximum file size in bytes (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Create a multer upload middleware with a shared storage configuration.
 * @param filenamePrefix Optional prefix prepended to stored filenames (e.g. "q-" for question files).
 */
export const createUploadMiddleware = (filenamePrefix: string = ''): multer.Multer => {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = path.extname(file.originalname);
      cb(null, `${filenamePrefix}${uniqueSuffix}${ext}`);
    },
  });

  return multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });
};
