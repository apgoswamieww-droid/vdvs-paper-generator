"use server";

import { requireSession } from "@/lib/session";
import prisma from "@/lib/prisma";
import type { ActionState } from "@/lib/validations";

export type AssignmentDTO = {
  id: string;
  title: string;
  type: string;
  status: string;
  startTime: Date;
  endTime: Date;
  paperTitle: string;
  className: string;
  totalSubmissions: number;
  submittedCount: number;
  totalStudents: number;
};

export async function listAssignments(): Promise<AssignmentDTO[]> {
  const session = await requireSession();
  const assignments = await prisma.paperAssignment.findMany({
    where: { schoolId: session.schoolId, createdById: session.id },
    include: {
      paper: { select: { title: true } },
      classLevel: { select: { name: true } },
      submissions: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    status: a.status,
    startTime: a.startTime,
    endTime: a.endTime,
    paperTitle: a.paper.title,
    className: a.classLevel.name,
    totalSubmissions: a.submissions.length,
    submittedCount: a.submissions.filter(
      (s) => s.status === "SUBMITTED" || s.status === "AUTO_SUBMITTED"
    ).length,
    totalStudents: 0,
  }));
}

export async function createAssignment(data: {
  title: string;
  paperId: string;
  classLevelId: string;
  type: "EXAM" | "HOMEWORK";
  startTime: string;
  endTime: string;
}): Promise<ActionState> {
  try {
    const session = await requireSession();

    // Validate paper belongs to this school
    const paper = await prisma.paper.findFirst({
      where: { id: data.paperId, schoolId: session.schoolId },
      select: { id: true },
    });
    if (!paper) return { success: false, error: "Paper not found in your school." };

    // Validate classLevel belongs to this school
    const cls = await prisma.classLevel.findFirst({
      where: { id: data.classLevelId, schoolId: session.schoolId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "Class not found in your school." };

    const assignment = await prisma.paperAssignment.create({
      data: {
        title: data.title,
        type: data.type,
        status: new Date(data.startTime) <= new Date() ? "ACTIVE" : "SCHEDULED",
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        schoolId: session.schoolId,
        paperId: data.paperId,
        classLevelId: data.classLevelId,
        createdById: session.id,
      },
    });

    // Pre-create NOT_STARTED submissions for all students in the class
    const students = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        classLevelId: data.classLevelId,
        role: "STUDENT",
        isActive: true,
      },
      select: { id: true },
    });

    if (students.length > 0) {
      await prisma.studentSubmission.createMany({
        data: students.map((s) => ({
          assignmentId: assignment.id,
          studentId: s.id,
          status: "NOT_STARTED",
        })),
      });
    }

    return { success: true, id: assignment.id };
  } catch (e) {
    return { success: false, error: "Failed to create assignment" };
  }
}

export async function getAssignmentSubmissions(assignmentId: string) {
  const session = await requireSession();
  const assignment = await prisma.paperAssignment.findFirst({
    where: { id: assignmentId, schoolId: session.schoolId },
    include: {
      paper: {
        include: {
          sections: {
            include: {
              questions: { select: { marksOverride: true, question: { select: { marks: true } } } },
            },
          },
        },
      },
      classLevel: { select: { name: true } },
      submissions: {
        include: {
          student: { select: { id: true, name: true, email: true } },
          answers: true,
        },
        orderBy: { student: { name: "asc" } },
      },
    },
  });

  if (!assignment) throw new Error("Assignment not found");
  return assignment;
}

export async function gradeAnswer(
  answerId: string,
  marks: number,
  comment?: string
): Promise<ActionState> {
  try {
    const session = await requireSession();

    // Tenant-scoped: verify answer belongs to this school's assignment
    const answer = await prisma.answer.findFirst({
      where: {
        id: answerId,
        submission: { assignment: { schoolId: session.schoolId } },
      },
      select: { id: true, submissionId: true },
    });
    if (!answer) return { success: false, error: "Answer not found." };

    await prisma.answer.update({
      where: { id: answerId },
      data: {
        awardedMarks: marks,
        graderComment: comment || null,
        gradedAt: new Date(),
        graderId: session.id,
      },
    });

    // Recalculate total score for the submission (already tenant-scoped via answer)
    const allAnswers = await prisma.answer.findMany({
      where: { submissionId: answer.submissionId },
    });
    const totalScore = allAnswers.reduce((sum, a) => sum + (a.awardedMarks ?? 0), 0);
    const allGraded = allAnswers.every((a) => a.gradedAt !== null);

    await prisma.studentSubmission.update({
      where: { id: answer.submissionId },
      data: {
        totalScore,
        gradedAt: allGraded ? new Date() : null,
      },
    });

    return { success: true };
  } catch {
    return { success: false, error: "Failed to grade answer" };
  }
}
