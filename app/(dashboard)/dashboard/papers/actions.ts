"use server";

// ============================================================
//  Paper Server Actions — CRUD + Blueprint Auto-Generation
//  All queries are tenant-scoped via requireSession().
// ============================================================

import { revalidatePath } from "next/cache";
import { Prisma, type DifficultyLevel } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { normalizeStoredHeaderConfig, type HeaderConfig } from "@/lib/paper-header";
import { teacherSubjectIds } from "@/lib/question-scope";
import { normalizePageConfig, type PageConfig } from "@/lib/paper-page";
import { normalizeSetCount } from "@/lib/paper-sets";
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

// ------------------------------------------------------------
//  Heading templates (shared helpers)
// ------------------------------------------------------------

export type HeaderTemplateDTO = {
  id: string;
  name: string;
  kind: "CUSTOM" | "EXAM";
  config: HeaderConfig;
  updatedAt: string;
};

const templateSelect = {
  id: true,
  name: true,
  kind: true,
  config: true,
  updatedAt: true,
} as const;

/**
 * Validates that a picked heading template belongs to this school.
 * An empty id means "use the school default header" (null).
 */
async function resolveHeaderTemplateId(
  schoolId: string,
  raw: string | undefined
): Promise<{ id: string | null; error?: string }> {
  const id = String(raw ?? "").trim();
  if (!id) return { id: null };
  const row = await prisma.headerTemplate.findFirst({
    where: { id, schoolId },
    select: { id: true },
  });
  if (!row) {
    return { id: null, error: "Heading template not found. Please pick another template." };
  }
  return { id: row.id };
}

// ============================================================
//  Heading template library (named, reusable paper headers)
// ============================================================

