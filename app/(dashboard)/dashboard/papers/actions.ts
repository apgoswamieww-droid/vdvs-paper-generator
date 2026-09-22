"use server";

// ============================================================
//  Paper Server Actions — CRUD + Blueprint Auto-Generation
//  All queries are tenant-scoped via requireSession().
// ============================================================

import { revalidatePath } from "next/cache";
import type { Prisma, DifficultyLevel } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  createManualPaperSchema,
  createBlueprintPaperSchema,
  updatePaperSchema,
  type ActionState,
} from "@/lib/validations";
import type { PaginatedResponse } from "@/types";

const PAPER_PATHS = ["/dashboard/papers", "/dashboard"];

function revalidatePapers() {
  for (const p of PAPER_PATHS) revalidatePath(p);
}

// ============================================================
//  Types
// ============================================================

export type PaperListDTO = {
  id: string;
  title: string;
  totalMarks: number;
  passingMarks: number | null;
  duration: number | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generationMode: "MANUAL" | "BLUEPRINT";
  createdAt: string;
  subject: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  _count: { sections: number; totalQuestions: number };
};

export type PaperDetailDTO = {
  id: string;
  title: string;
  description: string | null;
  totalMarks: number;
  passingMarks: number | null;
  duration: number | null;
  instructions: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generationMode: "MANUAL" | "BLUEPRINT";
  schoolHeader: string | null;
  watermarkText: string | null;
  pdfUrl: string | null;
  answerKeyPdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
  subject: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  sections: {
    id: string;
    title: string;
    instructions: string | null;
    order: number;
    totalMarks: number;
    questions: {
      id: string;
      order: number;
      marksOverride: number | null;
      question: {
        id: string;
        questionText: string;
        questionType: string;
        difficulty: string;
        marks: number;
        options: unknown;
        answerKey: string | null;
        explanation: string | null;
        subject: { id: string; name: string };
        chapter: { id: string; name: string } | null;
      };
    }[];
  }[];
};

// ============================================================
//  Create Paper — Manual Mode
// ============================================================

export async function createManualPaper(
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

  const parsed = createManualPaperSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }

  const data = parsed.data;

  // Validate that all question IDs belong to the tenant
  const allQuestionIds = data.sections.flatMap((s) => s.questionIds);
  const validQuestions = await prisma.question.findMany({
    where: { id: { in: allQuestionIds }, schoolId: session.schoolId },
    select: { id: true, marks: true },
  });

  if (validQuestions.length !== allQuestionIds.length) {
    const foundIds = new Set(validQuestions.map((q) => q.id));
    const missing = allQuestionIds.filter((id) => !foundIds.has(id));
    return {
      success: false,
      error: `${missing.length} question(s) not found in your school. Please refresh and try again.`,
    };
  }

  // Build question marks lookup
  const questionMarksMap = new Map(validQuestions.map((q) => [q.id, q.marks]));

  try {
    const paper = await prisma.$transaction(async (tx) => {
      const createdPaper = await tx.paper.create({
        data: {
          title: data.title,
          description: data.description || null,
          totalMarks: data.totalMarks,
          passingMarks: data.passingMarks ? Number(data.passingMarks) : null,
          duration: data.duration || null,
          instructions: data.instructions || null,
          schoolHeader: data.schoolHeader || null,
          watermarkText: data.watermarkText || null,
          generationMode: "MANUAL",
          schoolId: session.schoolId,
          subjectId: data.subjectId || null,
          createdById: session.id,
        },
      });

      // Create sections with questions
      for (let sectionIdx = 0; sectionIdx < data.sections.length; sectionIdx++) {
        const sectionData = data.sections[sectionIdx];
        const section = await tx.paperSection.create({
          data: {
            title: sectionData.title,
            instructions: sectionData.instructions || null,
            order: sectionIdx,
            totalMarks: 0,
            paperId: createdPaper.id,
          },
        });

        let sectionMarks = 0;
        for (let qIdx = 0; qIdx < sectionData.questionIds.length; qIdx++) {
          const qId = sectionData.questionIds[qIdx];
          const marks = questionMarksMap.get(qId) || 1;
          await tx.paperSectionQuestion.create({
            data: {
              order: qIdx,
              sectionId: section.id,
              questionId: qId,
            },
          });
          sectionMarks += marks;
        }

        await tx.paperSection.update({
          where: { id: section.id },
          data: { totalMarks: sectionMarks },
        });
      }

      return createdPaper;
    });

    revalidatePapers();
    return { success: true, id: paper.id, message: "Paper created successfully." };
  } catch (err) {
    console.error("createManualPaper error:", err);
    return { success: false, error: "Could not create paper. Please try again." };
  }
}

// ============================================================
//  Create Paper — Blueprint / Auto-Generation Mode
// ============================================================

