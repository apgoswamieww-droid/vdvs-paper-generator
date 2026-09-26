-- Advanced School Settings: board, academic year, paper defaults and permission toggles.
CREATE TYPE "SchoolBoard" AS ENUM ('GSEB', 'CBSE');

ALTER TABLE "schools" ADD COLUMN "board" "SchoolBoard" NOT NULL DEFAULT 'GSEB';

ALTER TABLE "schools" ADD COLUMN "academicYear" TEXT;

ALTER TABLE "schools" ADD COLUMN "watermarkText" TEXT;

ALTER TABLE "schools" ADD COLUMN "defaultInstructions" TEXT;

ALTER TABLE "schools" ADD COLUMN "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "schools" ADD COLUMN "teacherCanEdit" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "schools" ADD COLUMN "mediums" "Medium"[] NOT NULL DEFAULT ARRAY['ENGLISH','GUJARATI']::"Medium"[];