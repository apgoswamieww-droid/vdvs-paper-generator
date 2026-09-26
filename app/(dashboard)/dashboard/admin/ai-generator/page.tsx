import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { resolveAdminScope } from "../scope";
import { AiGeneratorClient } from "./ai-generator-client";

export const metadata: Metadata = {
  title: "AI Question Generator",
  description: "Generate exam questions with AI and route them to teachers for approval.",
};

export type TaxonomyNode = {
  id: string;
  name: string;
  subjects: {
    id: string;
    name: string;
    chapters: { id: string; name: string; topics: { id: string; name: string }[] }[];
  }[];
};

export default async function AiGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const scope = await resolveAdminScope(params.schoolId);

  const [classLevels, teachers, school] = await Promise.all([
    prisma.classLevel.findMany({
      where: { schoolId: scope.schoolId },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subjects: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            chapters: {
              orderBy: [{ order: "asc" }, { name: "asc" }],
              select: {
                id: true,
                name: true,
                topics: { orderBy: { name: "asc" }, select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { schoolId: scope.schoolId, role: "TEACHER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.school.findUnique({
      where: { id: scope.schoolId },
      select: { name: true, board: true, academicYear: true },
    }),
  ]);

  const taxonomy: TaxonomyNode[] = classLevels.map((c) => ({
    id: c.id,
    name: c.name,
    subjects: c.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      chapters: s.chapters.map((ch) => ({
        id: ch.id,
        name: ch.name,
        topics: ch.topics.map((t) => ({ id: t.id, name: t.name })),
      })),
    })),
  }));

  return (
    <AiGeneratorClient
      taxonomy={taxonomy}
      teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? "Unnamed Teacher" }))}
      school={{
        name: school?.name ?? "School",
        board: school?.board ?? "GSEB",
        academicYear: school?.academicYear ?? null,
      }}
      isAudit={scope.role === "SUPER_ADMIN"}
      auditSchoolId={scope.role === "SUPER_ADMIN" ? scope.schoolId : null}
    />
  );
}