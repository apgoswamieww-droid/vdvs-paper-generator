-- Add a human-friendly 6-digit code to every question.
ALTER TABLE "questions" ADD COLUMN "code" TEXT;

-- Backfill existing rows with unique 6-digit codes.
-- (row-number-driven spread keeps values unique within the table;
--  7919 is coprime with 900000, so the first 900000 rows get distinct codes)
WITH numbered AS (
  SELECT
    id,
    (100000 + ((ROW_NUMBER() OVER (ORDER BY random()) - 1) * 7919) % 900000)::text AS code
  FROM "questions"
)
UPDATE "questions" q
SET "code" = numbered.code
FROM numbered
WHERE q."id" = numbered."id";

ALTER TABLE "questions" ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "questions" ADD CONSTRAINT "questions_code_key" UNIQUE ("code");