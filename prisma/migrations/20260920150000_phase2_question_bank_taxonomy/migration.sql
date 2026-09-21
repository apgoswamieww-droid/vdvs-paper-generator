-- Phase 2: Curriculum taxonomy (Class → Subject → Chapter → Topic),
-- question pedagogy metadata, and import audit table.

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "BloomLevel" AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE');
CREATE TYPE "CaseStudyFormat" AS ENUM ('INLINE', 'SHARED_PASSAGE');
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'FAILED');

-- ---------------------------------------------------------------------------
-- class_levels (Classes Std 6–12, per school)
-- ---------------------------------------------------------------------------
CREATE TABLE "class_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "class_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_levels_schoolId_name_key" ON "class_levels"("schoolId", "name");
CREATE INDEX "class_levels_schoolId_idx" ON "class_levels"("schoolId");

ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- subjects: add nullable classLevelId first, backfill, then enforce
-- ---------------------------------------------------------------------------
ALTER TABLE "subjects" ADD COLUMN "classLevelId" TEXT;

INSERT INTO "class_levels" ("id", "name", "order", "updatedAt", "schoolId")
SELECT
    md5(random()::text || clock_timestamp()::text),
    COALESCE(s."gradeLevel", 'General'),
    COALESCE(NULLIF(regexp_replace(COALESCE(s."gradeLevel", ''), '\D', '', 'g'), '')::int, 0),
    now(),
    s."schoolId"
FROM (
    SELECT DISTINCT "schoolId", "gradeLevel" FROM "subjects"
) AS s
WHERE s."gradeLevel" IS NOT NULL;

UPDATE "subjects"
SET "classLevelId" = cl."id"
FROM "class_levels" cl
WHERE cl."schoolId" = "subjects"."schoolId"
  AND cl."name" = COALESCE("subjects"."gradeLevel", 'General');

ALTER TABLE "subjects" DROP CONSTRAINT IF EXISTS "subjects_schoolId_name_gradeLevel_key";
ALTER TABLE "subjects" ALTER COLUMN "classLevelId" SET NOT NULL;
ALTER TABLE "subjects" DROP COLUMN "gradeLevel";

CREATE UNIQUE INDEX "subjects_classLevelId_name_key" ON "subjects"("classLevelId", "name");
CREATE INDEX "subjects_classLevelId_idx" ON "subjects"("classLevelId");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chapterId" TEXT NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topics_chapterId_name_key" ON "topics"("chapterId", "name");
CREATE INDEX "topics_chapterId_idx" ON "topics"("chapterId");

ALTER TABLE "topics" ADD CONSTRAINT "topics_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- questions: taxonomy + pedagogy metadata
-- ---------------------------------------------------------------------------
ALTER TABLE "questions" ADD COLUMN "topicId" TEXT;
ALTER TABLE "questions" ADD COLUMN "bloomLevel" "BloomLevel";
ALTER TABLE "questions" ADD COLUMN "caseStudyFormat" "CaseStudyFormat";
ALTER TABLE "questions" ADD COLUMN "previousYearTag" TEXT;

CREATE INDEX "questions_topicId_idx" ON "questions"("topicId");
CREATE INDEX "questions_previousYearTag_idx" ON "questions"("previousYearTag");

ALTER TABLE "questions" ADD CONSTRAINT "questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- question_imports (bulk import audit)
-- ---------------------------------------------------------------------------
CREATE TABLE "question_imports" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "question_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "question_imports_schoolId_createdAt_idx" ON "question_imports"("schoolId", "createdAt");

ALTER TABLE "question_imports" ADD CONSTRAINT "question_imports_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_imports" ADD CONSTRAINT "question_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
