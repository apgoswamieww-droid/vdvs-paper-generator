"use server";

// ============================================================
//  Bulk Import Server Action (.docx)
//
//  Flow: upload → mammoth text extraction → parse → per-row
//  Zod validation → transactional insert → audit record.
// ============================================================

import mammoth from "mammoth";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { questionFormSchema, type QuestionFormValue } from "@/lib/validations";
import { toQuestionData } from "@/lib/question-mapper";
import { parseDocxQuestions } from "@/lib/docx-import";

const MAX_DOCX_BYTES = 2 * 1024 * 1024; // 2 MB

export type ImportRowError = {
  row: number;
  questionPreview: string;
  error: string;
};

export type ImportResult = {
  success: boolean;
  imported: number;
  failed: number;
  total: number;
  errors: ImportRowError[];
  importId?: string;
  error?: string; // set when the whole upload failed
};

export async function importQuestionsFromDocx(
  _prev: ImportResult | null,
  formData: FormData
): Promise<ImportResult> {
  const session = await requireSession();

  const file = formData.get("file");
  const subjectId = String(formData.get("subjectId") ?? "");
  const chapterId = String(formData.get("chapterId") ?? "");
  const topicId = String(formData.get("topicId") ?? "");

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "Choose a .docx file to upload." };
  }
  if (file.size > MAX_DOCX_BYTES) {
    return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "File too large (max 2 MB)." };
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "Only Microsoft Word .docx files are supported." };
  }

  // Taxonomy targeting must belong to the tenant
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, subjectId, subject: { schoolId: session.schoolId } },
  });
  if (!chapter) {
    return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "Select a valid chapter in your school." };
  }
  if (topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: topicId, chapterId } });
    if (!topic) {
      return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "Selected topic is not under this chapter." };
    }
  }

  // 1. Extract raw text from the docx
  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    text = value;
  } catch {
    return { success: false, imported: 0, failed: 0, total: 0, errors: [], error: "Could not read the .docx file. Is it a valid Word document?" };
  }

  // 2. Parse into drafts
  const { drafts, errors: parseErrors } = parseDocxQuestions(text);

  // 3. Validate each draft against the question schema
  const rowErrors: ImportRowError[] = parseErrors.map((e) => ({
    row: e.row,
    questionPreview: e.questionPreview,
    error: e.error,
  }));

  const validDrafts: { row: number; data: ReturnType<typeof toQuestionData> }[] = [];

  for (const draft of drafts) {
    const candidate = {
      subjectId,
      chapterId,
      topicId: topicId || undefined,
      questionType: draft.questionType,
      difficulty: draft.difficulty,
      bloomLevel: draft.bloomLevel,
      caseStudyFormat: draft.caseStudyFormat ?? undefined,
      marks: draft.marks,
      questionText: draft.questionText,
      answerKey: draft.answerKey ?? undefined,
      explanation: draft.explanation ?? undefined,
      tags: draft.tags,
      previousYearTag: draft.previousYearTag ?? undefined,
      ...(draft.questionType === "MCQ" ? { options: draft.options } : {}),
      ...(draft.questionType === "MATCH_THE_FOLLOWING" ? { matchPairs: draft.matchPairs } : {}),
    };

    const parsed = questionFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rowErrors.push({
        row: draft.row,
        questionPreview: draft.questionText.slice(0, 60),
        error: `${issue?.path?.join(".") || "row"}: ${issue?.message ?? "Invalid question"}`,
      });
      continue;
    }

    validDrafts.push({ row: draft.row, data: toQuestionData(parsed.data) });
  }

  // 4. Insert valid rows in a transaction + write the audit record
  const status =
    validDrafts.length === 0 ? "FAILED" : rowErrors.length > 0 ? "PARTIAL" : "COMPLETED";

  try {
    const result = await prisma.$transaction(async (tx) => {
      let imported = 0;
      for (const d of validDrafts) {
        await tx.question.create({
          data: {
            ...d.data,
            schoolId: session.schoolId,
            subjectId,
            chapterId,
          },
        });
        imported += 1;
      }

      const audit = await tx.questionImport.create({
        data: {
          fileName: file.name,
          status,
          totalCount: drafts.length + parseErrors.length,
          successCount: imported,
          failedCount: rowErrors.length,
          errors: rowErrors,
          schoolId: session.schoolId,
          userId: session.id,
        },
      });

      return { imported, auditId: audit.id };
    });

    revalidatePath("/dashboard/questions");
    revalidatePath("/dashboard");

    return {
      success: true,
      imported: result.imported,
      failed: rowErrors.length,
      total: drafts.length + parseErrors.length,
      errors: rowErrors,
      importId: result.auditId,
    };
  } catch {
    return {
      success: false,
      imported: 0,
      failed: rowErrors.length,
      total: drafts.length,
      errors: rowErrors,
      error: "Database error during import. No changes were saved.",
    };
  }
}

