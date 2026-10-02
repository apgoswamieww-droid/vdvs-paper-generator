// ============================================================
//  Question Bank page — server shell
// ============================================================

import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree, listQuestions } from "./actions";
import { QuestionsClient } from "./questions-client";

export const metadata: Metadata = {
  title: "Question Bank",
  description: "Browse, search and manage your school's question bank.",
};

export default async function QuestionsPage() {
  const session = await requireSession();

  const [initialData, tree, teachers] = await Promise.all([
    listQuestions({ page: 1, pageSize: 20 }),
    getTaxonomyTree(),
    session.role === "TEACHER"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { schoolId: session.schoolId, role: "TEACHER", isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">Question Bank</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {initialData.meta.total} questions · Gujarati Unicode & KaTeX supported
          </p>
        </div>
      </div>
      <QuestionsClient
        initialData={initialData}
        tree={tree}
        isAdmin={session.role !== "TEACHER"}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? t.id }))}
      />
    </div>
  );
}
