"use client";

// ============================================================
//  Recently added questions — the latest 5, shown under the
//  Add-Question form. Refreshes in place after a "Save & New".
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { listRecentQuestions, type RecentQuestionDTO } from "./actions";
import { KaTeXRenderer } from "@/components/shared/katex-text";

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short",
  LONG_ANSWER: "Long",
  TRUE_FALSE: "True/False",
  FILL_IN_THE_BLANK: "Fill in",
  MATCH_THE_FOLLOWING: "Match",
  CASE_STUDY: "Case Study",
  NUMERIC: "Numeric",
};

export function RecentQuestions({
  refreshKey,
  limit = 5,
}: {
  refreshKey?: number;
  limit?: number;
}) {
  const [rows, setRows] = useState<RecentQuestionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listRecentQuestions(limit)
      .then((items) => {
        if (!cancelled) setRows(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, limit]);

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-[Rasa] text-base font-bold tracking-tight">
          Recently added questions
        </h3>
        <Link
          href="/dashboard/questions"
          className="text-xs text-secondary hover:underline"
        >
          View all →
        </Link>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No questions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {rows.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-slate-200">
                  <KaTeXRenderer text={q.questionText} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  <span className="font-mono tabular-nums">#{q.code}</span>
                  {" · "}
                  {q.chapterName ?? "—"} · {new Date(q.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {TYPE_LABELS[q.questionType] ?? q.questionType}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {q.medium === "ENGLISH" ? "En" : "Gu"}
                  </span>
                  <span className="text-[10px] text-slate-600">{q.marks} mark</span>
                </div>
                <Link
                  href={`/dashboard/questions/${q.id}`}
                  className="mt-1 inline-block text-[11px] text-secondary hover:underline"
                >
                  Edit →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}