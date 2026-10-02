// ============================================================
//  Question visibility scoping
//
//  Admins see the whole school bank. Teachers only see questions
//  of the subjects assigned to them in the school admin panel —
//  and only APPROVED ones, plus AI questions that were assigned to
//  them (so their review queue and bank agree).
// ============================================================

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type QuestionScoper = {
  role: string;
  id: string;
};

/**
 * Builds the Prisma where-clause fragment restricting which questions
 * a user may see. Returns `{}` for non-teachers (admin/school scope).
 * Teachers with no assigned subjects see nothing.
 */
export async function questionScopeFor(
  session: QuestionScoper
): Promise<Prisma.QuestionWhereInput> {
  if (session.role !== "TEACHER") return {};

  const rows = await prisma.teacherSubject.findMany({
    where: { teacherId: session.id },
    select: { subjectId: true },
  });
  const subjectIds = rows.map((r) => r.subjectId);

  if (subjectIds.length === 0) return { subjectId: { in: [] } };

  return {
    subjectId: { in: subjectIds },
    OR: [{ status: "APPROVED" }, { assignedTeacherId: session.id }],
  };
}

/** All subject ids a teacher is assigned to teach. */
export async function teacherSubjectIds(teacherId: string): Promise<string[]> {
  const rows = await prisma.teacherSubject.findMany({
    where: { teacherId },
    select: { subjectId: true },
  });
  return rows.map((r) => r.subjectId);
}