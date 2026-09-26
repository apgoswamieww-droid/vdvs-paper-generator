"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveAdminScope } from "../scope";
import { randomQuestionCode } from "@/lib/question-code";
import { BLOOM_LEVELS, MEDIUMS } from "@/lib/validations";
import type { QuestionType } from "@prisma/client";

// ============================================================
//  SCHOOL ADMIN — AI Question Generator
//  Persists AI-generated questions into the bank. Unless the
//  admin auto-approves, questions land with status PENDING and
//  are routed to a teacher for approval (or the school-wide
//  teacher review queue).
// ============================================================

const itemSchema = z.object({
  questionText: z.string().trim().min(1, "Question text is required.").max(8000),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Option label is required.").max(10),
        text: z.string().trim().min(1, "Option text is required.").max(2000),
        isCorrect: z.boolean(),
      })
    )
    .optional(),
  answerKey: z.string().trim().max(8000).optional(),
  explanation: z.string().trim().max(8000).optional(),
  tags: z.array(z.string().trim().max(50)).max(8).default([]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  bloom: z.enum(BLOOM_LEVELS).default("REMEMBER"),
  assignedTeacherId: z.string().trim().optional().nullable(),
});

const contextSchema = z.object({
  classLevelId: z.string().min(1),
  subjectId: z.string().min(1),
  chapterId: z.string().min(1),
  topicId: z.string().trim().optional().nullable(),
  medium: z.enum(MEDIUMS),
  questionType: z.enum(["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "TRUE_FALSE"]),
  previousYear: z.boolean(),
  examYear: z.string().trim().max(20).optional().nullable(),
});

const saveGeneratedSchema = z.object({
  schoolId: z.string().optional().nullable(),
  autoApprove: z.boolean(),
  context: contextSchema,
  questions: z.array(itemSchema).min(1, "Nothing to save.").max(20),
});

export type SaveGeneratedResult = {
  success: boolean;
  error?: string;
  created?: number;
  status?: "PENDING" | "APPROVED";
  skipped?: { index: number; reason: string }[];
};

export async function saveGeneratedQuestions(raw: unknown): Promise<SaveGeneratedResult> {
  const parsed = saveGeneratedSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid payload." };
  }
  const { autoApprove, context, questions, schoolId } = parsed.data;

  const scope = await resolveAdminScope(schoolId);

  const cls = await prisma.classLevel.findFirst({
    where: { id: context.classLevelId, schoolId: scope.schoolId },
    select: {
      subjects: {
        where: { id: context.subjectId },
        select: { chapters: { where: { id: context.chapterId }, select: { id: true } } },
      },
    },
  });
  const subject = cls?.subjects[0];
  if (!cls || !subject || !subject.chapters[0]) {
    return { success: false, error: "The selected standard / subject / chapter is not part of this school." };
  }

  if (context.topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: context.topicId, chapterId: context.chapterId },
      select: { id: true },
    });
    if (!topic) return { success: false, error: "The selected topic does not belong to the chapter." };
  }

  const [school, reviewers] = await Promise.all([
    prisma.school.findUnique({ where: { id: scope.schoolId }, select: { board: true } }),
    autoApprove ? auth() : Promise.resolve(null),
  ]);

  const reviewerId =
    autoApprove && reviewers
      ? ((reviewers.user as { id?: string } | null)?.id ?? null)
      : null;

  const teacherIds = [...new Set(questions.map((q) => q.assignedTeacherId).filter((id): id is string => Boolean(id)))];
  if (teacherIds.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: teacherIds }, schoolId: scope.schoolId, role: "TEACHER", isActive: true },
      select: { id: true },
    });
    const foundSet = new Set(found.map((t) => t.id));
    const missing = teacherIds.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      return { success: false, error: "One of the assigned teachers is not part of this school." };
    }
  }

  const questionType = context.questionType as QuestionType;
  const status = autoApprove ? "APPROVED" : "PENDING";
  const skipped: SaveGeneratedResult["skipped"] = [];
  let created = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const isMcq = questionType === "MCQ";
    const hasValidMcqOptions =
      Array.isArray(q.options) && q.options.length >= 2 && q.options.some((o) => o.isCorrect);

    if (isMcq && !hasValidMcqOptions) {
      skipped.push({ index: i, reason: "MCQ needs at least 2 options with one marked correct." });
      continue;
    }
    if (!isMcq && !q.answerKey?.trim()) {
      skipped.push({ index: i, reason: "A model answer is required." });
      continue;
    }

    const previousYearTag =
      context.previousYear && school?.board
        ? `${school.board} ${context.examYear?.trim() || ""}`.trim() || null
        : null;

    let code = randomQuestionCode();
    let attempt = 0;
    for (;;) {
      try {
        await prisma.question.create({
          data: {
            code,
            questionText: q.questionText,
            questionType,
            difficulty: q.difficulty,
            medium: context.medium,
            marks: 1,
            options: isMcq && q.options ? { kind: "mcq", choices: q.options } : Prisma.DbNull,
            answerKey: q.answerKey?.trim() || null,
            explanation: q.explanation?.trim() || null,
            tags: q.tags.slice(0, 8),
            status,
            createdByAi: true,
            examYear: context.examYear?.trim() || null,
            previousYearTag,
            assignedTeacherId: q.assignedTeacherId || null,
            reviewedById: reviewerId,
            schoolId: scope.schoolId,
            subjectId: context.subjectId,
            chapterId: context.chapterId,
            topicId: context.topicId || null,
            bloomLevel: q.bloom,
          },
        });
        created++;
        break;
      } catch (err) {
        const isCodeCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          typeof err.meta?.target === "string" &&
          err.meta.target.includes("code");
        if (!isCodeCollision || attempt >= 3) {
          skipped.push({ index: i, reason: "Could not save (database error)." });
          break;
        }
        code = randomQuestionCode();
        attempt++;
      }
    }
  }

  revalidatePath("/dashboard/questions");
  revalidatePath("/dashboard/teacher/questions/review");

  if (created === 0) {
    return { success: false, error: "No questions could be saved. " + (skipped[0]?.reason ?? "") };
  }

  return { success: true, created, status, skipped };
}