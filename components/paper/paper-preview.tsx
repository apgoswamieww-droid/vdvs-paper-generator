"use client";

// ============================================================
//  Paper Preview — read-only rendering of the paper as it will
//  print, with an optional action slot per question (used by the
//  builder's preview tab to offer "Replace").
// ============================================================

import type { ReactNode } from "react";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { HeaderRenderer } from "@/components/paper/header-renderer";
import type { HeaderConfig, HeaderTokenContext } from "@/lib/paper-header";
import { parseMatchPairs, parseMcqOptions } from "@/lib/question-options";
import type { QuestionListDTO } from "@/app/(dashboard)/dashboard/questions/actions";

export type PreviewQuestion = {
  /** PaperSectionQuestion id when the paper is already saved, the bank id otherwise. */
  key: string;
  question: QuestionListDTO;
};

export type PreviewSection = {
  id: string;
  title: string;
  instructions?: string | null;
  questions: PreviewQuestion[];
};

type Props = {
  sections: PreviewSection[];
  headerConfig: HeaderConfig;
  headerContext: HeaderTokenContext;
  logoUrl: string | null;
  title?: string;
  meta?: string;
  instructions?: string | null;
  /** Rendered next to each question (e.g. a Replace button). */
  renderQuestionActions?: (sectionId: string, question: PreviewQuestion) => ReactNode;
  className?: string;
};

export function PaperPreview({
  sections,
  headerConfig,
  headerContext,
  logoUrl,
  title,
  meta,
  instructions,
  renderQuestionActions,
  className,
}: Props) {
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <div className={className}>
      <div className="rounded-lg border bg-white p-8 text-black">
        {headerConfig.rows.length > 0 && (
          <HeaderRenderer config={headerConfig} context={headerContext} logoUrl={logoUrl} className="mb-4" />
        )}

        <hr className="my-4 border-slate-300" />

        {title && (
          <div className="text-center">
            <h2 className="text-xl font-bold">{title}</h2>
            {meta && <p className="mt-1 text-sm text-slate-600">{meta}</p>}
          </div>
        )}

        {instructions && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-1 font-semibold">Instructions:</p>
            <p className="whitespace-pre-line">{instructions}</p>
          </div>
        )}

        {totalQuestions === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            No questions yet — pick questions and they will appear here.
          </p>
        )}

        {sections.map((section) =>
          section.questions.length === 0 ? null : (
            <div key={section.id} className="mt-6">
              <h3 className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-1 text-base font-bold">
                {section.title}
                <span className="text-xs font-normal text-slate-500">
                  ({section.questions.reduce((sum, q) => sum + q.question.marks, 0)} marks)
                </span>
              </h3>
              {section.instructions && (
                <p className="mb-2 text-xs italic text-slate-500">{section.instructions}</p>
              )}

              <div className="space-y-3">
                {section.questions.map((pq, idx) => {
                  const q = pq.question;
                  const choices = parseMcqOptions(q.options);
                  const pairs = parseMatchPairs(q.options);

                  return (
                    <div key={pq.key} className="group flex items-start gap-2">
                      <span className="shrink-0 text-sm font-semibold">{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <KaTeXRenderer text={q.questionText} />
                        </div>

                        {q.questionType === "MCQ" && choices.length > 0 && (
                          <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                            {choices.map((opt) => (
                              <div key={opt.label} className="flex gap-1">
                                <span className="font-medium">({opt.label})</span>
                                <KaTeXRenderer text={opt.text} />
                              </div>
                            ))}
                          </div>
                        )}

                        {q.questionType === "MATCH_THE_FOLLOWING" && pairs.length > 0 && (
                          <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                            {pairs.map((p, pi) => (
                              <p key={pi}>
                                {pi + 1}) {p.left} — {p.right}
                              </p>
                            ))}
                          </div>
                        )}

                        {q.questionType === "NUMERIC" && (
                          <p className="mt-1 text-xs text-slate-500">Answer: ____________________</p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {renderQuestionActions?.(section.id, pq)}
                        <span className="text-xs text-slate-400">[{q.marks}m]</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
