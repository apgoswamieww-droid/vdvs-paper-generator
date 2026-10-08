-- The bulk-import migration created "content_hash" (snake_case), but every other
-- column of question_imports is camelCase (fileName, totalCount, schoolId,
-- createdAt) and the Prisma model declares `contentHash String?` with no @map.
-- Prisma therefore asked for "contentHash" and the import failed with
--   The column `question_imports.contentHash` does not exist in the current database.
--
-- Rename the column (and its index) to camelCase. `app_configs` keeps its
-- snake_case columns deliberately, via @map in the schema — this table predates
-- that and has always been camelCase.
ALTER TABLE "question_imports" RENAME COLUMN "content_hash" TO "contentHash";

-- Match the name Prisma derives from @@index([schoolId, contentHash]) so a later
-- schema diff does not see a phantom change.
ALTER INDEX "question_imports_schoolId_content_hash_idx"
  RENAME TO "question_imports_schoolId_contentHash_idx";
