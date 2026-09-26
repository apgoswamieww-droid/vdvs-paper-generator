"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  Save,
  Wand2,
  Edit3,
  RefreshCw,
} from "lucide-react";
import { saveGeneratedQuestions } from "./actions";
import { cn } from "@/lib/utils";
import type { TaxonomyNode } from "./page";

// ------------------------------------------------------------
//  Shared types
// ------------------------------------------------------------

type GeneratedQuestion = {
  questionText: string;
  options: { kind: "mcq"; choices: { label: string; text: string; isCorrect: boolean }[] } | null;
  answerKey: string;
  explanation: string;
  tags: string[];
  difficulty: "EASY" | "MEDIUM" | "HARD";
  bloom: string;
};

type GenerationContext = {
  classLevelId: string;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
  medium: "ENGLISH" | "GUJARATI";
  questionType: string;
  previousYear: boolean;
  examYear: string | null;
  sourceContext: string;
  school: { id: string; name: string; board: string; academicYear: string | null };
};

type ReviewCard = {
  q: GeneratedQuestion;
  assignedTeacherId: string | null;
};

type Difficulty = GeneratedQuestion["difficulty"];

const MEDIUM_OPTIONS = [
  { value: "ENGLISH", label: "English" },
  { value: "GUJARATI", label: "Gujarati" },
] as const;

