"use server";

// ============================================================
//  Bulk Question Import (.docx, table format)
//
//  Two steps, because a teacher should see what was read before it
//  lands in the bank:
//
//    1. parseImportFile   — upload → parse → validate. NO database
//                          writes. Returns a preview plus any problems.
//    2. commitImport      — writes the rows the teacher confirmed.
//                          Validated again server-side, because the
//                          preview is round-tripped through the client.
//
//  ── Changes from the previous plain-text importer ──
//   · Partial import. The old action wrapped every insert in ONE
//     transaction, so a single bad row discarded the whole file while
//     still reporting per-row counts. Valid rows are now saved and
//     failures are reported honestly.
//   · The question's Medium is read from the file. It was silently
//     defaulting to ENGLISH, which mis-tagged every Gujarati import.
//   · Idempotent by content hash — re-uploading the same filled
//     template is refused rather than duplicating the bank.
//   · Errors are no longer swallowed: a database failure logs its cause.
//   · Questions land PENDING and are blocked from papers until a
//     teacher approves them (see lib/docx-table-parser.ts).
// ============================================================

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { questionFormSchema } from "@/lib/validations";
import { toQuestionData } from "@/lib/question-mapper";
import { randomQuestionCode } from "@/lib/question-code";
import { parseQuestionDocx, metaWarning, type ParsedQuestionDraft } from "@/lib/docx-table-parser";

// 2 MB. A question table is a few KB, so this is ~200 questions — well
// past anything a teacher fills in by hand.
const MAX_DOCX_BYTES = 2 * 1024 * 1024;

// ------------------------------------------------------------
//  Shared types
// ------------------------------------------------------------

/** Taxonomy the questions are filed under. */
export type ImportTargets = {
  subjectId: string;
  chapterId: string;
  topicId?: string | null;
};

/** One problem with a row, phrased for the teacher. */
export type ImportRowError = {
  /** 1-based question number within the file. */
  index: number;
  preview: string;
  code: string;
  message: string;
};

/** A question as shown in the preview table, before it is written. */
export type ImportPreviewRow = {
  index: number;
  questionText: string;
  questionType: string;
  medium: string;
  marks: number;
  difficulty: string;
  bloomLevel: string;
  previousYearTag: string | null;
  tags: string[];
  answerKey: string | null;
  explanation: string | null;
  options: { label: string; text: string; isCorrect: boolean }[];
  matchPairs: { left: string; right: string }[];
};

export type ParseImportResult = {
  ok: boolean;
  fileName: string;
  /** SHA-256 of the uploaded file, echoed back by commitImport. */
  contentHash: string;
  /** Targeting recovered from the file's metadata block, if any. */
  detectedTargets: { subjectId: string; chapterId: string; topicId: string | null } | null;
  /** Set when the file's metadata disagrees with the chosen taxonomy. */
  targetingMismatch: string | null;
  rows: ImportPreviewRow[];
  errors: ImportRowError[];
  /** Unfilled boxes the template shipped with. */
  blankBoxes: number;
  error?: string;
};

export type CommitImportResult = {
  ok: boolean;
  imported: number;
  failed: number;
  total: number;
  errors: ImportRowError[];
  importId?: string;
  error?: string;
};

// ------------------------------------------------------------
//  Internals
// ------------------------------------------------------------

type TargetCheck = { ok: true } | { ok: false; error: string };

/**
 * Confirms the chapter (and optional topic) belong to the caller's school.
 * Without this a crafted request could file questions into another tenant's
 * taxonomy, since ids are cuid strings the client controls.
 */
async function assertTargetsBelongToSchool(
  schoolId: string,
  targets: ImportTargets
): Promise<TargetCheck> {
  const subjectId = targets.subjectId?.trim();
  const chapterId = targets.chapterId?.trim();
  if (!subjectId || !chapterId) {
    return { ok: false, error: "Choose a subject and chapter for these questions." };
  }

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, subjectId, subject: { schoolId } },
    select: { id: true },
  });
  if (!chapter) return { ok: false, error: "That chapter is not part of your school." };

  const topicId = targets.topicId?.trim();
  if (topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, chapterId },
      select: { id: true },
    });
    if (!topic) return { ok: false, error: "That topic is not under the chosen chapter." };
  }

  return { ok: true };
}

/** SHA-256 of the uploaded bytes — the idempotency key. */
function hashBytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Validates the upload itself: present, right extension, right size. */
function validateUpload(file: File | null): { ok: true } | { ok: false; error: string } {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a .docx file to upload." };
  }
  if (file.size > MAX_DOCX_BYTES) {
    return { ok: false, error: "File too large (max 2 MB)." };
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { ok: false, error: "Only Microsoft Word .docx files are supported." };
  }
  return { ok: true };
}