export async function createBlueprintPaper(
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

  const parsed = createBlueprintPaperSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }

  const data = parsed.data;

  // Verify subject belongs to tenant
  const subject = await prisma.subject.findFirst({
    where: { id: data.subjectId, schoolId: session.schoolId },
  });
  if (!subject) {
    return { success: false, error: "Subject not found in your school." };
  }

  try {
    const paper = await prisma.$transaction(async (tx) => {
      const createdPaper = await tx.paper.create({
        data: {
          title: data.title,
          description: data.description || null,
          totalMarks: data.totalMarks,
          passingMarks: data.passingMarks ? Number(data.passingMarks) : null,
          duration: data.duration || null,
          instructions: data.instructions || null,
          schoolHeader: data.schoolHeader || null,
          watermarkText: data.watermarkText || null,
          generationMode: "BLUEPRINT",
          schoolId: session.schoolId,
          subjectId: data.subjectId,
          createdById: session.id,
        },
      });

      const usedQuestionIds = new Set<string>();

      for (let ruleIdx = 0; ruleIdx < data.rules.length; ruleIdx++) {
        const rule = data.rules[ruleIdx];
        const { chapterId, questionType, count, marksEach, difficultyDistribution } = rule;

        // Build difficulty pool split
        const difficultySplits = buildDifficultySplit(count, difficultyDistribution);

        const selectedQuestions: { id: string }[] = [];

        for (const [difficulty, pickCount] of difficultySplits) {
          if (pickCount <= 0) continue;

          const candidates = await tx.question.findMany({
            where: {
              schoolId: session.schoolId,
              subjectId: data.subjectId,
              chapterId,
              questionType,
              difficulty: difficulty as DifficultyLevel,
              id: { notIn: Array.from(usedQuestionIds) },
            },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          });

          // Randomly pick from candidates using Fisher-Yates shuffle
          const shuffled = shuffleArray(candidates);
          const picked = shuffled.slice(0, pickCount);

          for (const q of picked) {
            usedQuestionIds.add(q.id);
            selectedQuestions.push(q);
          }
        }

        // If we couldn't pick enough, relax difficulty constraint and fill
        if (selectedQuestions.length < count) {
          const remaining = count - selectedQuestions.length;
          const filler = await tx.question.findMany({
            where: {
              schoolId: session.schoolId,
              subjectId: data.subjectId,
              chapterId,
              questionType,
              id: { notIn: Array.from(usedQuestionIds) },
            },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          });

          const picked = shuffleArray(filler).slice(0, remaining);
          for (const q of picked) {
            usedQuestionIds.add(q.id);
            selectedQuestions.push(q);
          }
        }

        // Create section for this rule
        const section = await tx.paperSection.create({
          data: {
            title: `${chapterNameFallback(rule)} — ${formatQuestionType(questionType)}`,
            instructions: `${count} × ${marksEach} marks = ${count * marksEach} marks`,
            order: ruleIdx,
            totalMarks: count * marksEach,
            paperId: createdPaper.id,
          },
        });

        for (let qIdx = 0; qIdx < selectedQuestions.length; qIdx++) {
          await tx.paperSectionQuestion.create({
            data: {
              order: qIdx,
              marksOverride: marksEach,
              sectionId: section.id,
              questionId: selectedQuestions[qIdx].id,
            },
          });
        }
      }

      return createdPaper;
    });

    revalidatePapers();
    return { success: true, id: paper.id, message: "Paper auto-generated successfully." };
  } catch (err) {
    console.error("createBlueprintPaper error:", err);
    return { success: false, error: "Could not generate paper. Please try again." };
  }
}

// ============================================================
//  Update Paper (metadata / customization)
// ============================================================

export async function updatePaper(
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

  const parsed = updatePaperSchema.safeParse(rawJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return { success: false, error: `${path}: ${issue?.message ?? "Invalid data"}` };
  }

  const existing = await prisma.paper.findFirst({
    where: { id, schoolId: session.schoolId },
    select: { id: true },
  });
  if (!existing) return { success: false, error: "Paper not found." };

  const data = parsed.data;
  const updateData: Prisma.PaperUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.duration !== undefined) updateData.duration = data.duration || null;
  if (data.totalMarks !== undefined) updateData.totalMarks = data.totalMarks;
  if (data.passingMarks !== undefined) updateData.passingMarks = data.passingMarks ? Number(data.passingMarks) : null;
  if (data.instructions !== undefined) updateData.instructions = data.instructions || null;
  if (data.schoolHeader !== undefined) updateData.schoolHeader = data.schoolHeader || null;
  if (data.watermarkText !== undefined) updateData.watermarkText = data.watermarkText || null;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "PUBLISHED") updateData.publishedAt = new Date();
  }

  try {
    await prisma.paper.updateMany({
      where: { id, schoolId: session.schoolId },
      data: updateData,
    });
    revalidatePapers();
    return { success: true, id, message: "Paper updated." };
  } catch {
    return { success: false, error: "Could not update paper." };
  }
}

// ============================================================
//  Delete Paper
// ============================================================

export async function deletePaper(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  try {
    await prisma.paper.deleteMany({ where: { id, schoolId } });
  } catch {
    return { success: false, error: "Could not delete paper." };
  }

  revalidatePapers();
  return { success: true, message: "Paper deleted." };
}

