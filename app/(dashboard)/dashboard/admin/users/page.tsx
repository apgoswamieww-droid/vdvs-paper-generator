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
};

const STAFF_ROLES: UserRole[] = ["TEACHER", "STUDENT"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const scope = await resolveAdminScope(params.schoolId);

  const [users, classes, school] = await Promise.all([
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
      },
    }),
    prisma.classLevel.findMany({
      where: { schoolId: scope.schoolId },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.school.findUnique({ where: { id: scope.schoolId }, select: { name: true } }),
  ]);

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    className: u.classLevel?.name ?? null,
    isActive: u.isActive,
  }));

  return (
    <UsersClient
      users={rows}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      schoolName={school?.name ?? "School"}
      isAudit={scope.role === "SUPER_ADMIN"}
      auditSchoolId={scope.schoolId}
    />
  );
}