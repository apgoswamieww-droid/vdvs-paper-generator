"use server";

// ============================================================
//  Question Server Actions — CRUD + paginated listing
//  All queries are tenant-scoped via requireSession().
// ============================================================

import { revalidatePath } from "next/cache";
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
import {
  questionFormSchema,
  questionFilterSchema,
  type ActionState,
  type QuestionFormValue,
} from "@/lib/validations";
import type { PaginatedResponse } from "@/types";

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

  // Tenant ownership check on chapter (implies subject belongs to tenant too)
  const chapter = await prisma.chapter.findFirst({
    where: { id: data.chapterId, subject: { schoolId: session.schoolId } },
    include: { subject: { select: { id: true } } },
  });
  if (!chapter) return { success: false, error: "Chapter not found in your school." };
  if (chapter.subject.id !== data.subjectId) {
    return { success: false, error: "Chapter does not belong to the selected subject." };
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
            ...toQuestionData(parsed.data),
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
    select: { id: true },
  });
  if (!existing) return { success: false, error: "Question not found." };

  const data = parsed.data;
  const chapter = await prisma.chapter.findFirst({
    where: { id: data.chapterId, subject: { schoolId: session.schoolId } },
    include: { subject: { select: { id: true } } },
  });
  if (!chapter) return { success: false, error: "Chapter not found in your school." };
  if (chapter.subject.id !== data.subjectId) {
    return { success: false, error: "Chapter does not belong to the selected subject." };
  }

  try {
    await prisma.question.updateMany({
      where: { id, schoolId: session.schoolId },
      data: {
        ...toQuestionData(parsed.data),
        subjectId: data.subjectId,
        chapterId: data.chapterId,
      },
    });
    revalidateQuestions();
    return { success: true, id, message: "Question updated." };
  } catch {
    return { success: false, error: "Could not update question." };
  }
}

export async function deleteQuestion(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.question.deleteMany({ where: { id, schoolId } });
  } catch {
    return { success: false, error: "Could not delete question." };
  }

  revalidateQuestions();
  return { success: true, message: "Question deleted." };
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
  subject: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
};

export async function listQuestions(
  rawFilters: unknown
): Promise<PaginatedResponse<QuestionListDTO>> {
  const { schoolId } = await requireSession();

  const filters = questionFilterSchema.safeParse(rawFilters);
  if (!filters.success) {
    return {
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    };
  }

  const f = filters.data;
  const where: Prisma.QuestionWhereInput = {
    schoolId,
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
        subject: { select: { id: true, name: true } },
        chapter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);

  return {
    items: rows.map((r) => ({
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
      subject: r.subject,
      chapter: r.chapter,
    })),
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
  subject: { select: { id: true, name: true } },
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
  subject: { id: string; name: string } | null;
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
    subject: r.subject,
    chapter: r.chapter,
  };
}

/** Details for a set of question ids (all tenant-scoped). */
export async function getQuestionsByIds(ids: string[]): Promise<QuestionListDTO[]> {
  const { schoolId } = await requireSession();

  const clean = [...new Set((ids ?? []).filter(Boolean))].slice(0, 300);
  if (clean.length === 0) return [];

  const rows = await prisma.question.findMany({
    where: { id: { in: clean }, schoolId },
    select: QUESTION_LIST_SELECT,
  });

  return rows.map(toQuestionListDTO);
}

/**
 * Suggests swap-in alternatives for a question already on a paper.
 * Matches on type + marks first, preferring the same chapter and difficulty,
 * then widens to the whole subject so there is almost always a choice.
 */
export async function findReplacementQuestions(raw: unknown): Promise<QuestionListDTO[]> {
  const { schoolId } = await requireSession();

  const input = (raw ?? {}) as { questionId?: string; excludeIds?: string[] };
  if (!input.questionId) return [];

  const reference = await prisma.question.findFirst({
    where: { id: input.questionId, schoolId },
    select: { id: true, subjectId: true, chapterId: true, questionType: true, difficulty: true, marks: true },
  });
  if (!reference) return [];

  const exclude = [...new Set([...(input.excludeIds ?? []), reference.id])].filter(Boolean);

  const baseWhere: Prisma.QuestionWhereInput = {
    schoolId,
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

  return ordered.slice(0, 8).map(toQuestionListDTO);
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
  const { schoolId } = await requireSession();

  const rows = await prisma.question.findMany({
    where: { schoolId },
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
          classLevel: { select: { name: true } },
        },
      },
      chapter: { select: { id: true, name: true } },
      topic: { select: { name: true } },
    },
  });
  if (!q) return null;

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
    subject: q.subject ? { id: q.subject.id, name: q.subject.name } : null,
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
    isActive: q.isActive,
    examYear: q.examYear,
    imageUrl: q.imageUrl,
    updatedAt: q.updatedAt.toISOString(),
  };
}
