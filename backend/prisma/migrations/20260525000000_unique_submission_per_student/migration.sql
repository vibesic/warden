-- Deduplicate existing submissions, keeping only the most recent one per
-- (sessionStudentId, sessionId). This is required before adding the unique
-- index below; older duplicates would otherwise prevent index creation.
DELETE FROM "Submission"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "sessionStudentId", "sessionId"
             ORDER BY "createdAt" DESC
           ) AS rn
    FROM "Submission"
  )
  WHERE rn = 1
);

-- CreateIndex
CREATE UNIQUE INDEX "Submission_sessionStudentId_sessionId_key" ON "Submission"("sessionStudentId", "sessionId");
