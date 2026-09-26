"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { BLOOM_LEVELS } from "@/lib/validations";

// ============================================================
//  TEACHER — AI Question Review Queue
//  A teacher can approve (with optional edits) or reject AI-
//  generated questions that are assigned to them or unassigned
//  in their school. Approved questions enter the active bank.
// ============================================================

const editSchema = z.object({
  questionText: z.string().trim().min(1, "Question text is required.").max(8000).optional(),
  answerKey: z.string().trim().max(8000).optional(),
  explanation: z.string().trim().max(8000).optional(),
  tags: z.array(z.string().trim().max(50)).max(8).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  bloom: z.enum(BLOOM_LEVELS).optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(10),
        text: z.string().trim().min(1).max(2000),
        isCorrect: z.boolean(),
      })
    )
    .optional(),
});

const reviewSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  edits: editSchema.optional(),
});

export type ReviewActionResult = { success: boolean; error?: string };

export async function reviewQuestion(raw: unknown): Promise<ReviewActionResult> {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { id, action, edits } = parsed.data;

  const session = await requireSession();
  if (session.role !== "TEACHER") {
    return { success: false, error: "Only teachers can review questions." };
  }

  const question = await prisma.question.findFirst({
    where: {
      id,
      schoolId: session.schoolId,
      createdByAi: true,
      status: "PENDING",
      OR: [{ assignedTeacherId: session.id }, { assignedTeacherId: null }],
    },
    select: { id: true, questionType: true },
  });
  if (!question) {
    return { success: false, error: "This question is not in your review queue." };
  }

  if (action === "approve") {
    const data: Prisma.QuestionUpdateInput = {
      status: "APPROVED",
      reviewedBy: { connect: { id: session.id } },
    };

    if (edits) {
      if (edits.questionText !== undefined) data.questionText = edits.questionText;
      if (edits.difficulty !== undefined) data.difficulty = edits.difficulty;
      if (edits.bloom !== undefined) data.bloomLevel = edits.bloom;
      if (edits.answerKey !== undefined) data.answerKey = edits.answerKey;
      if (edits.explanation !== undefined) data.explanation = edits.explanation;
      if (edits.tags !== undefined) data.tags = edits.tags;
      if (
        question.questionType === "MCQ" &&
        edits.options !== undefined &&
        edits.options.some((o) => o.isCorrect)
      ) {
        data.options = { kind: "mcq", choices: edits.options };
        if (edits.answerKey === undefined) {
          data.answerKey = edits.options
            .filter((o) => o.isCorrect)
            .map((o) => o.label)
            .join(", ");
        }
      }
    }

    await prisma.question.update({ where: { id }, data });
  } else {
    await prisma.question.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: session.id },
    });
  }

  revalidatePath("/dashboard/teacher/questions/review");
  revalidatePath("/dashboard/questions");
  return { success: true };
}