"use server";

// ============================================================
//  Teacher Dashboard — data
//
//  Everything on the teacher dashboard is scoped to the signed-in
//  teacher: papers/questions they created or their assigned
//  subjects' bank, their own assignments and grading workload.
// ============================================================

import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { teacherSubjectIds } from "@/lib/question-scope";

export type TeacherStats = {
  myPapers: number;
  bankQuestions: number;
  pendingReview: number;
  activeAssignments: number;
};

export type AssignmentRow = {
  id: string;
  title: string;
  paperTitle: string;
  className: string;
  type: string;
  status: string;
  startTime: string;
  submittedCount: number;
  totalSubmissions: number;
};

export type RecentPaperRow = {
  id: string;
  title: string;
  status: string;
  subjectName: string;
  createdAt: string;
};

export type DifficultySlice = { difficulty: string; count: number };
export type ChapterSlice = { name: string; count: number };

export type SubjectCard = {
  id: string;
  name: string;
  className: string | null;
  questionCount: number;
  paperCount: number;
};

export type GradingSummary = {
  gradedSubmissions: number;
  averagePercent: number | null;
};

export type TeacherDashboardData = {
  teacherName: string;
  subjectsCount: number;
  stats: TeacherStats;
  assignments: AssignmentRow[];
  recentPapers: RecentPaperRow[];
  difficultyMix: DifficultySlice[];
  topChapters: ChapterSlice[];
  subjects: SubjectCard[];
  grading: GradingSummary;
};

