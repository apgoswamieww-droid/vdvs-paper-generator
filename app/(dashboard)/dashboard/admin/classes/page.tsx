import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import { ClassesClient } from "./classes-client";

export const metadata: Metadata = {
  title: "Classes & Sections",
  description: "Manage class levels in your school.",
};

export type ClassLevelRow = {
  id: string;
  name: string;
  students: number;
};

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const scope = await resolveAdminScope(params.schoolId);

  const classes = await prisma.classLevel.findMany({
    where: { schoolId: scope.schoolId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const studentCounts = await prisma.user.groupBy({
    by: ["classLevelId"],
    where: { role: "STUDENT", classLevelId: { in: classes.map((c) => c.id) } },
    _count: { _all: true },
  });

  const counts = new Map(studentCounts.map((r) => [r.classLevelId as string, r._count._all]));
  const rows: ClassLevelRow[] = classes.map((c) => ({
    id: c.id,
    name: c.name,
    students: counts.get(c.id) ?? 0,
  }));

  return <ClassesClient classes={rows} auditSchoolId={scope.role === "SUPER_ADMIN" ? scope.schoolId : null} />;
}