"use server";

// ============================================================
//  School Admin Dashboard — data
//
//  Everything is scoped to the signed-in SCHOOL_ADMIN's school.
//  Mirrors the teacher dashboard's shape: batched queries, no N+1.
// ============================================================

import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export type AdminStats = {
  teachers: number;
  students: number;
  papers: number;
  questions: number;
};

export type UserGrowthSlice = { label: string; teachers: number; students: number };

export type PaperStatusSlice = { status: string; count: number };

export type AssignmentRow = {
  id: string;
  title: string;
  paperTitle: string;
  className: string;
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
  creatorName: string | null;
  createdAt: string;
};

export type SubjectSlice = { id: string; name: string; questionCount: number };

export type AdminDashboardData = {
  adminName: string;
  schoolName: string;
  planTier: string;
  stats: AdminStats;
  classCount: number;
  subjectCount: number;
  pendingAiQuestions: number;
  aiApprovedTotal: number;
  aiRejectedTotal: number;
  activeAssignments: number;
  assignmentCount: number;
  gradedSubmissions: number;
  averagePercent: number | null;
  paperStatus: PaperStatusSlice[];
  growth: UserGrowthSlice[];
  subjects: SubjectSlice[];
  assignments: AssignmentRow[];
  recentPapers: RecentPaperRow[];
};

function sixMonthsAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const session = await requireSession();
  const schoolId = session.schoolId;

  const [
    school,
    teachers,
    students,
    papers,
    questions,
    classCount,
    subjectCount,
    pendingAiQuestions,
    aiApprovedTotal,
    aiRejectedTotal,
    activeAssignments,
    assignmentCount,
    graded,
    paperGroups,
    teacherByMonth,
    studentByMonth,
    subjectGroups,
    assignments,
    recentPapers,
  ] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, planTier: true },
    }),

    prisma.user.count({ where: { schoolId, role: "TEACHER" } }),
    prisma.user.count({ where: { schoolId, role: "STUDENT" } }),
    prisma.paper.count({ where: { schoolId } }),
    prisma.question.count({ where: { schoolId } }),

    prisma.classLevel.count({ where: { schoolId } }),
    prisma.subject.count({ where: { schoolId } }),

    // AI pipeline — pending reviews sitting with teachers.
    prisma.question.count({ where: { schoolId, createdByAi: true, status: "PENDING" } }),
    prisma.question.count({ where: { schoolId, createdByAi: true, status: "APPROVED" } }),
    prisma.question.count({ where: { schoolId, createdByAi: true, status: "REJECTED" } }),

    prisma.paperAssignment.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.paperAssignment.count({ where: { schoolId } }),

    // Grading health across the school's assignments.
    prisma.studentSubmission.findMany({
      where: {
        assignment: { schoolId },
        gradedAt: { not: null },
        totalScore: { not: null },
      },
      select: {
        totalScore: true,
        assignment: { select: { paper: { select: { totalMarks: true } } } },
      },
    }),

    prisma.paper.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: { _all: true },
    }),

    // Sign-up trend — join dates for the last 6 months, per role. Bucketed
    // in JS below (Prisma can't group by month directly).
    prisma.user.findMany({
      where: {
        schoolId,
        role: "TEACHER",
        createdAt: { gte: sixMonthsAgo() },
      },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: {
        schoolId,
        role: "STUDENT",
        createdAt: { gte: sixMonthsAgo() },
      },
      select: { createdAt: true },
    }),

    // Biggest subject banks (top 6).
    prisma.question.groupBy({
      by: ["subjectId"],
      where: { schoolId },
      _count: { _all: true },
      orderBy: { _count: { subjectId: "desc" } },
      take: 6,
    }),

    // Latest assignments with submission progress.
    prisma.paperAssignment.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        paper: { select: { title: true } },
        classLevel: { select: { name: true } },
        submissions: { select: { status: true } },
      },
    }),

    // Latest papers with creator.
    prisma.paper.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        subject: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  // ── Sign-up trend: bucket both roles into the last 6 calendar months ──
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const monthLabel = (key: string) => {
    const [, m] = key.split("-");
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      Number(m) - 1
    ];
  };

  const countByMonth = (
    rows: { createdAt: Date }[],
    key: string
  ) => rows.filter((r) => monthKey(r.createdAt) === key).length;

  const growth: UserGrowthSlice[] = months.map((key) => ({
    label: monthLabel(key),
    teachers: countByMonth(teacherByMonth, key),
    students: countByMonth(studentByMonth, key),
  }));

  // ── Per-subject bank sizes ──
  const subjectIds = subjectGroups.map((g) => g.subjectId);
  const subjectRows = subjectIds.length
    ? await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true },
      })
    : [];
  const subjectName = new Map(subjectRows.map((s) => [s.id, s.name]));

  // ── Average graded score ──
  const percents = graded
    .filter((s) => (s.assignment.paper.totalMarks ?? 0) > 0)
    .map((s) => ((s.totalScore ?? 0) / (s.assignment.paper.totalMarks ?? 1)) * 100)
    .filter((p) => Number.isFinite(p));
  const averagePercent = percents.length
    ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
    : null;

  return {
    adminName: session.name ?? "Admin",
    schoolName: school?.name ?? "Your school",
    planTier: school?.planTier ?? "FREE",
    stats: { teachers, students, papers, questions },
    classCount,
    subjectCount,
    pendingAiQuestions,
    aiApprovedTotal,
    aiRejectedTotal,
    activeAssignments,
    assignmentCount,
    gradedSubmissions: graded.length,
    averagePercent,
    paperStatus: ["DRAFT", "PUBLISHED", "ARCHIVED"].map((status) => ({
      status,
      count: paperGroups.find((g) => g.status === status)?._count._all ?? 0,
    })),
    growth,
    subjects: subjectGroups.map((g) => ({
      id: g.subjectId,
      name: subjectName.get(g.subjectId) ?? "Subject",
      questionCount: g._count._all,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      paperTitle: a.paper.title,
      className: a.classLevel.name,
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
      creatorName: p.createdBy?.name ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}
