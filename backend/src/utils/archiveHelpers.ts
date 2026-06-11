import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { getSecureFilePath, sanitizePathSegment } from './fileHelpers';
import { logger } from './logger';
import { sendErrorJson } from './httpResponses';

export const buildSubmissionsZip = async (res: Response, zipFilename: string, submissions: any[]): Promise<void> => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

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

    const studentId = sanitizePathSegment(submission.sessionStudent.student.studentId);
    const fullName = sanitizePathSegment(submission.sessionStudent.student.name || 'Unknown');
    const studentFolder = `${studentId} - ${fullName}`;

    const ext = path.extname(submission.originalName);
    const baseName = path.basename(submission.originalName, ext);
    let filename = `${sanitizePathSegment(baseName)}${ext}`;
    let entryName = `${studentFolder}/${filename}`;

    let counter = 1;
    while (usedNames.has(entryName)) {
      filename = `${sanitizePathSegment(baseName)}_${counter}${ext}`;
      entryName = `${studentFolder}/${filename}`;
      counter += 1;
    }
    usedNames.add(entryName);

    archive.file(filePath, { name: entryName });
  }

  await archive.finalize();
};
