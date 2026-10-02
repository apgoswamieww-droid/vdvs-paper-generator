-- Teacher ↔ Subject assignments (a teacher may teach several subjects)
CREATE TABLE "teacher_subjects" (
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- Foreign keys
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "teacher_subjects_subjectId_idx" ON "teacher_subjects"("subjectId");