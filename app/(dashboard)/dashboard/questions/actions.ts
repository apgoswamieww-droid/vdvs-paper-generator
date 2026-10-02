"use server";

// ============================================================
//  Question Server Actions — CRUD + paginated listing
//  All queries are tenant-scoped via requireSession().
// ============================================================

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type {
  QuestionType,
  DifficultyLevel,
  BloomLevel,
  CaseStudyFormat,
  QuestionStatus,
  Medium,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { randomQuestionCode } from "@/lib/question-code";
import { toQuestionData } from "@/lib/question-mapper";
import { questionScopeFor, teacherSubjectIds } from "@/lib/question-scope";
import {
  questionFormSchema,
  questionFilterSchema,
  type ActionState,
  type QuestionFormValue,
} from "@/lib/validations";
import type { PaginatedResponse } from "@/types";
import { resolveAdminScope } from "@/app/(dashboard)/dashboard/admin/scope";
import {
  translateQuestion,
  type TranslatedQuestion,
} from "@/lib/ai/translate-question";
import { OmniRouteError } from "@/lib/ai/omniroutes";

const QUESTION_PATHS = ["/dashboard/questions", "/dashboard"];

function revalidateQuestions() {
  for (const p of QUESTION_PATHS) revalidatePath(p);
}

// Stricter manual-form rules that the shared schema intentionally leaves
// optional (so bulk import / legacy rows still work). Topic and the answer
// for nothing-but-an-answer types must be present before we persist.
function missingRequired(data: QuestionFormValue): string | null {
  if (!data.topicId?.trim()) return "Topic is required";
  if (
    ["SHORT_ANSWER", "LONG_ANSWER", "FILL_IN_THE_BLANK", "TRUE_FALSE", "NUMERIC"].includes(
      data.questionType
    ) &&
    !(data.answerKey ?? "").trim()
  ) {
    return "Answer is required";
  }
  return null;
}

// ------------------------------------------------------------
//  Create / Update / Delete
// ------------------------------------------------------------

/**
 * Finds the counterpart subject/chapter/topic in `targetMedium`.
 *
 * Subjects are medium-specific, so a linked English question's row IDs can
 * never appear in the Gujarati cascade (and vice versa). Real bilingual
 * taxonomies translate the NAMES (EN "Computer Science" ↔ GUJ
 * "કમ્પ્યુટર અધ્યયન"), so matching runs per level:
 *
 *   1. exact name — works when both mediums share names
 *   2. subject: same non-null `code` (the explicit bilingual pair key,
 *      set in the Taxonomy manager or by the NCERT seed)
 *   3. chapter/topic: same POSITION in the parallel lists — both mediums
 *      follow the same syllabus order even when every name is translated.
 *      Only used when both sides have the SAME number of rows, so a list
 *      that grew on one side can never silently mispair.
 *
 * Any level without a counterpart comes back null and the caller decides
 * (manual pick → operator input; auto-translate → actionable error).
 */
async function resolvePairTaxonomy(
  schoolId: string,
  target: {
    classLevelId: string;
    /** Source subject — needed to compute the chapter position fallback. */
    sourceSubjectId: string;
    subjectName: string;
    subjectCode: string | null;
    chapterName: string | null;
    /** Source chapter — needed to compute the topic position fallback. */
    sourceChapterId: string | null;
    topicName: string | null;
    sourceTopicId: string | null;
    targetMedium: Medium;
  }
): Promise<{ subjectId: string | null; chapterId: string | null; topicId: string | null }> {
  // ── Subject: name → code ──
  let subject = await prisma.subject.findFirst({
    where: {
      schoolId,
      classLevelId: target.classLevelId,
      name: target.subjectName,
      medium: target.targetMedium,
    },
    select: { id: true },
  });
  if (!subject && target.subjectCode) {
    const byCode = await prisma.subject.findMany({
      where: {
        schoolId,
        classLevelId: target.classLevelId,
        code: target.subjectCode,
        medium: target.targetMedium,
      },
      select: { id: true },
      take: 2,
    });
    // Ambiguous codes (several subjects sharing one code) never pair.
    if (byCode.length === 1) subject = byCode[0];
  }
  if (!subject) return { subjectId: null, chapterId: null, topicId: null };
  if (!target.chapterName) return { subjectId: subject.id, chapterId: null, topicId: null };

  // ── Chapter: name → position (equal counts only) ──
  const targetChapters = await prisma.chapter.findMany({
    where: { subjectId: subject.id },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
  let chapter = targetChapters.find((c) => c.name === target.chapterName) ?? null;
  if (!chapter && target.sourceChapterId) {
    const sourceChapters = await prisma.chapter.findMany({
      where: { subjectId: target.sourceSubjectId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const idx = sourceChapters.findIndex((c) => c.id === target.sourceChapterId);
    if (idx >= 0 && sourceChapters.length === targetChapters.length) {
      chapter = targetChapters[idx] ?? null;
    }
  }
  if (!chapter) return { subjectId: subject.id, chapterId: null, topicId: null };
  if (!target.topicName) {
    return { subjectId: subject.id, chapterId: chapter.id, topicId: null };
  }

  // ── Topic: name → position (equal counts only) ──
  const targetTopics = await prisma.topic.findMany({
    where: { chapterId: chapter.id },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });
  let topic = targetTopics.find((t) => t.name === target.topicName) ?? null;
  if (!topic && target.sourceTopicId && target.sourceChapterId) {
    const sourceTopics = await prisma.topic.findMany({
      where: { chapterId: target.sourceChapterId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const idx = sourceTopics.findIndex((t) => t.id === target.sourceTopicId);
    if (idx >= 0 && sourceTopics.length === targetTopics.length) {
      topic = targetTopics[idx] ?? null;
    }
  }
  return { subjectId: subject.id, chapterId: chapter.id, topicId: topic?.id ?? null };
}

export async function createQuestion(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Invalid form payload." };
  }

  const parsed = questionFormSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }
  const missing = missingRequired(parsed.data);
  if (missing) return { success: false, error: missing };

  const data = parsed.data;

  // ── Bilingual pairing ──
  // Linking adopts the parent's translation group (starting one if the parent
  // has none) and inherits taxonomy/pedagogy metadata so both halves of the
  // pair match — the paper engine relies on that to swap mediums 1:1.
  let translationGroupId: string | undefined;
  if (data.linkQuestionId) {
    const parent = await prisma.question.findFirst({
      where: { id: data.linkQuestionId, schoolId: session.schoolId },
      select: {
        id: true,
        code: true,
        medium: true,
        difficulty: true,
        bloomLevel: true,
        questionType: true,
        marks: true,
        translationGroupId: true,
        subject: { select: { id: true, name: true, code: true, classLevelId: true } },
        chapter: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
      },
    });
    if (!parent) {
      return { success: false, error: "Question to link was not found in your school." };
    }
    if (parent.medium === data.medium) {
      return {
        success: false,
        error: `#${parent.code} is already in ${data.medium === "ENGLISH" ? "English" : "Gujarati"} — switch this question's medium to the other language to pair them.`,
      };
    }
    translationGroupId = parent.translationGroupId ?? parent.id;
    // Backfill the parent when it starts a fresh group — both rows must carry
    // the id or counterpart lookups (badges, paper swap) find nothing.
    if (!parent.translationGroupId) {
      await prisma.question.updateMany({
        where: { id: parent.id, translationGroupId: null },
        data: { translationGroupId },
      });
    }
    // Taxonomy is inherited from the parent in this question's medium: name →
    // subject code → list position (see resolvePairTaxonomy). Levels with no
    // counterpart keep whatever the operator submitted (empty → picked manually).
    const pair = await resolvePairTaxonomy(session.schoolId, {
      classLevelId: parent.subject.classLevelId,
      sourceSubjectId: parent.subject.id,
      subjectName: parent.subject.name,
      subjectCode: parent.subject.code,
      chapterName: parent.chapter?.name ?? null,
      sourceChapterId: parent.chapter?.id ?? null,
      topicName: parent.topic?.name ?? null,
      sourceTopicId: parent.topic?.id ?? null,
      targetMedium: data.medium,
    });
    if (pair.subjectId) {
      data.subjectId = pair.subjectId;
      if (pair.chapterId) data.chapterId = pair.chapterId;
      if (pair.topicId) data.topicId = pair.topicId;
    }
    data.difficulty = parent.difficulty;
    data.bloomLevel = parent.bloomLevel ?? data.bloomLevel;
    data.questionType = parent.questionType;
    data.marks = parent.marks;
  } else if (data.translationGroupId) {
    translationGroupId = data.translationGroupId;
  }

  // Only one question per medium may share a translation group.
  if (translationGroupId) {
    const clash = await prisma.question.findFirst({
      where: {
        translationGroupId,
        medium: data.medium,
        schoolId: session.schoolId,
      },
      select: { code: true },
    });
    if (clash) {
      return {
        success: false,
        error: `A ${data.medium === "ENGLISH" ? "English" : "Gujarati"} question (#${clash.code}) is already linked in this translation group.`,
      };
    }
  }

  // Teachers may only author questions in subjects assigned to them.
  if (session.role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(session.id);
    if (!mySubjects.includes(data.subjectId)) {
      return { success: false, error: "You can only create questions in your assigned subjects." };
    }
  }

  // Tenant ownership check on chapter (implies subject belongs to tenant too)
  const chapter = await prisma.chapter.findFirst({
    where: { id: data.chapterId, subject: { schoolId: session.schoolId } },
    include: { subject: { select: { id: true, medium: true } } },
  });
  if (!chapter) return { success: false, error: "Chapter not found in your school." };
  if (chapter.subject.id !== data.subjectId) {
    return { success: false, error: "Chapter does not belong to the selected subject." };
  }
  // A linked question must sit under a subject of its own medium (the form's
  // cascade guarantees this; the name-based counterpart resolution above can
  // legitimately fall back to the operator's input, which we check here).
  if (data.linkQuestionId && chapter.subject.medium !== data.medium) {
    return {
      success: false,
      error: `The selected subject is ${chapter.subject.medium === "ENGLISH" ? "English" : "Gujarati"} but this question's medium is ${data.medium === "ENGLISH" ? "English" : "Gujarati"} — pick a subject in the question's medium.`,
    };
  }
  if (data.topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: data.topicId, chapterId: data.chapterId },
    });
    if (!topic) return { success: false, error: "Topic not found under this chapter." };
  }

  try {
    // The code is unique in the DB — retry a few times on collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await prisma.question.create({
          data: {
            ...toQuestionData(data),
            ...(translationGroupId ? { translationGroupId } : {}),
            code: randomQuestionCode(),
            schoolId: session.schoolId,
            subjectId: data.subjectId,
            chapterId: data.chapterId,
          },
        });
        revalidateQuestions();
        return { success: true, id: created.id, message: "Question created." };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue; // unique-code collision → try another code
        }
        throw err;
      }
    }
    return { success: false, error: "Could not generate a unique question code." };
  } catch {
    return { success: false, error: "Could not create question." };
  }
}

