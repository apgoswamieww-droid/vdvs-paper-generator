"use client";

// ============================================================
//  Add-Question page body — the form plus the "recently added"
//  list. The list re-fetches after a successful "Save & New".
// ============================================================

import { useState } from "react";
import { QuestionForm } from "./question-form";
import { RecentQuestions } from "./recent-questions";
import type { TaxonomyNode } from "./actions";

export function NewQuestionPageClient({ tree }: { tree: TaxonomyNode[] }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <QuestionForm tree={tree} editing={null} onSaved={() => setRefreshKey((k) => k + 1)} />
      <RecentQuestions refreshKey={refreshKey} />
    </div>
  );
}