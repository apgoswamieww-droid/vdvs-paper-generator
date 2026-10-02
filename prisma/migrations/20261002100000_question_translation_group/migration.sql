-- Bilingual question pairing: links the English & Gujarati versions of the
-- same conceptual question (translationGroupId = id of the first question).
ALTER TABLE "questions" ADD COLUMN "translationGroupId" TEXT;

CREATE INDEX "questions_translationGroupId_idx" ON "questions"("translationGroupId");