// Answer fields whose TEXT (not a label/enum) should be translated as well.
// MCQ answer keys are option labels, TRUE/FALSE is an enum and NUMERIC is a
// value — those stay byte-identical in both halves of the pair.
const TRANSLATABLE_ANSWER_TYPES: QuestionType[] = [
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "FILL_IN_THE_BLANK",
  "MATCH_THE_FOLLOWING",
  "CASE_STUDY",
];

const MEDIUM_TEXT: Record<Medium, "English" | "Gujarati"> = {
  ENGLISH: "English",
  GUJARATI: "Gujarati",
};

/**
 * Auto-Translate & Save Both Languages — translates the form's question into
 * the opposite medium through the local OmniRoute gateway and creates BOTH
 * records in one transaction under a single new translationGroupId, sharing
 * chapter/topic/difficulty/Bloom/type/marks (the counterpart taxonomy is
 * matched name → subject code → list position — see resolvePairTaxonomy).
 */
export async function autoTranslateCreatePair(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Invalid form payload." };
  }
  const parsed = questionFormSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }
  const missing = missingRequired(parsed.data);
  if (missing) return { success: false, error: missing };
  const data = parsed.data;

  // ── Source taxonomy → names ──
  const srcSubject = await prisma.subject.findFirst({
    where: { id: data.subjectId, schoolId: session.schoolId },
    select: { id: true, name: true, code: true, classLevelId: true, medium: true },
  });
  if (!srcSubject) return { success: false, error: "Subject not found in your school." };
  if (srcSubject.medium !== data.medium) {
    return {
      success: false,
      error: `The selected subject is ${MEDIUM_TEXT[srcSubject.medium]} but this question's medium is ${MEDIUM_TEXT[data.medium]} — pick a subject in the question's medium.`,
    };
  }
  const srcChapter = await prisma.chapter.findFirst({
    where: { id: data.chapterId, subjectId: data.subjectId },
    select: { id: true, name: true },
  });
  if (!srcChapter) {
    return { success: false, error: "Chapter not found under the selected subject." };
  }
  const srcTopic = data.topicId
    ? await prisma.topic.findFirst({
        where: { id: data.topicId, chapterId: data.chapterId },
        select: { id: true, name: true },
      })
    : null;
  if (!srcTopic) return { success: false, error: "Topic not found under this chapter." };

  // ── Counterpart taxonomy in the opposite medium (name → code → position) ──
  const targetMedium: Medium = data.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH";
  const targetLabel = MEDIUM_TEXT[targetMedium];
  const pair = await resolvePairTaxonomy(session.schoolId, {
    classLevelId: srcSubject.classLevelId,
    sourceSubjectId: srcSubject.id,
    subjectName: srcSubject.name,
    subjectCode: srcSubject.code,
    chapterName: srcChapter.name,
    sourceChapterId: srcChapter.id,
    topicName: srcTopic.name,
    sourceTopicId: srcTopic.id,
    targetMedium,
  });
  if (!pair.subjectId || !pair.chapterId || !pair.topicId) {
    const missingLevel = !pair.subjectId
      ? `subject "${srcSubject.name}"`
      : !pair.chapterId
        ? `chapter "${srcChapter.name}"`
        : `topic "${srcTopic.name}"`;
    return {
      success: false,
      error: `No ${targetLabel} counterpart found for ${missingLevel} in this class — pair the two languages in Taxonomy (matching subject code, or the same chapters/topics in the same order), then retry.`,
    };
  }
  const targetSubjectId: string = pair.subjectId;
  const targetChapterId: string = pair.chapterId;
  const targetTopicId: string = pair.topicId;

  // Teachers may only author questions in subjects assigned to them —
  // both halves of the pair are authored here, so check both subjects.
  if (session.role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(session.id);
    if (!mySubjects.includes(data.subjectId)) {
      return { success: false, error: "You can only create questions in your assigned subjects." };
    }
    if (!mySubjects.includes(targetSubjectId)) {
      return {
        success: false,
        error: `The ${targetLabel} subject "${srcSubject.name}" is not assigned to you.`,
      };
    }
  }

  // ── Content must be complete: both records are built from it ──
  if (data.questionType === "MCQ" && !data.options?.length) {
    return { success: false, error: "MCQ options are required to auto-translate." };
  }
  if (data.questionType === "MATCH_THE_FOLLOWING" && !data.matchPairs?.length) {
    return { success: false, error: "Match pairs are required to auto-translate." };
  }

  // ── Translate via the local OmniRoute gateway ──
  let translated: TranslatedQuestion;
  try {
    translated = await translateQuestion({
      targetLanguage: targetLabel,
      questionType: data.questionType,
      questionText: data.questionText,
      options: data.questionType === "MCQ" ? data.options : null,
      matchPairs: data.questionType === "MATCH_THE_FOLLOWING" ? data.matchPairs : null,
      answerKey: TRANSLATABLE_ANSWER_TYPES.includes(data.questionType)
        ? data.answerKey ?? null
        : null,
      explanation: data.explanation || null,
    });
  } catch (err) {
    const message =
      err instanceof OmniRouteError
        ? err.message
        : "AI translation failed. Please try again.";
    return { success: false, error: message };
  }

  const targetValues: QuestionFormValue = {
    ...data,
    medium: targetMedium,
    subjectId: targetSubjectId,
    chapterId: targetChapterId,
    topicId: targetTopicId,
    questionText: translated.questionText,
    answerKey: translated.answerKey ?? data.answerKey,
    explanation: translated.explanation ?? data.explanation ?? "",
    ...(data.questionType === "MCQ" && translated.options
      ? { options: translated.options }
      : {}),
    ...(data.questionType === "MATCH_THE_FOLLOWING" && translated.matchPairs
      ? { matchPairs: translated.matchPairs }
      : {}),
  };

  const translationGroupId = randomUUID();
  const sourceLabel = MEDIUM_TEXT[data.medium];

  try {
    // Unique codes per row — retry the whole pair on a collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const codeA = randomQuestionCode();
        let codeB = randomQuestionCode();
        while (codeB === codeA) codeB = randomQuestionCode();
        const sourceId = await prisma.$transaction(async (tx) => {
          const source = await tx.question.create({
            data: {
              ...toQuestionData(data),
              code: codeA,
              schoolId: session.schoolId,
              subjectId: data.subjectId,
              chapterId: data.chapterId,
              translationGroupId,
            },
          });
          await tx.question.create({
            data: {
              ...toQuestionData(targetValues),
              code: codeB,
              schoolId: session.schoolId,
              subjectId: targetSubjectId,
              chapterId: targetChapterId,
              translationGroupId,
            },
          });
          return source.id;
        });
        revalidateQuestions();
        return {
          success: true,
          id: sourceId,
          message: `Saved ${sourceLabel} + ${targetLabel} pair (#${codeA} · #${codeB}).`,
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue; // unique-code collision → try another pair of codes
        }
        throw err;
      }
    }
    return { success: false, error: "Could not generate unique question codes. Please try again." };
  } catch (err) {
    console.error("autoTranslateCreatePair failed:", err);
    return { success: false, error: "Could not create the question pair." };
  }
}