export async function listHeaderTemplates(): Promise<HeaderTemplateDTO[]> {
  const { schoolId } = await requireSession();
  const rows = await prisma.headerTemplate.findMany({
    where: { schoolId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      config: true,
      updatedAt: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    config: normalizeStoredHeaderConfig(r.config),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function saveHeaderTemplate(
  input: { id?: string; name: string; kind?: "CUSTOM" | "EXAM"; config: HeaderConfig }
): Promise<HeaderTemplateDTO | { error: string }> {
  const { schoolId } = await requireSession();
  const name = String(input.name ?? "").trim();
  if (!name) return { error: "Template name is required." };
  if (name.length > 80) return { error: "Template name must be 80 characters or fewer." };

  const config = normalizeStoredHeaderConfig(input.config);
  const kind: "CUSTOM" | "EXAM" = input.kind === "EXAM" ? "EXAM" : "CUSTOM";

  try {
    // Keep one row per name: re-saving under the same name overwrites it,
    // and an explicit id only ever addresses this school's own row.
    const scoped = input.id
      ? await prisma.headerTemplate.findFirst({
          where: { id: input.id, schoolId },
          select: { id: true },
        })
      : null;
    const byName = await prisma.headerTemplate.findFirst({
      where: { schoolId, name },
      select: { id: true },
    });
    const targetId = scoped?.id ?? byName?.id ?? null;
    if (input.id && !scoped) {
      return { error: "Template not found." };
    }

    const data = {
      name,
      kind,
      config: config as unknown as Prisma.InputJsonValue,
    };
    const row = targetId
      ? await prisma.headerTemplate.update({
          where: { id: targetId },
          data,
          select: templateSelect,
        })
      : await prisma.headerTemplate.create({
          data: { ...data, schoolId },
          select: templateSelect,
        });

    revalidatePapers();
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      config: normalizeStoredHeaderConfig(row.config),
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch {
    return { error: "Could not save the template. Please try again." };
  }
}

export async function deleteHeaderTemplate(id: string): Promise<ActionState> {
  const { schoolId } = await requireSession();
  try {
    // Papers keep printing: the FK is ON DELETE SET NULL, so they fall back
    // to the school default header.
    await prisma.headerTemplate.deleteMany({ where: { id, schoolId } });
    revalidatePapers();
    return { success: true, message: "Template deleted." };
  } catch {
    return { success: false, error: "Could not delete the template." };
  }
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
  setCount: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generationMode: "MANUAL" | "BLUEPRINT";
  createdAt: string;
  subject: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  _count: { sections: number; totalQuestions: number };
};

export type PaperSchoolProfile = {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  board: string | null;
  academicYear: string | null;
  /** The school's reusable header design (canvas or rows) — reset target. */
  headerConfig: HeaderConfig | null;
};

export type PaperDetailDTO = {
  id: string;
  title: string;
  description: string | null;
  totalMarks: number;
  passingMarks: number | null;
  duration: number | null;
  instructions: string | null;
  /** How many sets (A/B/C …) this paper exports as. */
  setCount: number;
  /** Selected heading template (null = school default header). */
  headerTemplateId: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generationMode: "MANUAL" | "BLUEPRINT";
  schoolHeader: string | null;
  pageConfig: PageConfig | null;
  watermarkText: string | null;
  pdfUrl: string | null;
  answerKeyPdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
  subject: { id: string; name: string; classLevel: { name: string } | null } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  school: PaperSchoolProfile | null;
  sections: {
    id: string;
    title: string;
    instructions: string | null;
    order: number;
    totalMarks: number;
    negativeMarks: number | null;
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

  // Validate that all question IDs belong to the tenant (unique set — a
  // question selected in two sections must not be flagged as missing)
  const allQuestionIds = data.sections.flatMap((s) => s.questionIds);
  const uniqueQuestionIds = [...new Set(allQuestionIds)];
  const validQuestions = await prisma.question.findMany({
    where: { id: { in: uniqueQuestionIds }, schoolId: session.schoolId },
    select: { id: true, marks: true },
  });

  if (validQuestions.length !== uniqueQuestionIds.length) {
    const foundIds = new Set(validQuestions.map((q) => q.id));
    const missing = uniqueQuestionIds.filter((id) => !foundIds.has(id));
    return {
      success: false,
      error: `${missing.length} question(s) not found in your school. Please refresh and try again.`,
    };
  }

  // Build question marks lookup
  const questionMarksMap = new Map(validQuestions.map((q) => [q.id, q.marks]));

  // Heading template must belong to this school.
  const template = await resolveHeaderTemplateId(session.schoolId, data.headerTemplateId);
  if (template.error) return { success: false, error: template.error };

  try {
    const paper = await prisma.$transaction(
      async (tx) => {
        const createdPaper = await tx.paper.create({
          data: {
            title: data.title,
            description: data.description || null,
            totalMarks: data.totalMarks,
            passingMarks: data.passingMarks ? Number(data.passingMarks) : null,
            duration: data.duration || null,
            instructions: data.instructions || null,
            schoolHeader: data.schoolHeader || null,
            pageConfig: data.pageConfig
              ? (data.pageConfig as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            watermarkText: data.watermarkText || null,
            generationMode: "MANUAL",
            schoolId: session.schoolId,
            subjectId: data.subjectId || null,
            createdById: session.id,
            setCount: normalizeSetCount(data.setCount),
            headerTemplateId: template.id,
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
              negativeMarks: sectionData.negativeMarks || null,
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
      },
      { maxWait: 15000, timeout: 120000 }
    );

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

  // Heading template must belong to this school.
  const template = await resolveHeaderTemplateId(session.schoolId, data.headerTemplateId);
  if (template.error) return { success: false, error: template.error };

  try {
    const paper = await prisma.$transaction(
      async (tx) => {
        const createdPaper = await tx.paper.create({
          data: {
            title: data.title,
            description: data.description || null,
            totalMarks: data.totalMarks,
            passingMarks: data.passingMarks ? Number(data.passingMarks) : null,
            duration: data.duration || null,
            instructions: data.instructions || null,
            schoolHeader: data.schoolHeader || null,
            pageConfig: data.pageConfig
              ? (data.pageConfig as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            watermarkText: data.watermarkText || null,
            generationMode: "BLUEPRINT",
            schoolId: session.schoolId,
            subjectId: data.subjectId,
            createdById: session.id,
            setCount: normalizeSetCount(data.setCount),
            headerTemplateId: template.id,
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
                medium: subject.medium,
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
                medium: subject.medium,
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
              // No auto instructions — the per-section marks already show
              // beside the title in every view/export.
              instructions: null,
              order: ruleIdx,
              totalMarks: count * marksEach,
              negativeMarks: rule.negativeMarks || null,
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
      },
      { maxWait: 15000, timeout: 120000 }
    );

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
    select: { id: true, headerTemplateId: true },
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
  if (data.setCount !== undefined) updateData.setCount = normalizeSetCount(data.setCount);
  if (data.headerTemplateId !== undefined) {
    const template = await resolveHeaderTemplateId(session.schoolId, data.headerTemplateId);
    if (template.error) return { success: false, error: template.error };
    // Only touch the relation when it actually changes: connecting an already
    // connected paper is a no-op, and disconnecting a paper that has no
    // template would issue a pointless UPDATE.
    if (template.id !== existing.headerTemplateId) {
      updateData.headerTemplate = template.id
        ? { connect: { id: template.id } }
        : { disconnect: true };
    }
  }
  if (data.pageConfig !== undefined) {
    updateData.pageConfig = data.pageConfig
      ? (data.pageConfig as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull;
  }
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
  const { schoolId, role, id } = await requireSession();

  const filters = (rawFilters ?? {}) as {
    search?: string;
    subjectId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  };

  const page = Number(filters.page) || 1;
  const pageSize = Number(filters.pageSize) || 20;

  // Teachers only see papers of the subjects assigned to them by the school
  // admin — the same scope as the question bank. Everyone else sees the
  // whole school.
  let subjectScope: Prisma.PaperWhereInput = {};
  if (role === "TEACHER") {
    const mySubjects = await teacherSubjectIds(id);
    subjectScope = { subjectId: { in: mySubjects } };
  }

  const where: Prisma.PaperWhereInput = {
    schoolId,
    ...(filters.search ? { title: { contains: filters.search } } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
    // Spread last so the teacher restriction always wins over any filter.
    ...subjectScope,
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
        setCount: true,
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
      setCount: r.setCount,
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
    select: {
      id: true,
      title: true,
      description: true,
      totalMarks: true,
      passingMarks: true,
      duration: true,
      instructions: true,
      setCount: true,
      headerTemplateId: true,
      status: true,
      generationMode: true,
      schoolHeader: true,
      pageConfig: true,
      watermarkText: true,
      pdfUrl: true,
      answerKeyPdfUrl: true,
      createdAt: true,
      updatedAt: true,
      subject: {
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
        },
      },
      school: {
        select: {
          name: true,
          logoUrl: true,
          address: true,
          phone: true,
          board: true,
          academicYear: true,
          headerConfig: true,
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          instructions: true,
          order: true,
          totalMarks: true,
          negativeMarks: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              marksOverride: true,
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
    setCount: paper.setCount,
    headerTemplateId: paper.headerTemplateId,
    status: paper.status,
    generationMode: paper.generationMode,
    schoolHeader: paper.schoolHeader,
    pageConfig: paper.pageConfig ? normalizePageConfig(paper.pageConfig) : null,
    watermarkText: paper.watermarkText,
    pdfUrl: paper.pdfUrl,
    answerKeyPdfUrl: paper.answerKeyPdfUrl,
    createdAt: paper.createdAt.toISOString(),
    updatedAt: paper.updatedAt.toISOString(),
    subject: paper.subject,
    createdBy: paper.createdBy,
    school: paper.school
      ? {
          name: paper.school.name,
          logoUrl: paper.school.logoUrl,
          address: paper.school.address,
          phone: paper.school.phone,
          board: paper.school.board,
          academicYear: paper.school.academicYear,
          headerConfig: paper.school.headerConfig
            ? normalizeStoredHeaderConfig(paper.school.headerConfig)
            : null,
        }
      : null,
    sections: paper.sections.map((s) => ({
      id: s.id,
      title: s.title,
      instructions: s.instructions,
      order: s.order,
      totalMarks: s.totalMarks,
      negativeMarks: s.negativeMarks,
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
//  Replace a question inside a paper section
//  Used when a teacher doesn't like a generated pick and wants to
//  swap in another question from the bank.
// ============================================================

export async function replacePaperQuestion(input: {
  sectionId: string;
  currentQuestionId: string;
  newQuestionId: string;
}): Promise<ActionState> {
  const { schoolId } = await requireSession();

  const section = await prisma.paperSection.findFirst({
    where: { id: input.sectionId, paper: { schoolId } },
    select: { id: true, paperId: true },
  });
  if (!section) return { success: false, error: "Paper section not found." };

  if (input.currentQuestionId === input.newQuestionId) {
    return { success: false, error: "Pick a different question to swap in." };
  }

  const replacement = await prisma.question.findFirst({
    where: { id: input.newQuestionId, schoolId, isActive: true },
    select: { id: true },
  });
  if (!replacement) {
    return { success: false, error: "That question is not available in your school." };
  }

  const existing = await prisma.paperSectionQuestion.findFirst({
    where: { sectionId: section.id, questionId: input.currentQuestionId },
    select: { id: true },
  });
  if (!existing) return { success: false, error: "That question is no longer in this section." };

  const duplicate = await prisma.paperSectionQuestion.findFirst({
    where: { sectionId: section.id, questionId: input.newQuestionId },
    select: { id: true },
  });
  if (duplicate) return { success: false, error: "That question is already in this section." };

  try {
    await prisma.paperSectionQuestion.update({
      where: { id: existing.id },
      data: { questionId: input.newQuestionId },
    });
    await recalcSectionMarks(section.id);
    revalidatePapers();
    return { success: true, message: "Question replaced." };
  } catch {
    return { success: false, error: "Could not replace the question." };
  }
}

/**
 * Recomputes a section's printed marks from its current questions.
 * The paper's `totalMarks` is deliberately left alone — it is an authored
 * target, not a sum, so swapping a question must not silently retotal it.
 */
async function recalcSectionMarks(sectionId: string): Promise<void> {
  const rows = await prisma.paperSectionQuestion.findMany({
    where: { sectionId },
    select: { marksOverride: true, question: { select: { marks: true } } },
  });
  const total = rows.reduce((sum, r) => sum + (r.marksOverride ?? r.question.marks), 0);
  await prisma.paperSection.update({ where: { id: sectionId }, data: { totalMarks: total } });
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
    NUMERIC: "Numeric",
  };
  return map[type] || type;
}

function chapterNameFallback(rule: { chapterName?: string; chapterId: string }): string {
  return rule.chapterName || rule.chapterId.slice(0, 8);
}
