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
    ["SHORT_ANSWER", "LONG_ANSWER", "FILL_IN_THE_BLANK", "TRUE_FALSE"].includes(
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
//  Single question fetch (for edit modal)
// ------------------------------------------------------------

export type QuestionDetailDTO = QuestionListDTO & {
  answerKey: string | null;
  explanation: string | null;
  options: unknown;
  topicId: string | null;
  caseStudyFormat: CaseStudyFormat | null;
};

export async function getQuestionById(id: string): Promise<QuestionDetailDTO | null> {
  const { schoolId } = await requireSession();

  const q = await prisma.question.findFirst({
    where: { id, schoolId },
    include: {
      subject: { select: { id: true, name: true } },
      chapter: { select: { id: true, name: true } },
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
    subject: q.subject,
    chapter: q.chapter,
    answerKey: q.answerKey,
    explanation: q.explanation,
    options: q.options,
    topicId: q.topicId,
    caseStudyFormat: q.caseStudyFormat,
  };
}