/**
 * AI Generate Translation (edit mode) — translates an EXISTING, UNLINKED
 * question into the opposite medium and creates its counterpart in one
 * round-trip: counterpart taxonomy resolved server-side (name → subject
 * code → list position), content translated via OmniRoute, both rows joined
 * under one translationGroupId. The source question stays where it is.
 */
export async function aiCreateCounterpart(questionId: string): Promise<ActionState> {
  const session = await requireSession();
  const q = await prisma.question.findFirst({
    where: { id: questionId, schoolId: session.schoolId },
    include: {
      subject: { select: { id: true, name: true, code: true, classLevelId: true, medium: true } },
      chapter: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
    },
  });
  if (!q) return { success: false, error: "Question not found." };
  if (q.translationGroupId) {
    return { success: false, error: "This question is already part of a bilingual pair." };
  }
  if (!q.chapter) {
    return { success: false, error: "Set a chapter on this question before generating its translation." };
  }

  const targetMedium: Medium = q.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH";
  const targetLabel = MEDIUM_TEXT[targetMedium];
  const sourceLabel = MEDIUM_TEXT[q.medium];
  const pair = await resolvePairTaxonomy(session.schoolId, {
    classLevelId: q.subject.classLevelId,
    sourceSubjectId: q.subject.id,
    subjectName: q.subject.name,
    subjectCode: q.subject.code,
    chapterName: q.chapter.name,
    sourceChapterId: q.chapter.id,
    topicName: q.topic?.name ?? null,
    sourceTopicId: q.topic?.id ?? null,
    targetMedium,
  });
  if (!pair.subjectId || !pair.chapterId || (q.topic && !pair.topicId)) {
    const missingLevel = !pair.subjectId
      ? `subject "${q.subject.name}"`
      : !pair.chapterId
        ? `chapter "${q.chapter.name}"`
        : `topic "${q.topic?.name ?? ""}"`;
    return {
      success: false,
      error: `No ${targetLabel} counterpart found for ${missingLevel} in this class — pair the two languages in Taxonomy (matching subject code, or the same chapters/topics in the same order), then retry.`,
    };
  }
  const targetSubjectId: string = pair.subjectId;
  const targetChapterId: string = pair.chapterId;

  // Teachers may only author in assigned subjects — the counterpart lands in
  // the target medium's subject, so check both.
  if (session.role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(session.id);
    if (!mySubjects.includes(q.subject.id)) {
      return { success: false, error: "You can only edit questions in your assigned subjects." };
    }
    if (!mySubjects.includes(targetSubjectId)) {
      return {
        success: false,
        error: `The ${targetLabel} subject "${q.subject.name}" is not assigned to you.`,
      };
    }
  }

  const rawOptions = q.options as {
    kind?: string;
    choices?: { label: string; text: string; isCorrect: boolean }[];
    pairs?: { left: string; right: string }[];
    layout?: string;
  } | null;
  if (q.questionType === "MCQ" && !rawOptions?.choices?.length) {
    return { success: false, error: "MCQ options are required to generate the translation." };
  }
  if (q.questionType === "MATCH_THE_FOLLOWING" && !rawOptions?.pairs?.length) {
    return { success: false, error: "Match pairs are required to generate the translation." };
  }
  if (q.questionType === "CASE_STUDY" && !q.caseStudyFormat) {
    return { success: false, error: "Choose a case-study format before generating the translation." };
  }

  // ── Translate via the local OmniRoute gateway ──
  let translated: TranslatedQuestion;
  try {
    translated = await translateQuestion({
      targetLanguage: targetLabel,
      questionType: q.questionType,
      questionText: q.questionText,
      options: q.questionType === "MCQ" ? rawOptions?.choices ?? null : null,
      matchPairs: q.questionType === "MATCH_THE_FOLLOWING" ? rawOptions?.pairs ?? null : null,
      answerKey: TRANSLATABLE_ANSWER_TYPES.includes(q.questionType) ? q.answerKey : null,
      explanation: q.explanation || null,
    });
  } catch (err) {
    const message =
      err instanceof OmniRouteError
        ? err.message
        : "AI translation failed. Please try again.";
    return { success: false, error: message };
  }

  const commonValues = {
    subjectId: targetSubjectId,
    chapterId: targetChapterId,
    topicId: pair.topicId ?? "",
    medium: targetMedium,
    difficulty: q.difficulty,
    bloomLevel: (q.bloomLevel ?? "UNDERSTAND") as QuestionFormValue["bloomLevel"],
    caseStudyFormat: q.caseStudyFormat ?? undefined,
    marks: q.marks,
    questionText: translated.questionText,
    answerKey: translated.answerKey ?? q.answerKey ?? "",
    explanation: translated.explanation ?? q.explanation ?? "",
    tags: q.tags,
    previousYearTag: q.previousYearTag ?? "",
  };
  let targetValues: QuestionFormValue;
  switch (q.questionType) {
    case "MCQ":
      targetValues = {
        ...commonValues,
        questionType: "MCQ",
        options: translated.options ?? rawOptions?.choices ?? [],
        layout: (rawOptions?.layout ?? "auto") as "auto" | "one-row" | "grid2" | "stacked",
      };
      break;
    case "MATCH_THE_FOLLOWING":
      targetValues = {
        ...commonValues,
        questionType: "MATCH_THE_FOLLOWING",
        matchPairs: translated.matchPairs ?? rawOptions?.pairs ?? [],
      };
      break;
    default:
      targetValues = { ...commonValues, questionType: q.questionType };
  }

  const translationGroupId = randomUUID();
  try {
    // Unique code for the new row — retry on collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const code = randomQuestionCode();
        await prisma.$transaction(async (tx) => {
          const created = await tx.question.create({
            data: {
              ...toQuestionData(targetValues),
              code,
              schoolId: session.schoolId,
              subjectId: targetSubjectId,
              chapterId: targetChapterId,
              translationGroupId,
            },
          });
          await tx.question.update({
            where: { id: q.id },
            data: { translationGroupId },
          });
          return created;
        });
        revalidateQuestions();
        return {
          success: true,
          message: `Created ${targetLabel} counterpart #${code} and linked it to ${sourceLabel} #${q.code}.`,
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue; // unique-code collision → try another code
        }
        throw err;
      }
    }
    return { success: false, error: "Could not generate a unique question code. Please try again." };
  } catch (err) {
    console.error("aiCreateCounterpart failed:", err);
    return { success: false, error: "Could not create the translation counterpart." };
  }
}

