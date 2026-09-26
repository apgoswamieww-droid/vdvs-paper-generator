"use client";

// ============================================================
//  Question details modal — opens from the question-bank rows
//  (View action or clicking the row) and shows everything the
//  list table hides: options/answer, explanation, taxonomy,
//  status, timestamps and media.
// ============================================================

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { getQuestionById } from "./actions";
import type { QuestionDetailDTO } from "./actions";

type McqChoice = { label?: string; text?: string; isCorrect?: boolean };
type MatchPair = { left: string; right: string };

type ParsedOptions = {
  kind: "mcq" | "match" | "none";
  choices: McqChoice[];
  pairs: MatchPair[];
};

function parseOptions(raw: unknown): ParsedOptions {
  if (!raw || typeof raw !== "object") return { kind: "none", choices: [], pairs: [] };
  const obj = raw as { kind?: string; choices?: McqChoice[]; pairs?: MatchPair[] };
  if (obj.kind === "match" && Array.isArray(obj.pairs)) {
    return { kind: "match", choices: [], pairs: obj.pairs as MatchPair[] };
  }
  const choices = Array.isArray(obj.choices)
    ? obj.choices
    : Array.isArray(raw)
      ? (raw as McqChoice[])
      : [];
  if (choices.length > 0) return { kind: "mcq", choices, pairs: [] };
  return { kind: "none", choices: [], pairs: [] };
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function humanize(value?: string | null) {
  return value ? value.replaceAll("_", " ").toLowerCase() : "—";
}

function MetaItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-[Nunito] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="font-[Nunito] text-sm capitalize text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-[Nunito] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function QuestionStatusPill({ status }: { status: QuestionDetailDTO["status"] }) {
  const approved = status === "APPROVED";
  const rejected = status === "REJECTED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        approved
          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
          : rejected
            ? "bg-red-500/10 text-red-400 ring-red-500/30"
            : "bg-amber-500/10 text-amber-400 ring-amber-500/30"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          approved ? "bg-emerald-400" : rejected ? "bg-red-400" : "bg-amber-400"
        )}
      />
      {approved ? "Approved" : rejected ? "Rejected" : "Pending"}
    </span>
  );
}

export function QuestionDetailDialog({
  open,
  onOpenChange,
  questionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string | null;
}) {
  const [detail, setDetail] = useState<QuestionDetailDTO | null>(null);

  useEffect(() => {
    if (!open || !questionId) return;
    let cancelled = false;
    void getQuestionById(questionId).then((d) => {
      if (cancelled) return;
      setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [open, questionId]);

  const parsed = detail ? parseOptions(detail.options) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">#{detail?.code ?? "……"}</span>
            {detail?.createdByAi && (
              <Badge
                variant="outline"
                className="gap-1 border-violet-500/30 text-[11px] text-violet-400"
              >
                <Sparkles className="h-3 w-3" />
                AI generated
              </Badge>
            )}
            {detail && <QuestionStatusPill status={detail.status} />}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `Question details — ${humanize(detail.questionType)} · ${detail.medium} · ${detail.marks} mark${detail.marks === 1 ? "" : "s"}`
              : "Loading question details…"}
          </DialogDescription>
        </DialogHeader>

        {!detail || !parsed ? (
          <div className="space-y-3 py-4">
            {[100, 84, 92, 58].map((w) => (
              <div
                key={w}
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Taxonomy breadcrumb */}
            <p className="font-[Nunito] text-xs font-medium text-muted-foreground">
              <span className="font-mono">#{detail.code}</span>
              {[detail.className, detail.subject?.name, detail.chapter?.name, detail.topicName]
                .filter(Boolean)
                .join(" › ")}
            </p>

            {/* Question text */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
              <KaTeXRenderer text={detail.questionText} />
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MetaItem label="Type" value={humanize(detail.questionType)} />
              <MetaItem label="Medium" value={humanize(detail.medium)} />
              <MetaItem label="Difficulty" value={humanize(detail.difficulty)} />
              <MetaItem label="Bloom" value={humanize(detail.bloomLevel)} />
              <MetaItem label="Marks" value={detail.marks} />
              <MetaItem
                label="Case study"
                value={detail.caseStudyFormat ? humanize(detail.caseStudyFormat) : undefined}
              />
              <MetaItem label="Exam year" value={detail.examYear} />
              <MetaItem label="Previous year" value={detail.previousYearTag} />
              <MetaItem label="Visibility" value={detail.isActive ? "Visible" : "Hidden"} />
              <MetaItem label="Added" value={formatDate(detail.createdAt)} />
              <MetaItem label="Updated" value={formatDate(detail.updatedAt)} />
              <MetaItem label="Tags" value={detail.tags.length > 0 ? detail.tags.join(", ") : undefined} />
            </div>

            {/* Options / answer by type */}
            {parsed.kind === "mcq" ? (
              <section className="space-y-2">
                <SectionHeading>Options</SectionHeading>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {parsed.choices.map((choice, i) => (
                    <div
                      key={choice.label ?? `choice-${i}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        choice.isCorrect
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-border bg-muted/20"
                      )}
                    >
                      <span className="font-mono text-xs font-bold">{choice.label ?? `#${i + 1}`}</span>
                      <span className="flex-1">
                        <KaTeXRenderer text={choice.text ?? ""} />
                      </span>
                      {choice.isCorrect && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                    </div>
                  ))}
                </div>
                {detail.answerKey && (
                  <p className="font-[Nunito] text-xs text-emerald-400">
                    Answer: {detail.answerKey}
                  </p>
                )}
              </section>
            ) : parsed.kind === "match" ? (
              <section className="space-y-2">
                <SectionHeading>Matching pairs</SectionHeading>
                <div className="divide-y divide-border/50 rounded-lg border border-border/50">
                  {parsed.pairs.map((pair, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{pair.left}</span>
                      <span className="font-medium">{pair.right}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.answerKey && parsed.kind === "none" && (
              <section className="space-y-1">
                <SectionHeading>Answer key</SectionHeading>
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                  <KaTeXRenderer text={detail.answerKey} />
                </div>
              </section>
            )}

            {detail.explanation && (
              <section className="space-y-1">
                <SectionHeading>Explanation</SectionHeading>
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                  <KaTeXRenderer text={detail.explanation} />
                </div>
              </section>
            )}

            {detail.imageUrl && (
              <section className="space-y-1">
                <SectionHeading>Image</SectionHeading>
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary URL or data-URL */}
                <img
                  src={detail.imageUrl}
                  alt="Question image"
                  className="max-h-64 rounded-lg border border-border/50 object-contain"
                />
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}