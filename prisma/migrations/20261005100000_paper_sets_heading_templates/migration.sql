-- CreateEnum
CREATE TYPE "HeaderTemplateKind" AS ENUM ('CUSTOM', 'EXAM');

-- AlterTable
ALTER TABLE "paper_sections" ADD COLUMN     "negativeMarks" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "papers" ADD COLUMN     "headerTemplateId" TEXT,
ADD COLUMN     "setCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "header_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "HeaderTemplateKind" NOT NULL DEFAULT 'CUSTOM',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "header_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "header_templates_schoolId_idx" ON "header_templates"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "header_templates_schoolId_name_key" ON "header_templates"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_headerTemplateId_fkey" FOREIGN KEY ("headerTemplateId") REFERENCES "header_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "header_templates" ADD CONSTRAINT "header_templates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