/**
 * Re-translates a linked counterpart's TEXT from the source question —
 * offered on the edit page when wording changed after pairing (the
 * translationOutdated flag from updateQuestion). Only language-dependent
 * fields are rewritten (question, options/pairs, explanation, text answers);
 * the counterpart keeps its own taxonomy and the language-neutral fields it
 * already shares with the source.
 */
export async function retranslateCounterpart(questionId: string): Promise<ActionState> {
  const session = await requireSession();
  const src = await prisma.question.findFirst({
    where: { id: questionId, schoolId: session.schoolId },
    select: {
      id: true,
      code: true,
      medium: true,
      translationGroupId: true,
      questionType: true,
      questionText: true,
      options: true,
      answerKey: true,
      explanation: true,
      marks: true,
      difficulty: true,
      bloomLevel: true,
      caseStudyFormat: true,
      subject: { select: { id: true } },
    },
  });
  if (!src) return { success: false, error: "Question not found." };
  if (!src.translationGroupId) {
    return { success: false, error: "This question is not part of a bilingual pair." };
  }
  const counterpart = await prisma.question.findFirst({
    where: {
      schoolId: session.schoolId,
      translationGroupId: src.translationGroupId,
      id: { not: src.id },
    },
    select: {
      id: true,
      code: true,
      medium: true,
      options: true,
      subject: { select: { id: true } },
    },
  });
  if (!counterpart) {
    return { success: false, error: "No counterpart question exists in this pair." };
  }

  if (session.role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(session.id);
    if (
      !mySubjects.includes(src.subject.id) ||
      !mySubjects.includes(counterpart.subject.id)
    ) {
      return { success: false, error: "You can only translate questions in your assigned subjects." };
    }
  }

  const srcRaw = src.options as {
    kind?: string;
    choices?: { label: string; text: string; isCorrect: boolean }[];
    pairs?: { left: string; right: string }[];
    layout?: string;
  } | null;
  if (src.questionType === "MCQ" && !srcRaw?.choices?.length) {
    return { success: false, error: "MCQ options are required to re-translate." };
  }
  if (src.questionType === "MATCH_THE_FOLLOWING" && !srcRaw?.pairs?.length) {
    return { success: false, error: "Match pairs are required to re-translate." };
  }

  const targetLabel = MEDIUM_TEXT[counterpart.medium];
  let translated: TranslatedQuestion;
  try {
    translated = await translateQuestion({
      targetLanguage: targetLabel,
      questionType: src.questionType,
      questionText: src.questionText,
      options: src.questionType === "MCQ" ? srcRaw?.choices ?? null : null,
      matchPairs: src.questionType === "MATCH_THE_FOLLOWING" ? srcRaw?.pairs ?? null : null,
      answerKey: TRANSLATABLE_ANSWER_TYPES.includes(src.questionType) ? src.answerKey : null,
      explanation: src.explanation || null,
    });
  } catch (err) {
    const message =
      err instanceof OmniRouteError
        ? err.message
        : "AI translation failed. Please try again.";
    return { success: false, error: message };
  }

  // Structure follows the SOURCE (type/options may have changed since
  // pairing); taxonomy stays with the counterpart, neutral fields are copied.
  const cpLayout = (counterpart.options as { layout?: string } | null)?.layout ?? "auto";
  const update: Prisma.QuestionUncheckedUpdateInput = {
    questionType: src.questionType,
    questionText: translated.questionText,
    explanation: translated.explanation ?? src.explanation ?? "",
    answerKey:
      src.questionType === "MCQ"
        ? (translated.options ?? [])
            .filter((o) => o.isCorrect)
            .map((o) => o.label)
            .join(", ") || null
        : (translated.answerKey ?? src.answerKey),
    marks: src.marks,
    difficulty: src.difficulty,
    bloomLevel: src.bloomLevel,
    caseStudyFormat: src.caseStudyFormat,
    options:
      src.questionType === "MCQ"
        ? ({
            kind: "mcq",
            choices: translated.options ?? srcRaw?.choices ?? [],
            layout: cpLayout,
          } as Prisma.InputJsonValue)
        : src.questionType === "MATCH_THE_FOLLOWING"
          ? ({
              kind: "match",
              pairs: translated.matchPairs ?? srcRaw?.pairs ?? [],
            } as Prisma.InputJsonValue)
          : src.questionType === "TRUE_FALSE"
            ? ({ kind: "trueFalse" } as Prisma.InputJsonValue)
            : Prisma.DbNull,
  };

  try {
    await prisma.question.update({ where: { id: counterpart.id }, data: update });
  } catch {
    return { success: false, error: "Could not update the counterpart." };
  }

  revalidateQuestions();
  return {
    success: true,
    message: `Re-translated #${counterpart.code} into ${targetLabel} from #${src.code}.`,
  };
}

