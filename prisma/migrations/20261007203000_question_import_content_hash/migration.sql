-- Bulk question import: record the uploaded file's SHA-256 so re-uploading the
-- same filled template can be detected and refused instead of duplicating
-- every question in the bank.
-- AlterTable
ALTER TABLE "question_imports" ADD COLUMN "content_hash" TEXT;

-- CreateIndex
CREATE INDEX "question_imports_schoolId_content_hash_idx" ON "question_imports"("schoolId", "content_hash");