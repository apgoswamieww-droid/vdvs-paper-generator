"use client";

// ============================================================
//  Question Form Dialog — create/edit with live KaTeX preview
//
//  - react-hook-form + zodResolver (questionFormSchema)
//  - Cascading Class → Subject → Chapter → Topic selects
//  - Type-conditional fields: MCQ options, match pairs,
//    case-study format
//  - Live preview renders Gujarati Unicode + $...$ KaTeX
// ============================================================

import { useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createQuestion,
  updateQuestion,
  type TaxonomyNode,
  type QuestionDetailDTO,
} from "./actions";
import {
  questionFormSchema,
  QUESTION_TYPES,
  DIFFICULTIES,
  BLOOM_LEVELS,
  CASE_STUDY_FORMATS,
  type QuestionFormInput,
} from "@/lib/validations";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short Answer",
  LONG_ANSWER: "Long Answer",
  TRUE_FALSE: "True / False",
  FILL_IN_THE_BLANK: "Fill in the Blank",
  MATCH_THE_FOLLOWING: "Match the Following",
  CASE_STUDY: "Case Study",
};

type MCQOption = { label: string; text: string; isCorrect: boolean };
type MatchPair = { left: string; right: string };

export function QuestionFormDialog({
  open,
  onOpenChange,
  editing,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: QuestionDetailDTO | null;
  tree: TaxonomyNode[];
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {open && (
          <QuestionFormInner
            editing={editing}
            tree={tree}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionFormInner({
  editing,
  tree,
  onSaved,
  onCancel,
}: {
  editing: QuestionDetailDTO | null;
  tree: TaxonomyNode[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  // Editing: infer the class from the tree so the cascade is pre-filled
  const [classIdState, setClassIdState] = useState(() => {
    if (!editing?.subject?.id) return "";
    return tree.find((c) => c.children.some((s) => s.id === editing.subject?.id))?.id ?? "";
  });

  const defaults = useMemo<QuestionFormInput>(() => {
    if (editing) {
      const opts = parseOptions(editing);
      return {
        subjectId: editing.subject?.id ?? "",
        chapterId: editing.chapter?.id ?? "",
        topicId: editing.topicId ?? "",
        questionType: editing.questionType,
        difficulty: editing.difficulty,
        bloomLevel: editing.bloomLevel ?? "UNDERSTAND",
        caseStudyFormat: editing.caseStudyFormat ?? undefined,
        marks: editing.marks,
        questionText: editing.questionText,
        answerKey: editing.answerKey ?? "",
        explanation: editing.explanation ?? "",
        tags: editing.tags,
        previousYearTag: editing.previousYearTag ?? "",
        options: opts.choices ?? [],
        matchPairs: opts.pairs ?? [],
      };
    }
    return {
      subjectId: "",
      chapterId: "",
      topicId: "",
      questionType: "MCQ",
      difficulty: "MEDIUM",
      bloomLevel: "UNDERSTAND",
      marks: 1,
      questionText: "",
      answerKey: "",
      explanation: "",
      tags: [],
      previousYearTag: "",
      options: [
        { label: "A", text: "", isCorrect: true },
        { label: "B", text: "", isCorrect: false },
        { label: "C", text: "", isCorrect: false },
        { label: "D", text: "", isCorrect: false },
      ],
      matchPairs: [
        { left: "", right: "" },
        { left: "", right: "" },
      ],
    };
  }, [editing]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<QuestionFormInput>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: defaults,
  });

  // ---------- watched values ----------
  const subjectId = watch("subjectId");
  const chapterId = watch("chapterId");
  const topicId = watch("topicId");
  const questionType = watch("questionType");
  const questionText = watch("questionText");

  // ---------- cascading options ----------
  const subjects = useMemo(
    () => tree.find((c) => c.id === classIdState)?.children ?? [],
    [tree, classIdState]
  );
  const chapters = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.children ?? [],
    [subjects, subjectId]
  );
  const topics = useMemo(
    () => chapters.find((c) => c.id === chapterId)?.children ?? [],
    [chapters, chapterId]
  );

  // ---------- field arrays ----------
  const mcqArray = useFieldArray<QuestionFormInput, "options">({ control, name: "options" });
  const pairArray = useFieldArray<QuestionFormInput, "matchPairs">({ control, name: "matchPairs" });

  // ---------- submit ----------
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const fd = new FormData();
    fd.set("payload", JSON.stringify(values));
    const res = editing ? await updateQuestion(editing.id, null, fd) : await createQuestion(null, fd);
    if (!res.success) {
      setServerError(res.error);
      return;
    }
    onSaved();
  });

  const typedErrors = errors as unknown as {
    options?: { root?: { message?: string }; message?: string };
    matchPairs?: { root?: { message?: string }; message?: string };
  };
  const optionsRootError = typedErrors.options?.root?.message ?? typedErrors.options?.message;
  const pairsRootError = typedErrors.matchPairs?.root?.message ?? typedErrors.matchPairs?.message;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Question" : "Add Question"}</DialogTitle>
        <DialogDescription>
          Text supports Gujarati Unicode and inline math with $...$ (KaTeX).
        </DialogDescription>
      </DialogHeader>

      {/* Taxonomy cascade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Class</Label>
          <Select
            items={tree.map((c) => ({ value: c.id, label: c.name }))}
            value={classIdState || null}
            onValueChange={(v) => {
              setClassIdState(typeof v === "string" ? v : "");
              setValue("subjectId", "");
              setValue("chapterId", "");
              setValue("topicId", "");
            }}
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {tree.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Subject *</Label>
          <input type="hidden" {...register("subjectId")} />
          <Select
            items={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId || null}
            onValueChange={(v) => {
              setValue("subjectId", typeof v === "string" ? v : "", { shouldValidate: true });
              setValue("chapterId", "");
              setValue("topicId", "");
            }}
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!errors.subjectId}>
              <SelectValue placeholder={classIdState ? "Select subject" : "Select class first"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.subjectId && <p className="text-xs text-red-400">{errors.subjectId.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Chapter *</Label>
          <input type="hidden" {...register("chapterId")} />
          <Select
            items={chapters.map((c) => ({ value: c.id, label: c.name }))}
            value={chapterId || null}
            onValueChange={(v) => {
              setValue("chapterId", typeof v === "string" ? v : "", { shouldValidate: true });
              setValue("topicId", "");
            }}
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!errors.chapterId}>
              <SelectValue placeholder={subjectId ? "Select chapter" : "Select subject first"} />
            </SelectTrigger>
            <SelectContent>
              {chapters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.chapterId && <p className="text-xs text-red-400">{errors.chapterId.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Topic (optional)</Label>
          <input type="hidden" {...register("topicId")} />
          <Select
            items={topics.map((t) => ({ value: t.id, label: t.name }))}
            value={topicId || null}
            onValueChange={(v) => setValue("topicId", typeof v === "string" ? v : "")}
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue placeholder={chapterId ? "Select topic" : "Select chapter first"} />
            </SelectTrigger>
            <SelectContent>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Type + difficulty + marks + bloom */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            items={QUESTION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
            value={questionType}
            onValueChange={(v) =>
              v && setValue("questionType", v as QuestionFormInput["questionType"], { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <Select
            items={DIFFICULTIES.map((d) => ({ value: d, label: titleCase(d) }))}
            value={watch("difficulty")}
            onValueChange={(v) => v && setValue("difficulty", v as QuestionFormInput["difficulty"], { shouldValidate: true })}
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {titleCase(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Marks</Label>
          <Input type="number" step="0.5" min="0.5" {...register("marks")} className="bg-slate-950" />
          {errors.marks && <p className="text-xs text-red-400">{String(errors.marks.message)}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Bloom level</Label>
          <Select
            items={BLOOM_LEVELS.map((b) => ({ value: b, label: titleCase(b) }))}
            value={watch("bloomLevel")}
            onValueChange={(v) => v && setValue("bloomLevel", v as QuestionFormInput["bloomLevel"], { shouldValidate: true })}
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOOM_LEVELS.map((b) => (
                <SelectItem key={b} value={b}>
                  {titleCase(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {questionType === "CASE_STUDY" && (
        <div className="space-y-1.5">
          <Label>Case-study format</Label>
          <Select
            items={CASE_STUDY_FORMATS.map((f) => ({
              value: f,
              label: f === "INLINE" ? "Inline passage" : "Shared passage",
            }))}
            value={watch("caseStudyFormat") ?? null}
            onValueChange={(v) =>
              setValue(
                "caseStudyFormat",
                (typeof v === "string" ? v : undefined) as QuestionFormInput["caseStudyFormat"],
                { shouldValidate: true }
              )
            }
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!errors.caseStudyFormat}>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              {CASE_STUDY_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f === "INLINE" ? "Inline passage" : "Shared passage"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.caseStudyFormat && (
            <p className="text-xs text-red-400">{errors.caseStudyFormat.message}</p>
          )}
        </div>
      )}

      {/* Question text + live preview */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Question text *</Label>
          <Textarea
            rows={6}
            placeholder={"ગુજરાતી અથવા English…\ne.g. $x^2 + 1$ નું મૂલ્ય શું છે?"}
            {...register("questionText")}
            className="bg-slate-950"
          />
          {errors.questionText && <p className="text-xs text-red-400">{errors.questionText.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Preview</Label>
          <div className="min-h-24 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-200">
            {questionText ? (
              <KaTeXRenderer text={questionText} />
            ) : (
              <span className="text-slate-600">Live preview…</span>
            )}
          </div>
        </div>
      </div>

      {/* MCQ options */}
      {questionType === "MCQ" && (
        <div className="space-y-2 rounded-lg border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <Label>Options (tick the correct one)</Label>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                mcqArray.append({
                  label: String.fromCharCode(65 + mcqArray.fields.length),
                  text: "",
                  isCorrect: false,
                } as MCQOption)
              }
            >
              + Option
            </Button>
          </div>
          {mcqArray.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-blue-600"
                aria-label={`Option ${i + 1} correct`}
                {...register(`options.${i}.isCorrect` as const)}
              />
              <Badge variant="outline" className="w-7 justify-center">
                {String.fromCharCode(65 + i)}
              </Badge>
              <Input
                {...register(`options.${i}.text` as const)}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className="bg-slate-950"
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={mcqArray.fields.length <= 2}
                onClick={() => mcqArray.remove(i)}
                aria-label="Remove option"
              >
                ✕
              </Button>
            </div>
          ))}
          {optionsRootError && <p className="text-xs text-red-400">{optionsRootError}</p>}
        </div>
      )}

      {/* Match pairs */}
      {questionType === "MATCH_THE_FOLLOWING" && (
        <div className="space-y-2 rounded-lg border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <Label>Pairs</Label>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => pairArray.append({ left: "", right: "" } as MatchPair)}
            >
              + Pair
            </Button>
          </div>
          {pairArray.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <Input {...register(`matchPairs.${i}.left` as const)} placeholder="Left item" className="bg-slate-950" />
              <span className="text-slate-500">→</span>
              <Input {...register(`matchPairs.${i}.right` as const)} placeholder="Right item" className="bg-slate-950" />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={pairArray.fields.length <= 2}
                onClick={() => pairArray.remove(i)}
                aria-label="Remove pair"
              >
                ✕
              </Button>
            </div>
          ))}
          {pairsRootError && <p className="text-xs text-red-400">{pairsRootError}</p>}
        </div>
      )}

      {/* Answer key + explanation */}
      <div className="grid gap-3 sm:grid-cols-2">
        {questionType !== "MCQ" && (
          <div className="space-y-1.5">
            <Label>Answer key {questionType === "TRUE_FALSE" ? "" : "(optional)"}</Label>
            {questionType === "TRUE_FALSE" ? (
              <Select
                items={[
                  { value: "True", label: "True" },
                  { value: "False", label: "False" },
                ]}
                value={watch("answerKey") || null}
                onValueChange={(v) => setValue("answerKey", typeof v === "string" ? v : "")}
              >
                <SelectTrigger className="w-full bg-slate-950">
                  <SelectValue placeholder="Select answer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="True">True</SelectItem>
                  <SelectItem value="False">False</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Textarea rows={2} {...register("answerKey")} className="bg-slate-950" />
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Explanation (optional)</Label>
          <Textarea rows={2} {...register("explanation")} className="bg-slate-950" />
        </div>
      </div>

      {/* Tags + PYQ */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tags (comma separated)</Label>
          <Input placeholder="algebra, gseb-2024" {...register("tags")} className="bg-slate-950" />
        </div>
        <div className="space-y-1.5">
          <Label>Previous year tag</Label>
          <Input placeholder="e.g. GSEB 2023" {...register("previousYearTag")} className="bg-slate-950" />
          {errors.previousYearTag && (
            <p className="text-xs text-red-400">{errors.previousYearTag.message}</p>
          )}
        </div>
      </div>

      {serverError && <p className="text-sm text-red-400">{serverError}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Update question" : "Create question"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------

function titleCase(s: string): string {
  return s[0] + s.slice(1).toLowerCase();
}

type ParsedOptions = {
  choices?: MCQOption[];
  pairs?: MatchPair[];
};

function parseOptions(detail: QuestionDetailDTO): ParsedOptions {
  const raw = detail.options as {
    kind?: string;
    choices?: MCQOption[];
    pairs?: MatchPair[];
  } | null;
  if (!raw || typeof raw !== "object") return {};
  return { choices: raw.choices, pairs: raw.pairs };
}
