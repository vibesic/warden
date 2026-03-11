/**
 * Shared file operation utilities.
 *
 * Extracts duplicated file-download and file-deletion patterns from
 * question.routes.ts and submission.routes.ts.
 */
import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { UPLOADS_DIR } from './upload';

/**
 * Resolve a stored filename to its safe absolute path on disk.
 * Uses `path.basename()` to prevent directory-traversal attacks.
 */
export const getSecureFilePath = (storedName: string): string => {
  const safeName = path.basename(storedName);
  return path.join(UPLOADS_DIR, safeName);
};

/**
 * Serve a file download to the client.
 * Returns `true` if the response was sent, `false` if the file was not
 * found (404 response already sent).
 */
export const serveFileDownload = (
  storedName: string,
  displayName: string,
  res: Response,
): boolean => {
  const filePath = getSecureFilePath(storedName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: 'File not found on disk' });
    return false;
  }

  res.download(filePath, displayName);
  return true;
};

/**
 * Delete a file from the uploads directory if it exists.
 * Returns `true` when a file was actually removed.
 */
export const deleteUploadedFile = (storedName: string): boolean => {
  const filePath = getSecureFilePath(storedName);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
};