function toPreviewRow(draft: ParsedQuestionDraft): ImportPreviewRow {
  return {
    index: draft.index,
    questionText: draft.questionText,
    questionType: draft.questionType,
    medium: draft.medium,
    marks: draft.marks,
    difficulty: draft.difficulty,
    bloomLevel: draft.bloomLevel,
    previousYearTag: draft.previousYearTag,
    tags: draft.tags,
    answerKey: draft.answerKey,
    explanation: draft.explanation,
    options: draft.options,
    matchPairs: draft.matchPairs,
  };
}

/**
 * Builds the candidate the question schema validates.
 *
 * MCQ and MATCH_THE_FOLLOWING carry structured children; the other types
 * only need an answer key. The shape mirrors what the question form posts,
 * so `questionFormSchema` stays the single source of truth for validity.
 */
function toCandidate(row: ImportPreviewRow, targets: ImportTargets) {
  const base = {
    subjectId: targets.subjectId,
    chapterId: targets.chapterId,
    topicId: targets.topicId || undefined,
    questionType: row.questionType,
    difficulty: row.difficulty,
    medium: row.medium,
    bloomLevel: row.bloomLevel,
    marks: row.marks,
    questionText: row.questionText,
    answerKey: row.answerKey ?? "",
    explanation: row.explanation ?? "",
    tags: row.tags,
    previousYearTag: row.previousYearTag ?? "",
  };

  switch (row.questionType) {
    case "MCQ":
      return { ...base, options: row.options, layout: "auto" as const };
    case "MATCH_THE_FOLLOWING":
      return { ...base, matchPairs: row.matchPairs };
    case "CASE_STUDY":
      return { ...base, caseStudyFormat: "INLINE" };
    default:
      return base;
  }
}

// ------------------------------------------------------------
//  Step 1 — parse
// ------------------------------------------------------------

/**
 * Reads an uploaded template and returns a preview. Writes nothing.
 *
 * Safe to call repeatedly — the teacher can re-upload a corrected file
 * without leaving a partial import behind.
 */
export async function parseImportFile(formData: FormData): Promise<ParseImportResult> {
  const session = await requireSession();

  const empty: Omit<ParseImportResult, "ok" | "error"> = {
    fileName: "",
    contentHash: "",
    detectedTargets: null,
    targetingMismatch: null,
    rows: [],
    errors: [],
    blankBoxes: 0,
  };

  const file = formData.get("file");
  const check = validateUpload(file instanceof File ? file : null);
  if (!check.ok) return { ...empty, ok: false, error: check.error };

  const upload = file as File;
  const buffer = Buffer.from(await upload.arrayBuffer());
  const contentHash = hashBytes(buffer);

  const targets: ImportTargets = {
    subjectId: String(formData.get("subjectId") ?? ""),
    chapterId: String(formData.get("chapterId") ?? ""),
    topicId: String(formData.get("topicId") ?? "") || null,
  };

  const targetCheck = await assertTargetsBelongToSchool(session.schoolId, targets);
  if (!targetCheck.ok) {
    return { ...empty, fileName: upload.name, contentHash, ok: false, error: targetCheck.error };
  }

  const parsed = parseQuestionDocx(new Uint8Array(buffer));

  // The file records which chapter it was generated for. If the teacher
  // re-targeted in the UI after downloading, say so rather than silently
  // filing the questions somewhere they did not intend.
  let targetingMismatch: string | null = null;
  if (parsed.meta) {
    const sameChapter = parsed.meta.chapterId === targets.chapterId;
    const sameTopic = (parsed.meta.topicId ?? null) === (targets.topicId ?? null);
    if (!sameChapter || !sameTopic) {
      targetingMismatch =
        "This file was made for a different chapter. The questions will be filed under the chapter you selected here.";
    }
  } else {
    targetingMismatch = metaWarning(parsed.meta);
  }

  const rows = parsed.drafts.map(toPreviewRow);

  // Surface schema problems in the preview rather than only at commit time,
  // so the teacher can fix them in the dialog.
  const errors: ImportRowError[] = parsed.errors.map((e) => ({
    index: e.index,
    preview: e.preview,
    code: e.code,
    message: e.message,
  }));

  for (const row of rows) {
    const result = questionFormSchema.safeParse(toCandidate(row, targets));
    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push({
        index: row.index,
        preview: row.questionText.slice(0, 60),
        code: "invalid",
        message: `${issue?.path?.join(".") || "row"}: ${issue?.message ?? "Invalid question."}`,
      });
    }
  }

  return {
    ok: true,
    fileName: upload.name,
    contentHash,
    detectedTargets: parsed.meta
      ? {
          subjectId: parsed.meta.subjectId,
          chapterId: parsed.meta.chapterId,
          topicId: parsed.meta.topicId,
        }
      : null,
    targetingMismatch,
    rows,
    errors: errors.sort((a, b) => a.index - b.index),
    blankBoxes: parsed.blankBoxes,
  };
}