const TYPE_OPTIONS = [
  { value: "MCQ", label: "Multiple Choice" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
  { value: "LONG_ANSWER", label: "Long Answer" },
  { value: "TRUE_FALSE", label: "True / False" },
] as const;

const QUANTITY_OPTIONS = [5, 10, 15, 20] as const;

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

const BLOOM_BY_DIFFICULTY: Record<Difficulty, string> = {
  EASY: "UNDERSTAND",
  MEDIUM: "APPLY",
  HARD: "ANALYZE",
};

const BLOOMS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;

// ------------------------------------------------------------
//  Component
// ------------------------------------------------------------

export function AiGeneratorClient({
  taxonomy,
  teachers,
  school,
  isAudit,
  auditSchoolId,
}: {
  taxonomy: TaxonomyNode[];
  teachers: { id: string; name: string }[];
  school: { name: string; board: string; academicYear: string | null };
  isAudit: boolean;
  auditSchoolId: string | null;
}) {
  // ── Generation form state ──
  const [classLevelId, setClassLevelId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [medium, setMedium] = useState<"ENGLISH" | "GUJARATI">("ENGLISH");
  const [questionType, setQuestionType] = useState("MCQ");
  const [quantity, setQuantity] = useState<number>(5);
  const [previousYear, setPreviousYear] = useState(false);
  const [examYear, setExamYear] = useState("");

  // ── Generation result state ──
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [context, setContext] = useState<GenerationContext | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

  const classLevel = useMemo(() => taxonomy.find((c) => c.id === classLevelId) ?? null, [taxonomy, classLevelId]);
  const subject = useMemo(() => classLevel?.subjects.find((s) => s.id === subjectId) ?? null, [classLevel, subjectId]);
  const chapter = useMemo(() => subject?.chapters.find((c) => c.id === chapterId) ?? null, [subject, chapterId]);

  function selectClassLevel(v: string) {
    setClassLevelId(v);
    setSubjectId("");
    setChapterId("");
    setTopicId("");
  }
  function selectSubject(v: string) {
    setSubjectId(v);
    setChapterId("");
    setTopicId("");
  }
  function selectChapter(v: string) {
    setChapterId(v);
    setTopicId("");
  }

  async function generate() {
    if (!classLevelId || !subjectId || !chapterId) {
      toast.error("Select a standard, subject and chapter first.");
      return;
    }
    if (previousYear && !examYear.trim()) {
      toast.error("Enter the exam year for the previous-year pattern.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: auditSchoolId ?? undefined,
          classLevelId,
          subjectId,
          chapterId,
          topicId: topicId || null,
          medium,
          questionType,
          quantity,
          previousYear,
          examYear: previousYear ? examYear.trim() : null,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; context: GenerationContext; questions: GeneratedQuestion[] }
        | { ok: false; error: string };
      if (!res.ok || !data.ok) {
        toast.error("error" in data ? data.error : "Could not generate questions.");
        return;
      }
      setContext(data.context);
      const prepared: ReviewCard[] = data.questions.map((q) => ({
        q: { ...q, bloom: BLOOMS.includes(q.bloom as (typeof BLOOMS)[number]) ? q.bloom : "REMEMBER" },
        assignedTeacherId: null,
      }));
      setCards(prepared);
      setExpanded(null);
      toast.success(`Generated ${prepared.length} questions. Review them below.`);
    } catch {
      toast.error("Could not reach the AI generator. Is OmniRoute running?");
    } finally {
      setGenerating(false);
    }
  }

  function updateCard(index: number, patch: Partial<GeneratedQuestion>) {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, q: { ...c.q, ...patch } } : c)));
  }

  function setDifficulty(index: number, difficulty: Difficulty) {
    updateCard(index, { difficulty, bloom: BLOOM_BY_DIFFICULTY[difficulty] });
  }

  function updateChoice(index: number, choiceIndex: number, patch: Partial<{ label: string; text: string; isCorrect: boolean }>) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== index || !c.q.options) return c;
        return {
          ...c,
          q: {
            ...c.q,
            options: {
              kind: "mcq",
              choices: c.q.options.choices.map((ch, ci) => (ci === choiceIndex ? { ...ch, ...patch } : ch)),
            },
          },
        };
      })
    );
  }

  function markCorrectOnly(index: number, choiceIndex: number) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== index || !c.q.options) return c;
        return {
          ...c,
          q: {
            ...c.q,
            options: {
              kind: "mcq",
              choices: c.q.options.choices.map((ch, ci) => ({ ...ch, isCorrect: ci === choiceIndex })),
            },
          },
        };
      })
    );
  }

  function removeCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index));
    if (expanded !== null && expanded !== index) setExpanded(null);
  }

  function clearAll() {
    setCards([]);
    setContext(null);
  }

  /**
   * Asks the AI for one fresh question with the same context and swaps it in —
   * this is the "I don't like this one, give me another" action during review.
   */
  async function replaceCard(index: number) {
    if (!context) return;
    setReplacingIndex(index);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: auditSchoolId ?? undefined,
          classLevelId: context.classLevelId,
          subjectId: context.subjectId,
          chapterId: context.chapterId,
          topicId: context.topicId,
          medium: context.medium,
          questionType: context.questionType,
          quantity: 1,
          previousYear: context.previousYear,
          examYear: context.examYear,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; questions: GeneratedQuestion[] }
        | { ok: false; error: string };

      if (!res.ok || !data.ok) {
        toast.error("error" in data ? data.error : "Could not generate a replacement.");
        return;
      }

      const fresh = data.questions[0];
      if (!fresh) {
        toast.error("The AI returned nothing. Please try again.");
        return;
      }

      setCards((prev) =>
        prev.map((c, i) =>
          i === index
            ? {
                q: {
                  ...fresh,
                  bloom: BLOOMS.includes(fresh.bloom as (typeof BLOOMS)[number])
                    ? fresh.bloom
                    : c.q.bloom,
                },
                assignedTeacherId: c.assignedTeacherId,
              }
            : c
        )
      );
      toast.success("Question replaced.");
    } catch {
      toast.error("Could not reach the AI generator. Is OmniRoute running?");
    } finally {
      setReplacingIndex(null);
    }
  }

  async function save() {
    if (!context || cards.length === 0) return;
    const missingMcq = cards.some(
      (c) =>
        context.questionType === "MCQ" &&
        (!c.q.options || c.q.options.choices.filter((o) => o.isCorrect).length === 0)
    );
    if (missingMcq) {
      toast.error("Every MCQ must have a correct option marked.");
      return;
    }
    setSaving(true);
    const result = await saveGeneratedQuestions({
      schoolId: auditSchoolId ?? undefined,
      autoApprove,
      context: {
        classLevelId: context.classLevelId,
        subjectId: context.subjectId,
        chapterId: context.chapterId,
        topicId: context.topicId ?? null,
        medium: context.medium,
        questionType: context.questionType,
        previousYear: context.previousYear,
        examYear: context.examYear?.trim() || null,
      },
      questions: cards.map((c) => ({
        questionText: c.q.questionText,
        options: c.q.options
          ? c.q.options.choices.map((o) => ({ label: o.label, text: o.text, isCorrect: o.isCorrect }))
          : undefined,
        answerKey: c.q.answerKey || undefined,
        explanation: c.q.explanation || undefined,
        tags: c.q.tags,
        difficulty: c.q.difficulty,
        bloom: c.q.bloom,
        assignedTeacherId: c.assignedTeacherId || null,
      })),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not save to the question bank.");
      return;
    }
    toast.success(`Saved ${result.created} question${result.created === 1 ? "" : "s"} as ${result.status}.`);
    if (result.skipped && result.skipped.length > 0) {
      toast.warning(`${result.skipped.length} question(s) were skipped during saving.`);
    }
    clearAll();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[Rasa] text-3xl font-bold tracking-tight">AI Question Generator</h1>
        <p className="font-[Nunito] mt-1 text-sm text-muted-foreground">
          Generate exam questions with local AI, review and route them to teachers for approval.
        </p>
      </div>

      {isAudit && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Audit mode — generating questions for <strong className="font-semibold">{school.name}</strong> as a super admin.
        </div>
      )}

      {/* ── Generation form ── */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-[Rasa] text-lg font-semibold">Generate</CardTitle>
          <CardDescription className="font-[Nunito] text-xs">
            Pick curriculum context and let the AI draft questions for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Standard *</Label>
              <Select value={classLevelId} onValueChange={(v) => { if (v) selectClassLevel(v); }}>
                <SelectTrigger className="w-full bg-muted/40">
                  <SelectValue placeholder="Select standard" />
                </SelectTrigger>
                <SelectContent>
                  {taxonomy.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Subject *</Label>
              <Select value={subjectId} onValueChange={(v) => { if (v) selectSubject(v); }} disabled={!classLevel}>
                <SelectTrigger className="w-full bg-muted/40">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {(classLevel?.subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Chapter *</Label>
              <Select value={chapterId} onValueChange={(v) => { if (v) selectChapter(v); }} disabled={!subject}>
                <SelectTrigger className="w-full bg-muted/40">
                  <SelectValue placeholder="Select chapter" />
                </SelectTrigger>
                <SelectContent>
                  {(subject?.chapters ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Topic (optional)</Label>
              <Select value={topicId} onValueChange={(v) => setTopicId(v ?? "")} disabled={!chapter}>
                <SelectTrigger className="w-full bg-muted/40">
                  <SelectValue placeholder="Whole chapter" />
                </SelectTrigger>
                <SelectContent>
                  {(chapter?.topics ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Language</Label>
              <div className="grid grid-cols-2 gap-2">
                {MEDIUM_OPTIONS.map((m) => {
                  const active = medium === m.value;
                  return (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => setMedium(m.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        active
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Question Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((t) => {
                  const active = questionType === t.value;
                  return (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setQuestionType(t.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        active
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <div className="grid grid-cols-4 gap-2">
                {QUANTITY_OPTIONS.map((q) => {
                  const active = quantity === q;
                  return (
                    <button
                      type="button"
                      key={q}
                      onClick={() => setQuantity(q)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-bold transition-colors",
                        active
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Previous-year pattern</Label>
              <div className="flex h-10 items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Match {school.board} board pattern</p>
                  <p className="text-[11px] text-muted-foreground">Available only with the school board in context</p>
                </div>
                <Switch
                  checked={previousYear}
                  onCheckedChange={(v) => {
                    setPreviousYear(v);
                    if (!v) setExamYear("");
                  }}
                />
              </div>
              {previousYear && (
                <Input
                  value={examYear}
                  onChange={(e) => setExamYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  placeholder="e.g. 2024"
                  inputMode="numeric"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
            <Button type="button" onClick={generate} disabled={generating} className="gap-2 font-[Nunito]">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating… may take a minute" : `Generate ${quantity} questions`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Review & save ── */}
      {context && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="h-4 w-4" />
              <span>
                {context.sourceContext} — {cards.length} draft{cards.length === 1 ? "" : "s"}
                {previousYear && context.examYear ? ` · Year ${context.examYear}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
              <span className="text-xs text-muted-foreground">
                {autoApprove ? "Auto-approve — skip teacher review" : "Save as PENDING — teachers approve"}
              </span>
            </div>
          </div>

          {cards.map((card, index) => {
            const isMcq = context.questionType === "MCQ";
            const isOpen = expanded === index;
            return (
              <Card key={index} className="border-border/50">
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted/40 font-[Nunito] text-[11px] font-bold">
                        {index + 1}
                      </span>
                      <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-medium">{card.q.difficulty}</span>
                      <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-medium">{card.q.bloom}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 font-[Nunito] text-xs"
                        onClick={() => setExpanded(isOpen ? null : index)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        {isOpen ? "Close editor" : "Review / edit"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 font-[Nunito] text-xs"
                        disabled={replacingIndex === index}
                        title="Ask the AI for a different question with the same settings"
                        onClick={() => void replaceCard(index)}
                      >
                        {replacingIndex === index ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Replace
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={() => removeCard(index)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="font-[Nunito] text-sm leading-relaxed">{card.q.questionText}</p>

                  {!isMcq && card.q.answerKey && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-semibold">Model answer: </span>
                      {card.q.answerKey}
                    </div>
                  )}

                  {isMcq && card.q.options && (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {card.q.options.choices.map((choice) => (
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

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Assign to</span>
                      <Select
                        value={card.assignedTeacherId ?? "unassigned"}
                        onValueChange={(v) =>
                          setCards((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, assignedTeacherId: v === "unassigned" ? null : v } : c))
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[220px] bg-muted/40 text-xs">
                          <SelectValue placeholder="Review queue (unassigned)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Review queue (unassigned)</SelectItem>
                          {teachers.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {card.q.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {card.q.tags.map((tag, ti) => (
                          <span key={ti} className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                      <div className="space-y-1.5">
                        <Label>Question text</Label>
                        <Textarea
                          rows={3}
                          value={card.q.questionText}
                          onChange={(e) => updateCard(index, { questionText: e.target.value })}
                          className="bg-slate-950"
                        />
                      </div>

                      {isMcq && card.q.options && (
                        <div className="space-y-2">
                          <Label>Options</Label>
                          {card.q.options.choices.map((choice, ci) => (
                            <div key={ci} className="flex items-center gap-2">
                              <span className="w-5 text-center text-xs font-bold text-muted-foreground">{choice.label}</span>
                              <Input
                                value={choice.text}
                                onChange={(e) => updateChoice(index, ci, { text: e.target.value })}
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
                                title={choice.isCorrect ? "Marked correct" : "Mark as correct"}
                                onClick={() => markCorrectOnly(index, ci)}
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
                          <Select value={card.q.difficulty} onValueChange={(v) => setDifficulty(index, v as Difficulty)}>
                            <SelectTrigger className="w-full bg-slate-950">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DIFFICULTIES.map((d) => (
                                <SelectItem key={d.value} value={d.value}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Bloom level</Label>
                          <Select value={card.q.bloom} onValueChange={(v) => { if (v) updateCard(index, { bloom: v }); }}>
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
                          <p className="text-[10px] text-muted-foreground">Auto-suggested from difficulty — override freely.</p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>{isMcq ? "Answer key" : "Model answer"}</Label>
                        <Textarea
                          rows={2}
                          value={card.q.answerKey}
                          onChange={(e) => updateCard(index, { answerKey: e.target.value })}
                          className="bg-slate-950"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Solution / explanation</Label>
                        <Textarea
                          rows={3}
                          value={card.q.explanation}
                          onChange={(e) => updateCard(index, { explanation: e.target.value })}
                          className="bg-slate-950"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Tags (comma separated)</Label>
                        <Input
                          value={card.q.tags.join(", ")}
                          onChange={(e) =>
                            updateCard(index, {
                              tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
                            })
                          }
                          className="bg-slate-950"
                          placeholder="algebra, linear equations, …"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-4 rounded-xl border border-border bg-background/95 p-4 backdrop-blur">
            <div className="text-xs text-muted-foreground">
              Saving <strong className="text-foreground">{cards.length}</strong> question{cards.length === 1 ? "" : "s"}
              {autoApprove ? " · status APPROVED" : " · status PENDING"}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="gap-1.5 font-[Nunito] text-xs" onClick={clearAll}>
                <X className="h-3.5 w-3.5" />
                Discard
              </Button>
              <Button type="button" onClick={save} disabled={saving} className="gap-1.5 font-[Nunito]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save to question bank"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!context && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Plus className="h-6 w-6 text-secondary" />
          </div>
          <p className="font-[Rasa] mt-3 text-base font-semibold">No questions yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Fill the form above and hit Generate. Drafts appear here for review before they enter the question bank as
            {autoApprove ? "" : " PENDING"}.
          </p>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" />
            Require local OmniRoute gateway at <code className="rounded bg-muted px-1 py-0.5">http://localhost:20128</code>
          </div>
        </div>
      )}
    </div>
  );
}