export async function updateQuestion(
  id: string,
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { success: false, error: "Invalid form payload." };
  }

  const parsed = questionFormSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }
  const missing = missingRequired(parsed.data);
  if (missing) return { success: false, error: missing };

  // Ensure the question exists within this tenant
  const existing = await prisma.question.findFirst({
    where: { id, schoolId: session.schoolId },
    select: {
      id: true,
      medium: true,
      translationGroupId: true,
      questionType: true,
      questionText: true,
      options: true,
      answerKey: true,
      explanation: true,
      subjectId: true,
      chapterId: true,
      topicId: true,
    },
  });
  if (!existing) return { success: false, error: "Question not found." };

  const data = parsed.data;
  // A paired question's medium is fixed — changing it would break the
  // EN/GUJ swap the paper engine does through the shared group id.
  if (existing.translationGroupId && data.medium !== existing.medium) {
    return {
      success: false,
      error: "This question is part of a bilingual pair. Unlink it before changing the medium.",
    };
  }
  if (session.role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(session.id);
    if (!mySubjects.includes(data.subjectId)) {
      return { success: false, error: "You can only edit questions in your assigned subjects." };
    }
  }
  const chapter = await prisma.chapter.findFirst({
    where: { id: data.chapterId, subject: { schoolId: session.schoolId } },
    include: { subject: { select: { id: true } } },
  });
  if (!chapter) return { success: false, error: "Chapter not found in your school." };
  if (chapter.subject.id !== data.subjectId) {
    return { success: false, error: "Chapter does not belong to the selected subject." };
  }

  const outgoing = toQuestionData(data);

  // ── Bilingual pair: sync the language-neutral half ──
  // Text stays per-language (only retranslateCounterpart rewrites it). Marks,
  // difficulty, Bloom, case-study format, MCQ correct flags (by option
  // position) and TRUE_FALSE/NUMERIC answers are language-neutral — if they
  // drift, swapping the pair on a paper changes the answer between languages.
  let counterpart: { id: string; options: unknown; questionType: QuestionType } | null = null;
  if (existing.translationGroupId) {
    counterpart = await prisma.question.findFirst({
      where: {
        schoolId: session.schoolId,
        translationGroupId: existing.translationGroupId,
        id: { not: existing.id },
      },
      select: { id: true, options: true, questionType: true },
    });
  }

  let translationOutdated = false;
  const sync: Prisma.QuestionUncheckedUpdateInput = {};
  if (counterpart) {
    const prevRaw = existing.options as {
      kind?: string;
      choices?: { text?: string }[];
      pairs?: { left?: string; right?: string }[];
    } | null;
    // Did the wording (or structure) change in this save?
    const optionsTextChanged =
      data.questionType === "MCQ"
        ? !prevRaw?.choices ||
          prevRaw.choices.length !== data.options.length ||
          prevRaw.choices.some(
            (c, i) => (c.text ?? "").trim() !== (data.options[i]?.text ?? "").trim()
          )
        : data.questionType === "MATCH_THE_FOLLOWING"
          ? !prevRaw?.pairs ||
            prevRaw.pairs.length !== data.matchPairs.length ||
            prevRaw.pairs.some(
              (p, i) =>
                (p.left ?? "").trim() !== (data.matchPairs[i]?.left ?? "").trim() ||
                (p.right ?? "").trim() !== (data.matchPairs[i]?.right ?? "").trim()
            )
          : false;
    translationOutdated =
      existing.questionType !== data.questionType ||
      existing.questionText.trim() !== data.questionText.trim() ||
      (existing.explanation ?? "").trim() !== (data.explanation ?? "").trim() ||
      optionsTextChanged ||
      (TRANSLATABLE_ANSWER_TYPES.includes(data.questionType) &&
        (existing.answerKey ?? "").trim() !== (data.answerKey ?? "").trim());

    sync.marks = data.marks;
    sync.difficulty = data.difficulty;
    sync.bloomLevel = data.bloomLevel;
    sync.caseStudyFormat = outgoing.caseStudyFormat;

    // MCQ correct flags travel by option position — only when both sides
    // still have the same number of options (never guess the alignment).
    if (data.questionType === "MCQ" && counterpart.questionType === "MCQ") {
      const cpRaw = counterpart.options as {
        kind?: string;
        choices?: { label: string; text: string; isCorrect: boolean }[];
        layout?: string;
      } | null;
      const cpChoices = cpRaw?.choices;
      if (cpChoices && cpChoices.length === data.options.length) {
        const merged = cpChoices.map((c, i) => ({ ...c, isCorrect: data.options[i].isCorrect }));
        sync.options = {
          kind: "mcq",
          choices: merged,
          layout: cpRaw?.layout ?? "auto",
        } as Prisma.InputJsonValue;
        sync.answerKey = merged.filter((c) => c.isCorrect).map((c) => c.label).join(", ") || null;
      }
    } else if (data.questionType === "TRUE_FALSE" || data.questionType === "NUMERIC") {
      sync.answerKey = outgoing.answerKey; // "True"/"False" and numbers are language-neutral
    }

    // Taxonomy moved on this side → re-resolve the counterpart's rows the
    // same way pairing does (name → subject code → list position).
    const taxonomyChanged =
      existing.subjectId !== data.subjectId ||
      existing.chapterId !== data.chapterId ||
      existing.topicId !== (data.topicId || null);
    if (taxonomyChanged) {
      const newChapter = await prisma.chapter.findFirst({
        where: { id: data.chapterId, subject: { schoolId: session.schoolId } },
        select: {
          id: true,
          name: true,
          subject: { select: { id: true, name: true, code: true, classLevelId: true } },
        },
      });
      const newTopic = data.topicId
        ? await prisma.topic.findFirst({
            where: { id: data.topicId },
            select: { id: true, name: true },
          })
        : null;
      if (newChapter) {
        const pairTax = await resolvePairTaxonomy(session.schoolId, {
          classLevelId: newChapter.subject.classLevelId,
          sourceSubjectId: newChapter.subject.id,
          subjectName: newChapter.subject.name,
          subjectCode: newChapter.subject.code,
          chapterName: newChapter.name,
          sourceChapterId: newChapter.id,
          topicName: newTopic?.name ?? null,
          sourceTopicId: newTopic?.id ?? null,
          targetMedium: existing.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH",
        });
        // Apply only fully-resolved moves — a half-resolved counterpart
        // (no chapter) would break the row; surface it instead.
        if (pairTax.subjectId && pairTax.chapterId) {
          sync.subjectId = pairTax.subjectId;
          sync.chapterId = pairTax.chapterId;
          sync.topicId = pairTax.topicId ?? null;
        } else {
          translationOutdated = true;
        }
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.question.updateMany({
        where: { id, schoolId: session.schoolId },
        data: { ...outgoing, subjectId: data.subjectId, chapterId: data.chapterId },
      });
      if (counterpart && Object.keys(sync).length) {
        await tx.question.update({ where: { id: counterpart.id }, data: sync });
      }
    });
    revalidateQuestions();
    return {
      success: true,
      id,
      message: counterpart
        ? "Question updated — language-neutral fields synced to the pair."
        : "Question updated.",
      translationOutdated: counterpart ? translationOutdated : undefined,
    };
  } catch {
    return { success: false, error: "Could not update question." };
  }
}