// ------------------------------------------------------------
//  Step 2 — commit
// ------------------------------------------------------------

/**
 * Writes the rows the teacher confirmed.
 *
 * Valid rows are inserted and failures are reported — the batch is
 * deliberately NOT atomic across rows, because losing 40 good questions
 * because one had a bad Marks cell is worse than a partial import the
 * teacher can see and retry. The audit row is still written in the same
 * transaction as the successful inserts.
 */
export async function commitImport(input: {
  fileName: string;
  contentHash: string;
  targets: ImportTargets;
  rows: ImportPreviewRow[];
}): Promise<CommitImportResult> {
  const session = await requireSession();

  const fail = (error: string): CommitImportResult => ({
    ok: false,
    imported: 0,
    failed: 0,
    total: input.rows.length,
    errors: [],
    error,
  });

  if (!input.fileName.toLowerCase().endsWith(".docx")) {
    return fail("Only .docx files can be imported.");
  }
  if (input.rows.length === 0) return fail("There is nothing to import.");

  const targetCheck = await assertTargetsBelongToSchool(session.schoolId, input.targets);
  if (!targetCheck.ok) return fail(targetCheck.error);

  // Idempotency: the same file twice must not double the bank.
  if (input.contentHash) {
    const previous = await prisma.questionImport.findFirst({
      where: { schoolId: session.schoolId, contentHash: input.contentHash },
      select: { id: true, successCount: true, createdAt: true },
    });
    if (previous) {
      return fail(
        `This exact file was already imported on ${previous.createdAt.toLocaleDateString()} (${previous.successCount} questions). Edit the template and upload a new copy to import more.`
      );
    }
  }

  // Validate every row again — the preview came back through the client.
  const rowErrors: ImportRowError[] = [];
  const valid: ReturnType<typeof toQuestionData>[] = [];

  for (const row of input.rows) {
    const parsed = questionFormSchema.safeParse(toCandidate(row, input.targets));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rowErrors.push({
        index: row.index,
        preview: row.questionText.slice(0, 60),
        code: "invalid",
        message: `${issue?.path?.join(".") || "row"}: ${issue?.message ?? "Invalid question."}`,
      });
      continue;
    }
    valid.push(toQuestionData(parsed.data));
  }

  if (valid.length === 0) {
    return {
      ok: false,
      imported: 0,
      failed: rowErrors.length,
      total: input.rows.length,
      errors: rowErrors,
      error: "None of the rows were valid, so nothing was imported.",
    };
  }

  const status = rowErrors.length > 0 ? "PARTIAL" : "COMPLETED";

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Reserve unique 6-digit codes up front, then insert. Generating
      // them per row with a findUnique inside the loop cost a query per
      // question and could still collide across concurrent imports.
      const codes: string[] = [];
      const taken = new Set<string>();

      // Bounded on purpose: an unbounded loop hangs the request forever if
      // no free code can be found (a nearly full 6-digit space, or every
      // draw colliding). Failing the batch is far better than a stuck
      // function holding a transaction open.
      const maxAttempts = Math.max(50, valid.length * 25);
      let attempts = 0;

      while (codes.length < valid.length && attempts < maxAttempts) {
        attempts += 1;
        const candidate = randomQuestionCode();
        if (taken.has(candidate)) continue;
        taken.add(candidate);
        const clash = await tx.question.findUnique({
          where: { code: candidate },
          select: { id: true },
        });
        if (clash) continue;
        codes.push(candidate);
      }

      if (codes.length < valid.length) {
        throw new Error(
          `Could not allocate unique question codes (${codes.length} of ${valid.length}).`
        );
      }

      let imported = 0;
      for (const [i, data] of valid.entries()) {
        await tx.question.create({
          data: {
            ...data,
            code: codes[i],
            schoolId: session.schoolId,
            subjectId: input.targets.subjectId,
            chapterId: input.targets.chapterId,
            topicId: input.targets.topicId || null,
            // Bulk imports are a teacher's own work, not AI output, but
            // they still enter the bank as PENDING so a second pair of
            // eyes clears them before they reach a paper.
            status: "PENDING",
            createdByAi: false,
            assignedTeacherId: null,
          },
        });
        imported += 1;
      }

      const audit = await tx.questionImport.create({
        data: {
          fileName: input.fileName,
          contentHash: input.contentHash || null,
          status,
          totalCount: input.rows.length,
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
      ok: true,
      imported: result.imported,
      failed: rowErrors.length,
      total: input.rows.length,
      errors: rowErrors,
      importId: result.auditId,
    };
  } catch (err) {
    // The previous version swallowed this and reported a generic message,
    // which made an outage indistinguishable from a bad file.
    console.error("[/questions/import] database error during commit", err);
    return fail("The database rejected the import, so nothing was saved. Please try again.");
  }
}