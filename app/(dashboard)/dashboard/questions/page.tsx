// ============================================================
//  Question Bank page — server shell
// ============================================================

import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree } from "./actions";
import { parseListState } from "./list-state";
import { QuestionsClient } from "./questions-client";

export const metadata: Metadata = {
  title: "Question Bank",
  description: "Browse, search and manage your school's question bank.",
};

interface QuestionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const session = await requireSession();

  // Returning from an edit carries the table state in the URL — restoring it
  // here (server-side) keeps the first client render identical to the SSR
  // markup, so the listing resumes on the same page it was left on.
  const initialListState = parseListState(await searchParams);

  // Questions are loaded on demand only (search, filter or "All") — the
  // page itself never prefetches the bank.
  const [tree, teachers] = await Promise.all([
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
            Search by text, tag, year or question ID like #506892 · Gujarati Unicode & KaTeX supported
          </p>
        </div>
      </div>
      <QuestionsClient
        tree={tree}
        isAdmin={session.role !== "TEACHER"}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name ?? t.id }))}
        initialState={initialListState}
      />
    </div>
  );
}