export async function getTeacherDashboard(): Promise<TeacherDashboardData> {
  const session = await requireSession();

  const subjectIds = await teacherSubjectIds(session.id);
  const subjectScope = { subjectId: { in: subjectIds } };

  const [
    myPapers,
    bankQuestions,
    pendingReview,
    activeAssignments,
    assignments,
    recentPapers,
    difficultyGroups,
    chapterGroups,
    subjectRows,
    graded,
  ] = await Promise.all([
    // Papers the teacher personally created.
    prisma.paper.count({
      where: { schoolId: session.schoolId, createdById: session.id },
    }),

    // Questions available to the teacher across their assigned subjects
    // (the same bank the paper builder draws from).
    prisma.question.count({
      where: { schoolId: session.schoolId, ...subjectScope },
    }),

    // AI questions waiting for THIS teacher's review.
    prisma.question.count({
      where: {
        schoolId: session.schoolId,
        createdByAi: true,
        status: "PENDING",
        assignedTeacherId: session.id,
      },
    }),

    // This teacher's assignments that are live right now.
    prisma.paperAssignment.count({
      where: { schoolId: session.schoolId, createdById: session.id, status: "ACTIVE" },
    }),

    // Latest assignments with submission progress.
    prisma.paperAssignment.findMany({
      where: { schoolId: session.schoolId, createdById: session.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startTime: true,
        paper: { select: { title: true } },
        classLevel: { select: { name: true } },
        submissions: { select: { status: true } },
      },
    }),

    // Recent papers in the teacher's subject scope (same scope as the list).
    prisma.paper.findMany({
      where: { schoolId: session.schoolId, ...subjectScope },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        subject: { select: { name: true } },
      },
    }),

    // Analytics — difficulty mix of the bank across the teacher's subjects.
    subjectIds.length > 0
      ? prisma.question.groupBy({
          by: ["difficulty"],
          where: { schoolId: session.schoolId, ...subjectScope },
          _count: { _all: true },
        })
      : Promise.resolve([] as { difficulty: string; _count: { _all: number } }[]),

    // Analytics — most-used chapters (by bank size) in the teacher's subjects.
    subjectIds.length > 0
      ? prisma.question.groupBy({
          by: ["chapterId"],
          where: {
            schoolId: session.schoolId,
            chapterId: { not: null },
            ...subjectScope,
          },
          _count: { _all: true },
          orderBy: { _count: { chapterId: "desc" } },
          take: 5,
        })
      : Promise.resolve([] as { chapterId: string | null; _count: { _all: number } }[]),

    // Assigned subjects with per-subject bank/paper counts.
    prisma.teacherSubject.findMany({
      where: { teacherId: session.id },
      select: {
        subject: {
          select: {
            id: true,
            name: true,
            classLevel: { select: { name: true } },
          },
        },
      },
    }),

    // Grading workload — already-graded submissions across this teacher's
    // assignments, with the score as a percentage of the paper's marks.
    prisma.studentSubmission.findMany({
      where: {
        assignment: { schoolId: session.schoolId, createdById: session.id },
        gradedAt: { not: null },
        totalScore: { not: null },
      },
      select: {
        totalScore: true,
        assignment: { select: { paper: { select: { totalMarks: true } } } },
      },
    }),
  ]);

  // Chapter names for the top-chapters chart.
  const chapterIds = chapterGroups
    .map((g) => g.chapterId)
    .filter((id): id is string => Boolean(id));
  const chapters = chapterIds.length
    ? await prisma.chapter.findMany({
        where: { id: { in: chapterIds } },
        select: { id: true, name: true },
      })
    : [];
  const chapterName = new Map(chapters.map((c) => [c.id, c.name]));

  // Per-subject counts in one groupBy each (avoids N+1).
  const subjectIdList = subjectRows.map((r) => r.subject.id);
  const [qBySubject, pBySubject] = subjectIdList.length
    ? await Promise.all([
        prisma.question.groupBy({
          by: ["subjectId"],
          where: { schoolId: session.schoolId, subjectId: { in: subjectIdList } },
          _count: { _all: true },
        }),
        prisma.paper.groupBy({
          by: ["subjectId"],
          where: { schoolId: session.schoolId, subjectId: { in: subjectIdList } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const questionCountBy = new Map(qBySubject.map((g) => [g.subjectId, g._count._all]));
  const paperCountBy = new Map(pBySubject.map((g) => [g.subjectId, g._count._all]));

  // Average graded score as % of the paper's total marks.
  const percents = graded
    .filter((s) => (s.assignment.paper.totalMarks ?? 0) > 0)
    .map((s) => ((s.totalScore ?? 0) / (s.assignment.paper.totalMarks ?? 1)) * 100)
    .filter((p) => Number.isFinite(p));
  const averagePercent = percents.length
    ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
    : null;

  return {
    teacherName: session.name ?? "Teacher",
    subjectsCount: subjectRows.length,
    stats: { myPapers, bankQuestions, pendingReview, activeAssignments },
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      paperTitle: a.paper.title,
      className: a.classLevel.name,
      type: a.type,
      status: a.status,
      startTime: a.startTime.toISOString(),
      submittedCount: a.submissions.filter(
        (s) => s.status === "SUBMITTED" || s.status === "AUTO_SUBMITTED"
      ).length,
      totalSubmissions: a.submissions.length,
    })),
    recentPapers: recentPapers.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      subjectName: p.subject?.name ?? "—",
      createdAt: p.createdAt.toISOString(),
    })),
    difficultyMix: ["EASY", "MEDIUM", "HARD"]
      .map((difficulty) => ({
        difficulty,
        count: difficultyGroups.find((g) => g.difficulty === difficulty)?._count._all ?? 0,
      }))
      .filter((s) => s.count > 0),
    topChapters: chapterGroups.map((g) => ({
      name:
        (g.chapterId && chapterName.get(g.chapterId)) ||
        "Deleted chapter",
      count: g._count._all,
    })),
    subjects: subjectRows.map((r) => ({
      id: r.subject.id,
      name: r.subject.name,
      className: r.subject.classLevel?.name ?? null,
      questionCount: questionCountBy.get(r.subject.id) ?? 0,
      paperCount: paperCountBy.get(r.subject.id) ?? 0,
    })),
    grading: { gradedSubmissions: graded.length, averagePercent },
  };
}
