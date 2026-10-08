import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { sweepReminders } from "@/lib/notifications";
import { ReviewQueueClient } from "./review-queue-client";

export const metadata: Metadata = {
  title: "Review Questions",
  description: "Approve, edit, or reject AI-generated questions.",
};

export type ReviewQuestionRow = {
  id: string;
  code: string;
  questionText: string;
  questionType: string;
  difficulty: string;
  medium: string;
  bloomLevel: string | null;
  options: unknown;
  answerKey: string | null;
  explanation: string | null;
  tags: string[];
  examYear: string | null;
  assignedTeacherName: string | null;
  className: string | null;
  subjectName: string;
  chapterName: string | null;
  topicName: string | null;
  createdAt: string;
};

const questionSelect = {
  id: true,
  code: true,
  questionText: true,
  questionType: true,
  difficulty: true,
  medium: true,
  bloomLevel: true,
  options: true,
  answerKey: true,
  explanation: true,
  tags: true,
  examYear: true,
  assignedTeacher: { select: { name: true } },
  subject: { select: { name: true, classLevel: { select: { name: true } } } },
  chapter: { select: { name: true } },
  topic: { select: { name: true } },
  createdAt: true,
} as const;

export default async function TeacherReviewQueuePage() {
  const session = await requireSession();

  // Second reminder trigger (the poll endpoint is the first): throttled to
  // one sweep per 5 minutes per school inside sweepReminders().
  void sweepReminders(session.schoolId);

  const [allPending, approved] = await Promise.all([
    // PENDING means "awaiting a teacher's eyes", which now covers both
    // AI-generated questions and bulk-imported ones (see
    // questions/import/actions.ts). The filter must therefore NOT require
    // createdByAi, and must also surface unassigned rows — a bulk import
    // lands with assignedTeacherId = null so the importing teacher can
    // review their own upload. Filtering on createdByAi here made every
    // bulk-imported question permanently invisible and unapprovable.
    prisma.question.findMany({
      where: {
        schoolId: session.schoolId,
        status: "PENDING",
        OR: [{ assignedTeacherId: session.id }, { assignedTeacherId: null }],
      },
      orderBy: { createdAt: "asc" },
      select: questionSelect,
    }),
    prisma.question.findMany({
      where: {
        schoolId: session.schoolId,
        status: "APPROVED",
        OR: [{ reviewedById: session.id }, { assignedTeacherId: session.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: questionSelect,
    }),
  ]);

  function toRow(q: (typeof allPending)[number]): ReviewQuestionRow {
    return {
      id: q.id,
      code: q.code,
      questionText: q.questionText,
      questionType: q.questionType,
      difficulty: q.difficulty,
      medium: q.medium,
      bloomLevel: q.bloomLevel,
      options: q.options,
      answerKey: q.answerKey,
      explanation: q.explanation,
      tags: q.tags,
      examYear: q.examYear,
      assignedTeacherName: q.assignedTeacher?.name ?? null,
      className: q.subject.classLevel?.name ?? null,
      subjectName: q.subject.name,
      chapterName: q.chapter?.name ?? null,
      topicName: q.topic?.name ?? null,
      createdAt: q.createdAt.toISOString(),
    };
  }

  const pending = allPending.map(toRow);
  const approvedRows = approved.map(toRow);

  return (
    <ReviewQueueClient
      pending={pending}
      approved={approvedRows}
      teacherName={session.name ?? "You"}
      isTeacher={session.role === "TEACHER"}
    />
  );
}