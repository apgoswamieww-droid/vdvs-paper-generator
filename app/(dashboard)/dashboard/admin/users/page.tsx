import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import { UsersClient } from "./users-client";
import type { UserRole } from "@/types";

export const metadata: Metadata = {
  title: "Users & Staff",
  description: "Manage teachers and students in your school.",
};

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  className: string | null;
  isActive: boolean;
  subjectIds: string[];
  subjectNames: string[];
};

/** Subject option grouped by class, for the teacher assignment picker. */
export type SubjectOption = {
  id: string;
  name: string;
  className: string;
};

const STAFF_ROLES: UserRole[] = ["TEACHER", "STUDENT"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const scope = await resolveAdminScope(params.schoolId);

  const [users, classes, subjects, school, importHistory] = await Promise.all([
    prisma.user.findMany({
      where: { schoolId: scope.schoolId, role: { in: STAFF_ROLES } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        classLevel: { select: { name: true } },
        assignedSubjects: { select: { subject: { select: { id: true, name: true } } } },
      },
    }),
    prisma.classLevel.findMany({
      where: { schoolId: scope.schoolId },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      where: { schoolId: scope.schoolId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        classLevel: { select: { name: true } },
      },
    }),
    prisma.school.findUnique({ where: { id: scope.schoolId }, select: { name: true } }),
    // Bulk-import audit trail (questions + students), newest first.
    prisma.questionImport.findMany({
      where: { schoolId: scope.schoolId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        fileName: true,
        kind: true,
        status: true,
        totalCount: true,
        successCount: true,
        failedCount: true,
        createdAt: true,
      },
    }),
  ]);

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    className: u.classLevel?.name ?? null,
    isActive: u.isActive,
    subjectIds: u.assignedSubjects.map((a) => a.subject.id),
    subjectNames: u.assignedSubjects.map((a) => a.subject.name),
  }));

  const subjectOptions: SubjectOption[] = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    className: s.classLevel.name,
  }));

  return (
    <UsersClient
      users={rows}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      subjects={subjectOptions}
      schoolName={school?.name ?? "School"}
      isAudit={scope.role === "SUPER_ADMIN"}
      auditSchoolId={scope.schoolId}
      importHistory={importHistory.map((i) => ({
        id: i.id,
        fileName: i.fileName,
        kind: i.kind,
        status: i.status,
        totalCount: i.totalCount,
        successCount: i.successCount,
        failedCount: i.failedCount,
        createdAt: i.createdAt.toISOString(),
      }))}
    />
  );
}