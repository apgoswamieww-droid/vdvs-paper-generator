// ============================================================
//  Question Bank page — server shell
//  Loads initial questions + taxonomy tree, then hands off to
//  the client table for filtering/pagination.
// ============================================================

import { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree, listQuestions } from "./actions";
import { QuestionsClient } from "./questions-client";

export const metadata: Metadata = {
  title: "Question Bank",
  description: "Browse, search and manage your school's question bank.",
};

export default async function QuestionsPage() {
  await requireSession(); // tenant guard (dev stub)

  const [initialData, tree] = await Promise.all([listQuestions({ page: 1, pageSize: 20 }), getTaxonomyTree()]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Bank</h1>
          <p className="mt-1 text-sm text-slate-400">
            {initialData.meta.total} questions · Gujarati Unicode &amp; KaTeX supported
          </p>
        </div>
      </div>
      <QuestionsClient initialData={initialData} tree={tree} />
    </div>
  );
}