export async function deleteQuestion(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    const row = await prisma.question.findFirst({
      where: { id, schoolId },
      select: { translationGroupId: true },
    });
    await prisma.$transaction(async (tx) => {
      // Sever the surviving counterpart — a dangling group id would leave it
      // medium-locked with no partner to swap to.
      if (row?.translationGroupId) {
        await tx.question.updateMany({
          where: { schoolId, translationGroupId: row.translationGroupId, id: { not: id } },
          data: { translationGroupId: null },
        });
      }
      await tx.question.deleteMany({ where: { id, schoolId } });
    });
  } catch {
    return { success: false, error: "Could not delete question." };
  }

  revalidateQuestions();
  return { success: true, message: "Question deleted." };
}

/**
 * Assigns (or clears) the reviewing teacher for a question. Admin-only —
 * teachers never see AI questions with no teacher, so someone must be able
 * to point an unassigned question at a teacher who will appear in their
 * review queue.
 */
export async function assignQuestionTeacher(
  questionId: string,
  teacherId: string | null
): Promise<ActionState> {
  const scope = await resolveAdminScope();

  const question = await prisma.question.findFirst({
    where: { id: questionId, schoolId: scope.schoolId },
    select: { id: true },
  });
  if (!question) return { success: false, error: "Question not found in your school." };

  if (teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, schoolId: scope.schoolId, role: "TEACHER", isActive: true },
      select: { id: true },
    });
    if (!teacher) return { success: false, error: "Teacher not found in your school." };
  }

  try {
    await prisma.question.updateMany({
      where: { id: questionId, schoolId: scope.schoolId },
      data: { assignedTeacherId: teacherId },
    });
  } catch {
    return { success: false, error: "Could not update question." };
  }

  revalidateQuestions();
  revalidatePath("/dashboard/teacher/questions/review");
  return {
    success: true,
    message: teacherId ? "Question assigned to teacher." : "Question unassigned.",
  };
}

// ------------------------------------------------------------
//  Read: paginated, filtered list
// ------------------------------------------------------------

export type QuestionListDTO = {
  id: string;
  code: string;
  questionText: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  medium: Medium;
  bloomLevel: BloomLevel | null;
  marks: number;
  /** JSON by question type — MCQ choices, match pairs, or null. */
  options: unknown;
  tags: string[];
  previousYearTag: string | null;
  createdAt: string;
  status: QuestionStatus;
  createdByAi: boolean;
  assignedTeacherId: string | null;
  /** Shared id of the EN/GUJ pair, or null when unpaired. */
  translationGroupId: string | null;
  /** A counterpart question exists in the other medium. */
  linked: boolean;
  subject: { id: string; name: string; code: string | null } | null;
  chapter: { id: string; name: string } | null;
};

