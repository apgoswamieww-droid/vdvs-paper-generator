-- AI generation & teacher-approval workflow.
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "questions" ADD COLUMN "status" "QuestionStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "questions" ADD COLUMN "createdByAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "questions" ADD COLUMN "examYear" TEXT;
ALTER TABLE "questions" ADD COLUMN "assignedTeacherId" TEXT;
ALTER TABLE "questions" ADD COLUMN "reviewedById" TEXT;

ALTER TABLE "questions" ADD CONSTRAINT "questions_assignedTeacherId_fkey"
  FOREIGN KEY ("assignedTeacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "questions_assignedTeacherId_idx" ON "questions"("assignedTeacherId");
CREATE INDEX "questions_status_createdByAi_idx" ON "questions"("status", "createdByAi");