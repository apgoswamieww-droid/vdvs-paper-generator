"use client";

// ============================================================
//  Paper Preview — read-only rendering of the paper as it will
//  print, with an optional action slot per question (used by the
//  builder's preview tab to offer "Replace").
// ============================================================

import type { ReactNode } from "react";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { HeaderRenderer } from "@/components/paper/header-renderer";
import { PaperSheet } from "@/components/paper/paper-sheet";
import type { HeaderConfig, HeaderTokenContext } from "@/lib/paper-header";
import { isCanvasHeader } from "@/lib/paper-header";
import { DEFAULT_PAGE_CONFIG, type PageConfig } from "@/lib/paper-page";
import {
  mcqOptionsLayout,
  parseMatchPairs,
  parseMcqLayout,
  parseMcqOptions,
} from "@/lib/question-options";
import { displaySectionInstructions } from "@/lib/section-instructions";
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
  instructions?: string | null;
  /** Page geometry for the sheet — defaults to A4 portrait. */
  pageConfig?: PageConfig;
  /** Question layout to hint at (1 = single column, 2 = two columns on print). */
  columns?: 1 | 2;
  /** Rendered next to each question (e.g. a Replace button). */
  renderQuestionActions?: (sectionId: string, question: PreviewQuestion) => ReactNode;
  className?: string;
};

export function PaperPreview({
  sections,
  headerConfig,
  headerContext,
  logoUrl,
  instructions,
  pageConfig = DEFAULT_PAGE_CONFIG,
  columns = 1,
  renderQuestionActions,
  className,
}: Props) {
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <div className={className}>
      <PaperSheet config={pageConfig}>
        {headerConfig.rows.length > 0 || isCanvasHeader(headerConfig) ? (
          <HeaderRenderer config={headerConfig} context={headerContext} logoUrl={logoUrl} className="mb-4" />
        ) : null}

        <hr className="my-4 border-slate-300" />

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

        <div
          style={
            columns === 2
              ? { columnCount: 2, columnGap: "2rem", columnRule: "1px solid #1a1a1a", columnFill: "balance" }
              : undefined
          }
        >
          {sections.map((section, sIdx) => {
            if (section.questions.length === 0) return null;
            // Continuous numbering across sections — matches every export.
            const numberOffset = sections
              .slice(0, sIdx)
              .reduce((sum, s) => sum + s.questions.length, 0);
            return (
              <div key={section.id} className="mt-6" style={{ breakInside: "avoid" }}>
                <h3 className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-1 text-base font-bold">
                  {section.title}
                  <span className="text-xs font-normal text-slate-500">
                    ({section.questions.reduce((sum, q) => sum + q.question.marks, 0)} marks)
                  </span>
                </h3>
                {displaySectionInstructions(section.instructions) && (
                  <p className="mb-2 text-xs italic text-slate-500">
                    {displaySectionInstructions(section.instructions)}
                  </p>
                )}

                <div className="space-y-3">
                  {section.questions.map((pq, idx) => {
                    const q = pq.question;
                    const choices = parseMcqOptions(q.options);
                    const pairs = parseMatchPairs(q.options);

                    return (
                      <div key={pq.key} className="group flex items-start gap-2">
                        <span className="shrink-0 text-sm font-semibold">{numberOffset + idx + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">
                            <KaTeXRenderer text={q.questionText} />
                          </div>

                          {q.questionType === "MCQ" && choices.length > 0 && (
                            <div
                              className="mt-1 grid gap-1 text-xs"
                              style={{
                                gridTemplateColumns: `repeat(${mcqOptionsLayout(
                                  choices.map((c) => c.text),
                                  parseMcqLayout(q.options)
                                )}, minmax(0, 1fr))`,
                              }}
                            >
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PaperSheet>
    </div>
  );
}
