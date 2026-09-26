"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UserCheck,
  Inbox,
  Edit3,
} from "lucide-react";
import { reviewQuestion } from "./actions";
import { cn } from "@/lib/utils";
import type { ReviewQuestionRow } from "./page";

type McqOptions = { kind: "mcq"; choices: { label: string; text: string; isCorrect: boolean }[] };

const BLOOMS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

type EditingState = {
  questionText: string;
  answerKey: string;
  explanation: string;
  tags: string[];
  difficulty: (typeof DIFFICULTIES)[number];
  bloom: string;
  choices: { label: string; text: string; isCorrect: boolean }[];
};

function initEditing(row: ReviewQuestionRow): EditingState {
  const parsed = (row.options ?? null) as McqOptions | null;
  return {
    questionText: row.questionText,
    answerKey: row.answerKey ?? "",
    explanation: row.explanation ?? "",
    tags: row.tags,
    difficulty: (DIFFICULTIES as readonly string[]).includes(row.difficulty) ? (row.difficulty as EditingState["difficulty"]) : "MEDIUM",
    bloom: BLOOMS.includes(row.bloomLevel as (typeof BLOOMS)[number]) ? (row.bloomLevel as string) : "REMEMBER",
    choices: parsed && parsed.kind === "mcq" ? parsed.choices : [],
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewQueueClient({
  pending,
  approved,
  teacherName,
  isTeacher,
}: {
  pending: ReviewQuestionRow[];
  approved: ReviewQuestionRow[];
  teacherName: string;
  isTeacher: boolean;
}) {
  const [queue, setQueue] = useState<ReviewQuestionRow[]>(pending);
  const [done, setDone] = useState<ReviewQuestionRow[]>(approved);
  const [working, setWorking] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditingState>>({});

  function beginEdit(row: ReviewQuestionRow) {
    setDrafts((d) => ({ ...d, [row.id]: d[row.id] ?? initEditing(row) }));
    setEditingId(row.id);
  }

  function draft(id: string): EditingState | undefined {
    return drafts[id];
  }

  function patchDraft(row: ReviewQuestionRow, patch: Partial<EditingState>) {
    setDrafts((d) => {
      const base = d[row.id] ?? initEditing(row);
      return { ...d, [row.id]: { ...base, ...patch } };
    });
  }

  async function decide(row: ReviewQuestionRow, action: "approve" | "reject") {
    setWorking(row.id);
    const draftState = draft(row.id);
    const isMcq = row.questionType === "MCQ";
    const hasMarkedCorrect = draftState ? draftState.choices.some((c) => c.isCorrect) : undefined;

    if (action === "approve" && isMcq && draftState && !hasMarkedCorrect) {
      toast.error("Mark at least one correct option before approving.");
      setWorking(null);
      return;
    }

    const edits = draftState
      ? {
          questionText: draftState.questionText,
          answerKey: draftState.answerKey || undefined,
          explanation: draftState.explanation || undefined,
          tags: draftState.tags,
          difficulty: draftState.difficulty,
          bloom: draftState.bloom,
          ...(isMcq ? { options: draftState.choices } : {}),
        }
      : undefined;

    const result = await reviewQuestion({ id: row.id, action, edits });
    setWorking(null);
    if (!result.success) {
      toast.error(result.error ?? "Could not update the question.");
      return;
    }
    setQueue((q) => q.filter((x) => x.id !== row.id));
    setDrafts((d) => {
      const next = { ...d };
      delete next[row.id];
      return next;
    });
    setEditingId((e) => (e === row.id ? null : e));
    if (action === "approve") {
      setDone((prev) => [row, ...prev]);
      toast.success("Question approved and added to the bank.");
    } else {
      toast.success("Question marked as rejected.");
    }
  }

  const rowMeta = (row: ReviewQuestionRow) =>
    [row.className, row.subjectName, row.chapterName, row.topicName].filter(Boolean).join(" · ");

  const PendingCard = ({ row }: { row: ReviewQuestionRow }) => {
    const isOpen = editingId === row.id;
    const d = draft(row.id);
    const isMcq = row.questionType === "MCQ";
    return (
      <Card className="border-border/50">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">#{row.code}</span> · {rowMeta(row)}
            </div>
            <div className="flex items-center gap-1">
              {row.assignedTeacherName && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                  <UserCheck className="h-3 w-3" />
                  Assigned to {row.assignedTeacherName}
                </span>
              )}
              <span className={cn("rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300")}>
                PENDING
              </span>
            </div>
          </div>

          <p className="font-[Nunito] text-sm leading-relaxed">
            {isOpen && d ? d.questionText : row.questionText}
          </p>

          {!isOpen && !isMcq && row.answerKey && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <span className="font-semibold">Model answer: </span>
              {row.answerKey}
            </div>
          )}

          {!isOpen && isMcq && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {(d ? d.choices : ((row.options ?? null) as McqOptions | null)?.choices ?? []).map((choice) => (
                <div
                  key={choice.label}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                    choice.isCorrect ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/20"
                  )}
                >
                  <span className="font-bold">{choice.label}</span>
                  <span className="flex-1">{choice.text}</span>
                  {choice.isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
              ))}
            </div>
          )}

          {!isOpen && row.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {row.tags.map((t, i) => (
                <span key={i} className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}

          {isOpen && d && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label>Question text</Label>
                <Textarea
                  rows={3}
                  value={d.questionText}
                  onChange={(e) => patchDraft(row, { questionText: e.target.value })}
                  className="bg-slate-950"
                />
              </div>

              {isMcq && (
                <div className="space-y-2">
                  <Label>Options — click to mark correct</Label>
                  {d.choices.map((choice, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-bold text-muted-foreground">{choice.label}</span>
                      <Input
                        value={choice.text}
                        onChange={(e) =>
                          patchDraft(row, {
                            choices: d.choices.map((c, i) => (i === ci ? { ...c, text: e.target.value } : c)),
                          })
                        }
                        className="flex-1 bg-slate-950"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(
                          "h-8 w-8",
                          choice.isCorrect ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "text-muted-foreground"
                        )}
                        onClick={() =>
                          patchDraft(row, {
                            choices: d.choices.map((c, i) => ({ ...c, isCorrect: i === ci })),
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select value={d.difficulty} onValueChange={(v) => patchDraft(row, { difficulty: v as EditingState["difficulty"] })}>
                    <SelectTrigger className="w-full bg-slate-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((df) => (
                        <SelectItem key={df} value={df}>
                          {df[0] + df.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bloom level</Label>
                  <Select value={d.bloom} onValueChange={(v) => { if (v) patchDraft(row, { bloom: v }); }}>
                    <SelectTrigger className="w-full bg-slate-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOMS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isMcq ? "Answer key" : "Model answer"}</Label>
                <Textarea
                  rows={2}
                  value={d.answerKey}
                  onChange={(e) => patchDraft(row, { answerKey: e.target.value })}
                  className="bg-slate-950"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Solution / explanation</Label>
                <Textarea
                  rows={3}
                  value={d.explanation}
                  onChange={(e) => patchDraft(row, { explanation: e.target.value })}
                  className="bg-slate-950"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={d.tags.join(", ")}
                  onChange={(e) =>
                    patchDraft(row, {
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
                    })
                  }
                  className="bg-slate-950"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
            <div className="text-[11px] text-muted-foreground">
              Generated {formatDate(row.createdAt)} · {row.difficulty} · Bloom {row.bloomLevel ?? "REMEMBER"}
            </div>
            <div className="flex items-center gap-2">
              {!isOpen && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 font-[Nunito] text-xs" onClick={() => beginEdit(row)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit before approving
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 font-[Nunito] text-xs text-red-400"
                onClick={() => void decide(row, "reject")}
                disabled={working === row.id}
              >
                {working === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-secondary font-[Nunito] text-xs font-semibold text-primary hover:bg-secondary/90"
                onClick={() => void decide(row, "approve")}
                disabled={working === row.id}
              >
                {working === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                Approve
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">Review Questions</h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          {isTeacher
            ? `Hi ${teacherName} — approve or reject AI-generated questions before they enter the bank.`
            : "Review AI-generated questions in your school."}
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="pending">
            Pending
            {queue.length > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">{queue.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved
            {done.length > 0 && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{done.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Inbox className="h-6 w-6 text-secondary" />
              </div>
              <p className="font-[Rasa] mt-3 text-base font-semibold">Queue is clear</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                New AI-generated questions assigned to you (or unassigned in your school) will appear here for approval.
              </p>
            </div>
          ) : (
            queue.map((row) => <PendingCard key={row.id} row={row} />)
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {done.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <ShieldCheck className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="font-[Rasa] mt-3 text-base font-semibold">Nothing approved yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Questions you approve will be listed here.</p>
            </div>
          ) : (
            done.map((row) => (
              <Card key={row.id} className="border-border/50">
                <CardContent className="space-y-2 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">#{row.code}</span> · {rowMeta(row)}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      APPROVED
                    </span>
                  </div>
                  <p className="font-[Nunito] text-sm leading-relaxed">{row.questionText}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.difficulty} · Bloom {row.bloomLevel ?? "REMEMBER"} · Approved {formatDate(row.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}