export async function listQuestions(
  rawFilters: unknown
): Promise<PaginatedResponse<QuestionListDTO>> {
  const session = await requireSession();

  const filters = questionFilterSchema.safeParse(rawFilters);
  if (!filters.success) {
    return {
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
  }

  const f = filters.data;
  // "#506892" (or plain digits) also matches the human-friendly question code.
  const codeTerm = (f.search ?? "").replace(/^#/, "");
  const scope = await questionScopeFor(session);
  const where: Prisma.QuestionWhereInput = {
    schoolId: session.schoolId,
    AND: [scope],
    ...(f.subjectId ? { subjectId: f.subjectId } : {}),
    ...(f.chapterId ? { chapterId: f.chapterId } : {}),
    ...(f.topicId ? { topicId: f.topicId } : {}),
    ...(f.questionType ? { questionType: f.questionType } : {}),
    ...(f.difficulty ? { difficulty: f.difficulty } : {}),
    ...(f.medium ? { medium: f.medium } : {}),
    ...(f.bloomLevel ? { bloomLevel: f.bloomLevel } : {}),
    ...(f.previousYearTag
      ? { previousYearTag: { contains: f.previousYearTag } }
      : {}),
    ...(f.search
      ? {
          OR: [
            ...(codeTerm ? [{ code: { contains: codeTerm } }] : []),
            { questionText: { contains: f.search } },
            { explanation: { contains: f.search } },
            { tags: { has: f.search } },
            { previousYearTag: { contains: f.search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      select: {
        id: true,
        code: true,
        questionText: true,
        questionType: true,
        difficulty: true,
        medium: true,
        bloomLevel: true,
        marks: true,
        options: true,
        tags: true,
        previousYearTag: true,
        createdAt: true,
        status: true,
        createdByAi: true,
        assignedTeacherId: true,
        translationGroupId: true,
        subject: { select: { id: true, name: true, code: true } },
        chapter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);

  const items = await attachLinkedFlags(
    session.schoolId,
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      questionText: r.questionText,
      questionType: r.questionType,
      difficulty: r.difficulty,
      medium: r.medium,
      bloomLevel: r.bloomLevel,
      marks: r.marks,
      options: r.options,
      tags: r.tags,
      previousYearTag: r.previousYearTag,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      createdByAi: r.createdByAi,
      assignedTeacherId: r.assignedTeacherId,
      translationGroupId: r.translationGroupId,
      subject: r.subject,
      chapter: r.chapter,
    }))
  );

  return {
    items,
    meta: {
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    },
  };
}

// ------------------------------------------------------------
//  Read: question details by id (paper builder selected list)
// ------------------------------------------------------------

const QUESTION_LIST_SELECT = {
  id: true,
  code: true,
  questionText: true,
  questionType: true,
  difficulty: true,
  medium: true,
  bloomLevel: true,
  marks: true,
  options: true,
  tags: true,
  previousYearTag: true,
  createdAt: true,
  status: true,
  createdByAi: true,
  assignedTeacherId: true,
  translationGroupId: true,
  subject: { select: { id: true, name: true, code: true } },
  chapter: { select: { id: true, name: true } },
} as const;

type QuestionListRow = {
  id: string;
  code: string;
  questionText: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  medium: Medium;
  bloomLevel: BloomLevel | null;
  marks: number;
  options: unknown;
  tags: string[];
  previousYearTag: string | null;
  createdAt: Date;
  status: QuestionStatus;
  createdByAi: boolean;
  assignedTeacherId: string | null;
  translationGroupId: string | null;
  subject: { id: string; name: string; code: string | null } | null;
  chapter: { id: string; name: string } | null;
};

function toQuestionListDTO(r: QuestionListRow): QuestionListDTO {
  return {
    id: r.id,
    code: r.code,
    questionText: r.questionText,
    questionType: r.questionType,
    difficulty: r.difficulty,
    medium: r.medium,
    bloomLevel: r.bloomLevel,
    marks: r.marks,
    options: r.options,
    tags: r.tags,
    previousYearTag: r.previousYearTag,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    createdByAi: r.createdByAi,
    assignedTeacherId: r.assignedTeacherId,
    translationGroupId: r.translationGroupId,
    linked: false,
    subject: r.subject,
    chapter: r.chapter,
  };
}

/**
 * Fills `linked` on DTOs by checking — in one extra query — whether any
 * counterpart question exists in a different medium for each group.
 */
async function attachLinkedFlags<
  T extends { id: string; medium: Medium; translationGroupId: string | null },
>(schoolId: string, rows: T[]): Promise<(T & { linked: boolean })[]> {
  if (rows.length === 0) return rows.map((r) => ({ ...r, linked: false }));

  const groupIds = [
    ...new Set(rows.map((r) => r.translationGroupId).filter((g): g is string => Boolean(g))),
  ];
  if (groupIds.length === 0) return rows.map((r) => ({ ...r, linked: false }));

  const partners = await prisma.question.findMany({
    where: {
      schoolId,
      translationGroupId: { in: groupIds },
      id: { notIn: rows.map((r) => r.id) },
    },
    select: { translationGroupId: true, medium: true },
  });

  const mediumsByGroup = new Map<string, Set<string>>();
  for (const p of partners) {
    if (!p.translationGroupId) continue;
    const set = mediumsByGroup.get(p.translationGroupId) ?? new Set<string>();
    set.add(p.medium);
    mediumsByGroup.set(p.translationGroupId, set);
  }

  return rows.map((r) => ({
    ...r,
    linked:
      Boolean(r.translationGroupId) &&
      [...(mediumsByGroup.get(r.translationGroupId as string) ?? [])].some(
        (m) => m !== r.medium
      ),
  }));
}

/** Details for a set of question ids (all tenant-scoped). */
export async function getQuestionsByIds(ids: string[]): Promise<QuestionListDTO[]> {
  const session = await requireSession();
  const clean = [...new Set((ids ?? []).filter(Boolean))].slice(0, 300);
  if (clean.length === 0) return [];

  const rows = await prisma.question.findMany({
    where: { id: { in: clean }, schoolId: session.schoolId, AND: [await questionScopeFor(session)] },
    select: QUESTION_LIST_SELECT,
  });

  return attachLinkedFlags(session.schoolId, rows.map(toQuestionListDTO));
}

/**
 * Suggests swap-in alternatives for a question already on a paper.
 * Matches on type + marks first, preferring the same chapter and difficulty,
 * then widens to the whole subject so there is almost always a choice.
 */
export async function findReplacementQuestions(raw: unknown): Promise<QuestionListDTO[]> {
  const session = await requireSession();

  const input = (raw ?? {}) as { questionId?: string; excludeIds?: string[] };
  if (!input.questionId) return [];

  const reference = await prisma.question.findFirst({
    where: { id: input.questionId, schoolId: session.schoolId },
    select: { id: true, subjectId: true, chapterId: true, questionType: true, difficulty: true, marks: true },
  });
  if (!reference) return [];

  const exclude = [...new Set([...(input.excludeIds ?? []), reference.id])].filter(Boolean);

  const baseWhere: Prisma.QuestionWhereInput = {
    schoolId: session.schoolId,
    AND: [await questionScopeFor(session)],
    isActive: true,
    questionType: reference.questionType,
    marks: reference.marks,
    id: { notIn: exclude },
  };

  let rows = reference.chapterId
    ? await prisma.question.findMany({
        where: { ...baseWhere, chapterId: reference.chapterId },
        select: QUESTION_LIST_SELECT,
        orderBy: { createdAt: "desc" },
        take: 12,
      })
    : [];

  // Nothing else in that chapter — widen to the whole subject.
  if (rows.length === 0) {
    rows = await prisma.question.findMany({
      where: { ...baseWhere, subjectId: reference.subjectId },
      select: QUESTION_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      take: 12,
    });
  }

  // Same difficulty first — a replacement should not change the paper's balance.
  const ordered = [...rows].sort((a, b) => {
    const aMatch = a.difficulty === reference.difficulty ? 0 : 1;
    const bMatch = b.difficulty === reference.difficulty ? 0 : 1;
    return aMatch - bMatch;
  });

  return attachLinkedFlags(
    session.schoolId,
    ordered.slice(0, 8).map(toQuestionListDTO)
  );
}

// ------------------------------------------------------------
//  Taxonomy options for the cascading dropdowns
// ------------------------------------------------------------

export type TaxonomyNode = {
  id: string;
  name: string;
  code?: string | null; // subjects only
  medium?: Medium; // subjects only
  order?: number; // chapters/topics
  children: TaxonomyNode[];
};

export async function getTaxonomyTree(): Promise<TaxonomyNode[]> {
  const { schoolId } = await requireSession();

  const classLevels = await prisma.classLevel.findMany({
    where: { schoolId },
    orderBy: { order: "asc" },
    include: {
      subjects: {
        orderBy: { name: "asc" },
        include: {
          chapters: {
            orderBy: { order: "asc" },
            include: {
              topics: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });

  return classLevels.map((cl) => ({
    id: cl.id,
    name: cl.name,
    children: cl.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      medium: s.medium,
      children: s.chapters.map((ch) => ({
        id: ch.id,
        name: ch.name,
        order: ch.order,
        children: ch.topics.map((t) => ({
          id: t.id,
          name: t.name,
          order: t.order,
          children: [],
        })),
      })),
    })),
  }));
}

// ------------------------------------------------------------
//  Recent questions (the latest few, for the Add-Question page)
// ------------------------------------------------------------

export type RecentQuestionDTO = {
  id: string;
  code: string;
  questionText: string;
  questionType: QuestionType;
  medium: Medium;
  marks: number;
  createdAt: string;
  chapterName: string | null;
};

export async function listRecentQuestions(
  limit = 5
): Promise<RecentQuestionDTO[]> {
  const session = await requireSession();

  const rows = await prisma.question.findMany({
    where: { schoolId: session.schoolId, AND: [await questionScopeFor(session)] },
    select: {
      id: true,
      code: true,
      questionText: true,
      questionType: true,
      medium: true,
      marks: true,
      createdAt: true,
      chapter: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(25, Number(limit) || 5)),
  });

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    questionText: r.questionText,
    questionType: r.questionType,
    medium: r.medium,
    marks: r.marks,
    createdAt: r.createdAt.toISOString(),
    chapterName: r.chapter?.name ?? null,
  }));
}

// ------------------------------------------------------------
//  Single question fetch (edit form + view details modal)
// ------------------------------------------------------------

export type QuestionDetailDTO = QuestionListDTO & {
  answerKey: string | null;
  explanation: string | null;
  options: unknown;
  topicId: string | null;
  topicName: string | null;
  className: string | null;
  caseStudyFormat: CaseStudyFormat | null;
  status: QuestionStatus;
  createdByAi: boolean;
  isActive: boolean;
  examYear: string | null;
  imageUrl: string | null;
  updatedAt: string;
};

export async function getQuestionById(id: string): Promise<QuestionDetailDTO | null> {
  const { schoolId } = await requireSession();

  const q = await prisma.question.findFirst({
    where: { id, schoolId },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          classLevel: { select: { name: true } },
        },
      },
      chapter: { select: { id: true, name: true } },
      topic: { select: { name: true } },
    },
  });
  if (!q) return null;

  const linked = q.translationGroupId
    ? Boolean(
        await prisma.question.findFirst({
          where: {
            translationGroupId: q.translationGroupId,
            schoolId,
            id: { not: q.id },
            medium: { not: q.medium },
          },
          select: { id: true },
        })
      )
    : false;

  return {
    id: q.id,
    code: q.code,
    questionText: q.questionText,
    questionType: q.questionType,
    difficulty: q.difficulty,
    medium: q.medium,
    bloomLevel: q.bloomLevel,
    marks: q.marks,
    tags: q.tags,
    previousYearTag: q.previousYearTag,
    createdAt: q.createdAt.toISOString(),
    translationGroupId: q.translationGroupId,
    linked,
    subject: q.subject ? { id: q.subject.id, name: q.subject.name, code: q.subject.code } : null,
    chapter: q.chapter,
    answerKey: q.answerKey,
    explanation: q.explanation,
    options: q.options,
    topicId: q.topicId,
    topicName: q.topic?.name ?? null,
    className: q.subject?.classLevel?.name ?? null,
    caseStudyFormat: q.caseStudyFormat,
    status: q.status,
    createdByAi: q.createdByAi,
    assignedTeacherId: q.assignedTeacherId,
    isActive: q.isActive,
    examYear: q.examYear,
    imageUrl: q.imageUrl,
    updatedAt: q.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------
//  Bilingual pairing — counterpart lookup & unlink
// ------------------------------------------------------------

/**
 * Counterpart questions in the other medium for a set of source ids,
 * keyed by source id. Powers the paper builder's
 * "Generate Gujarati/English Equivalent" swap: every selected question
 * that has a paired translation is returned with full details, and ids
 * without a pair are simply absent from the map.
 */
export async function getTranslationMap(
  ids: string[]
): Promise<Record<string, QuestionListDTO>> {
  const session = await requireSession();
  const clean = [...new Set((ids ?? []).filter(Boolean))].slice(0, 300);
  if (clean.length === 0) return {};

  const sources = await prisma.question.findMany({
    where: { id: { in: clean }, schoolId: session.schoolId },
    select: { id: true, medium: true, translationGroupId: true },
  });
  const groupIds = [
    ...new Set(
      sources.map((s) => s.translationGroupId).filter((g): g is string => Boolean(g))
    ),
  ];
  if (groupIds.length === 0) return {};

  const partners = await prisma.question.findMany({
    where: {
      schoolId: session.schoolId,
      AND: [await questionScopeFor(session)],
      translationGroupId: { in: groupIds },
      id: { notIn: clean },
    },
    select: QUESTION_LIST_SELECT,
  });

  const byGroup = new Map<string, QuestionListRow[]>();
  for (const p of partners) {
    if (!p.translationGroupId) continue;
    const list = byGroup.get(p.translationGroupId) ?? [];
    list.push(p);
    byGroup.set(p.translationGroupId, list);
  }

  const out: Record<string, QuestionListDTO> = {};
  for (const src of sources) {
    if (!src.translationGroupId) continue;
    const candidate = (byGroup.get(src.translationGroupId) ?? []).find(
      (c) => c.medium !== src.medium
    );
    if (candidate) out[src.id] = toQuestionListDTO(candidate);
  }
  return out;
}

/**
 * Dissolves a bilingual pair: clears the group id on every question that
 * shares it (both directions become standalone). Used by the edit form's
 * "Unlink" escape hatch when a pair was created by mistake.
 */
export async function unlinkTranslation(questionId: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const question = await prisma.question.findFirst({
    where: { id: questionId, schoolId },
    select: { id: true, translationGroupId: true },
  });
  if (!question) return { success: false, error: "Question not found." };
  if (!question.translationGroupId) {
    return { success: false, error: "This question is not part of a bilingual pair." };
  }

  try {
    await prisma.question.updateMany({
      where: { schoolId, translationGroupId: question.translationGroupId },
      data: { translationGroupId: null },
    });
  } catch {
    return { success: false, error: "Could not unlink the translation pair." };
  }

  revalidateQuestions();
  return { success: true, message: "Translation pair unlinked." };
}
