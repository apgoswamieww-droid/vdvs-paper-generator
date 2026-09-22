// ============================================================
//  Question Bank page — server shell
// ============================================================

import { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { getTaxonomyTree, listQuestions } from "./actions";
import { QuestionsClient } from "./questions-client";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";

export const metadata: Metadata = {
  title: "Question Bank",
  description: "Browse, search and manage your school's question bank.",
};

export default async function QuestionsPage() {
  await requireSession();

  const [initialData, tree] = await Promise.all([
    listQuestions({ page: 1, pageSize: 20 }),
    getTaxonomyTree(),
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
      <QuestionsClient initialData={initialData} tree={tree} />
    </div>
  );
}
