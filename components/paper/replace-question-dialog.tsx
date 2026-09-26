"use client";

// ============================================================
//  Replace Question Dialog
//
//  "I don't like this one — give me another." Suggests bank
//  questions matching the same subject/chapter, type and marks,
//  same-difficulty first, and swaps the pick on one click.
//
//  The candidate list is keyed by the current question id so it
//  remounts (with a fresh loading state) on every open.
// ============================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Repeat2 } from "lucide-react";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import {
  findReplacementQuestions,
  type QuestionListDTO,
} from "@/app/(dashboard)/dashboard/questions/actions";
import { questionTypeLabel } from "@/lib/question-options";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question being replaced (only its id + text are needed). */
  current: { id: string; questionText: string } | null;
  /** Ids that must not be suggested (everything already used by the paper). */
  excludeIds: string[];
  onSelect: (replacement: QuestionListDTO) => void;
};

export function ReplaceQuestionDialog({
  open,
  onOpenChange,
  current,
  excludeIds,
  onSelect,
}: Props) {
  // A stable key so the fetched list resets only when the target changes.
  const excludeKey = [...new Set(excludeIds.filter(Boolean))].sort().join("|");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4" />
            Replace question
          </DialogTitle>
          <DialogDescription>
            Same type and marks, same chapter where possible — the section total stays balanced.
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Replacing
            </p>
            <div className="text-sm">
              <KaTeXRenderer text={current.questionText} />
            </div>
          </div>
        )}

        {current && (
          <CandidateList
            key={`${current.id}|${excludeKey}`}
            questionId={current.id}
            excludeKey={excludeKey}
            onSelect={onSelect}
            onKeep={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
//  Candidate list — fetches its own suggestions on mount
// ============================================================

function CandidateList({
  questionId,
  excludeKey,
  onSelect,
  onKeep,
}: {
  questionId: string;
  excludeKey: string;
  onSelect: (replacement: QuestionListDTO) => void;
  onKeep: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<QuestionListDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    const excludes = excludeKey ? excludeKey.split("|") : [];

    void findReplacementQuestions({ questionId, excludeIds: excludes })
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [questionId, excludeKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Finding alternatives…
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No other question in this subject matches the same type and marks. Add more questions to the
        bank, or adjust the section manually.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {candidates.map((q) => (
        <button
          key={q.id}
          type="button"
          onClick={() => onSelect(q)}
          className="w-full rounded-lg border border-border/60 bg-card p-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
        >
          <p className="line-clamp-2 text-sm">
            <KaTeXRenderer text={q.questionText} />
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {questionTypeLabel(q.questionType)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {q.marks} marks
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                q.difficulty === "EASY"
                  ? "border-emerald-500/30 text-emerald-400"
                  : q.difficulty === "HARD"
                    ? "border-red-500/30 text-red-400"
                    : "border-amber-500/30 text-amber-400"
              }`}
            >
              {q.difficulty}
            </Badge>
            {q.chapter && (
              <Badge variant="outline" className="text-[10px]">
                {q.chapter.name}
              </Badge>
            )}
          </div>
        </button>
      ))}
      <Button variant="ghost" size="sm" className="w-full" onClick={onKeep}>
        Keep the current question
      </Button>
    </div>
  );
}