// ============================================================
//  Publish Paper
// ============================================================

export async function publishPaper(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const paper = await prisma.paper.findFirst({
    where: { id, schoolId },
    select: { id: true, status: true, sections: { select: { questions: { select: { id: true } } } } },
  });

  if (!paper) return { success: false, error: "Paper not found." };
  if (paper.sections.length === 0) return { success: false, error: "Paper has no sections. Add questions before publishing." };

  const totalQuestions = paper.sections.reduce((sum, s) => sum + s.questions.length, 0);
  if (totalQuestions === 0) return { success: false, error: "Paper has no questions. Add questions before publishing." };

  try {
    await prisma.paper.updateMany({
      where: { id, schoolId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    revalidatePapers();
    return { success: true, id, message: "Paper published." };
  } catch {
    return { success: false, error: "Could not publish paper." };
  }
}

// ============================================================
//  List Papers (paginated)
// ============================================================

export async function listPapers(
  rawFilters: unknown
): Promise<PaginatedResponse<PaperListDTO>> {
  const { schoolId } = await requireSession();

  const filters = (rawFilters ?? {}) as {
    search?: string;
    subjectId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  };

  const page = Number(filters.page) || 1;
  const pageSize = Number(filters.pageSize) || 20;

  const where: Prisma.PaperWhereInput = {
    schoolId,
    ...(filters.search ? { title: { contains: filters.search } } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.paper.count({ where }),
    prisma.paper.findMany({
      where,
      select: {
        id: true,
        title: true,
        totalMarks: true,
        passingMarks: true,
        duration: true,
        status: true,
        generationMode: true,
        createdAt: true,
        subject: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        sections: {
          select: {
            questions: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      totalMarks: r.totalMarks,
      passingMarks: r.passingMarks,
      duration: r.duration,
      status: r.status,
      generationMode: r.generationMode,
      createdAt: r.createdAt.toISOString(),
      subject: r.subject,
      createdBy: r.createdBy,
      _count: {
        sections: r.sections.length,
        totalQuestions: r.sections.reduce((sum, s) => sum + s.questions.length, 0),
      },
    })),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

// ============================================================
//  Get Paper by ID (full detail)
// ============================================================

export async function getPaperById(id: string): Promise<PaperDetailDTO | null> {
  const { schoolId } = await requireSession();

  const paper = await prisma.paper.findFirst({
    where: { id, schoolId },
    include: {
      subject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: {
                select: {
                  id: true,
                  questionText: true,
                  questionType: true,
                  difficulty: true,
                  marks: true,
                  options: true,
                  answerKey: true,
                  explanation: true,
                  subject: { select: { id: true, name: true } },
                  chapter: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!paper) return null;

  return {
    id: paper.id,
    title: paper.title,
    description: paper.description,
    totalMarks: paper.totalMarks,
    passingMarks: paper.passingMarks,
    duration: paper.duration,
    instructions: paper.instructions,
    status: paper.status,
    generationMode: paper.generationMode,
    schoolHeader: paper.schoolHeader,
    watermarkText: paper.watermarkText,
    pdfUrl: paper.pdfUrl,
    answerKeyPdfUrl: paper.answerKeyPdfUrl,
    createdAt: paper.createdAt.toISOString(),
    updatedAt: paper.updatedAt.toISOString(),
    subject: paper.subject,
    createdBy: paper.createdBy,
    sections: paper.sections.map((s) => ({
      id: s.id,
      title: s.title,
      instructions: s.instructions,
      order: s.order,
      totalMarks: s.totalMarks,
      questions: s.questions.map((q) => ({
        id: q.id,
        order: q.order,
        marksOverride: q.marksOverride,
        question: q.question,
      })),
    })),
  };
}

// ============================================================
//  Helper: Build difficulty distribution split
// ============================================================

function buildDifficultySplit(
  totalCount: number,
  distribution: { easy: number; medium: number; hard: number }
): [string, number][] {
  const easyCount = Math.round((totalCount * distribution.easy) / 100);
  const hardCount = Math.round((totalCount * distribution.hard) / 100);
  const mediumCount = totalCount - easyCount - hardCount;

  return [
    ["EASY", easyCount],
    ["MEDIUM", Math.max(0, mediumCount)],
    ["HARD", hardCount],
  ];
}

// ============================================================
//  Helper: Fisher-Yates shuffle
// ============================================================

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
//  Helper: Format question type for display
// ============================================================

function formatQuestionType(type: string): string {
  const map: Record<string, string> = {
    MCQ: "MCQ",
    SHORT_ANSWER: "Short Answer",
    LONG_ANSWER: "Long Answer",
    TRUE_FALSE: "True/False",
    FILL_IN_THE_BLANK: "Fill in the Blanks",
    MATCH_THE_FOLLOWING: "Match the Following",
    CASE_STUDY: "Case Study",
  };
  return map[type] || type;
}

function chapterNameFallback(rule: { chapterName?: string; chapterId: string }): string {
  return rule.chapterName || rule.chapterId.slice(0, 8);
}
