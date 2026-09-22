"use client";

// ============================================================
//  Question Form — shared create/edit form (page-based)
//
//  - react-hook-form + zodResolver (questionFormSchema)
//  - Cascading Class → Subject → Chapter → Topic selects
//  - Type-conditional fields: MCQ options, match pairs,
//    case-study format
//  - Live preview renders Gujarati Unicode + $...$ KaTeX
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
  MEDIUMS,
  type QuestionFormInput,
} from "@/lib/validations";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { AdvancedCustomEditor } from "@/components/editor/advanced-custom-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short Answer",
  LONG_ANSWER: "Long Answer",
  TRUE_FALSE: "True / False",
  FILL_IN_THE_BLANK: "Fill in the Blank",
  MATCH_THE_FOLLOWING: "Match the Following",
  CASE_STUDY: "Case Study",
};

const MEDIUM_LABELS: Record<string, string> = {
  ENGLISH: "English",
  GUJARATI: "Gujarati",
};

// Difficulty → Bloom level mapping
const DIFFICULTY_BLOOM_MAP: Record<string, { levels: string[]; default: string; label: string }> = {
  EASY:   { levels: ["REMEMBER", "UNDERSTAND"],           default: "REMEMBER",  label: "Easy → Remember / Understand" },
  MEDIUM: { levels: ["APPLY", "ANALYZE"],                 default: "APPLY",     label: "Medium → Apply / Analyze" },
  HARD:   { levels: ["EVALUATE", "CREATE"],               default: "EVALUATE",  label: "Hard → Evaluate / Create" },
};

type MCQOption = { label: string; text: string; isCorrect: boolean };
type MatchPair = { left: string; right: string };

export function QuestionForm({
  editing,
  tree,
  onSaved,
}: {
  editing: QuestionDetailDTO | null;
  tree: TaxonomyNode[];
  onSaved?: () => void;
}) {
  const router = useRouter();

  // Editing: infer the class from the tree so the cascade is pre-filled
  const [classIdState, setClassIdState] = useState(() => {
    if (!editing?.subject?.id) return "";
    return tree.find((c) => c.children.some((s) => s.id === editing.subject?.id))?.id ?? "";
  });
  const [classError, setClassError] = useState<string | null>(null);
  const submitModeRef = useRef<"save" | "saveNew">("save");

  const defaults = useMemo<QuestionFormInput>(() => {
    if (editing) {
      const opts = parseOptions(editing);
      return {
        subjectId: editing.subject?.id ?? "",
        chapterId: editing.chapter?.id ?? "",
        topicId: editing.topicId ?? "",
        questionType: editing.questionType,
        difficulty: editing.difficulty,
        medium: editing.medium,
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
      medium: "ENGLISH",
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
    reset,
    setError,
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
  const explanation = watch("explanation");
  const answerKey = watch("answerKey");
  const matchPairsValues = watch("matchPairs");
  const medium = watch("medium");
  const difficulty = watch("difficulty");
  const optionsValues = watch("options");

  // Auto-set Bloom level when Difficulty changes (create mode only)
  useEffect(() => {
    if (!editing && difficulty) {
      const mapping = DIFFICULTY_BLOOM_MAP[difficulty];
      if (mapping) {
        setValue("bloomLevel", mapping.default as QuestionFormInput["bloomLevel"], { shouldValidate: true });
      }
    }
  }, [difficulty, editing, setValue]);

  // Filter Bloom levels based on selected Difficulty
  const availableBloomLevels = useMemo(() => {
    if (!difficulty) return BLOOM_LEVELS;
    const mapping = DIFFICULTY_BLOOM_MAP[difficulty];
    return mapping ? mapping.levels : BLOOM_LEVELS;
  }, [difficulty]);

  // Reset class/subject/chapter/topic when medium changes (create mode only)
  useEffect(() => {
    if (!editing) {
      setClassIdState("");
      setValue("subjectId", "");
      setValue("chapterId", "");
      setValue("topicId", "");
    }
  }, [medium, editing, setValue]);

  // ---------- filter tree by medium ----------
  const filteredTree = useMemo(() => {
    return tree.map((cl) => ({
      ...cl,
      children: cl.children.filter((s) => s.medium === medium),
    })).filter((cl) => cl.children.length > 0);
  }, [tree, medium]);

  // ---------- cascading options ----------
  const subjects = useMemo(
    () => filteredTree.find((c) => c.id === classIdState)?.children ?? [],
    [filteredTree, classIdState]
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

  // Topic + answer are required in the form even though the shared schema
  // keeps them optional (bulk import / legacy rows rely on that).
  const validateRequired = (
    values: QuestionFormInput
  ): ("topicId" | "answerKey")[] => {
    const issues: ("topicId" | "answerKey")[] = [];
    if (!(values.topicId ?? "").trim()) issues.push("topicId");
    if (
      !["MCQ", "MATCH_THE_FOLLOWING", "CASE_STUDY"].includes(values.questionType) &&
      !(values.answerKey ?? "").trim()
    ) {
      issues.push("answerKey");
    }
    return issues;
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    if (submitModeRef.current === "saveNew") toast("Saving question…");

    let hasIssue = false;
    if (!classIdState) {
      setClassError("Class is required");
      hasIssue = true;
    } else {
      setClassError(null);
    }
    for (const path of validateRequired(values)) {
      setError(path, { message: path === "topicId" ? "Topic is required" : "Answer is required" });
      hasIssue = true;
    }
    if (hasIssue) {
      toast.error("Please fill all required fields before saving.");
      return;
    }

    const fd = new FormData();
    fd.set("payload", JSON.stringify(values));
    const res = editing ? await updateQuestion(editing.id, null, fd) : await createQuestion(null, fd);
    if (!res.success) {
      setServerError(res.error);
      toast.error(res.error ?? "Could not save question.");
      return;
    }

    // Save & New → keep the page, reset everything
    if (!editing && submitModeRef.current === "saveNew") {
      reset();
      setClassIdState("");
      toast.success("Saved. Ready for the next question.");
      onSaved?.();
      return;
    }

    toast.success(res.message ?? "Question saved");
    router.push("/dashboard/questions");
  });

  const typedErrors = errors as unknown as {
    options?: { root?: { message?: string }; message?: string };
    matchPairs?: { root?: { message?: string }; message?: string };
  };
  const optionsRootError = typedErrors.options?.root?.message ?? typedErrors.options?.message;
  const pairsRootError = typedErrors.matchPairs?.root?.message ?? typedErrors.matchPairs?.message;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/questions")}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="font-[Rasa] text-lg font-bold tracking-tight">
            {editing ? "Edit Question" : "Add Question"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Text supports Gujarati Unicode and inline math with $...$ (KaTeX).
          </p>
        </div>
      </div>

      {/* Medium — first field */}
      <div className="space-y-1.5">
        <Label>Medium *</Label>
        <input type="hidden" {...register("medium")} />
        <Select
          items={MEDIUMS.map((m) => ({ value: m, label: MEDIUM_LABELS[m] }))}
          value={medium}
          onValueChange={(v) => {
            if (v) {
              setValue("medium", v as QuestionFormInput["medium"], { shouldValidate: true });
              setClassIdState("");
              setValue("subjectId", "");
              setValue("chapterId", "");
              setValue("topicId", "");
            }
          }}
        >
          <SelectTrigger className="w-full bg-slate-950">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEDIUMS.map((m) => (
              <SelectItem key={m} value={m}>
                {MEDIUM_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.medium && <p className="text-xs text-red-400">{errors.medium.message}</p>}
      </div>

      {/* Taxonomy cascade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Class *</Label>
          <Select
            items={filteredTree.map((c) => ({ value: c.id, label: c.name }))}
            value={classIdState || null}
            onValueChange={(v) => {
              setClassIdState(typeof v === "string" ? v : "");
              setClassError(null);
              setValue("subjectId", "");
              setValue("chapterId", "");
              setValue("topicId", "");
            }}
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!classError}>
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {filteredTree.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {classError && <p className="text-xs text-red-400">{classError}</p>}
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
          <Label>Topic *</Label>
          <input type="hidden" {...register("topicId")} />
          <Select
            items={topics.map((t) => ({ value: t.id, label: t.name }))}
            value={topicId || null}
            onValueChange={(v) => setValue("topicId", typeof v === "string" ? v : "")}
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!errors.topicId}>
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
          {errors.topicId && <p className="text-xs text-red-400">{errors.topicId.message}</p>}
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
            items={availableBloomLevels.map((b) => ({ value: b, label: titleCase(b) }))}
            value={watch("bloomLevel")}
            onValueChange={(v) => v && setValue("bloomLevel", v as QuestionFormInput["bloomLevel"], { shouldValidate: true })}
          >
            <SelectTrigger className="w-full bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableBloomLevels.map((b) => (
                <SelectItem key={b} value={b}>
                  {titleCase(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {difficulty && DIFFICULTY_BLOOM_MAP[difficulty] && (
            <p className="text-[11px] text-muted-foreground">
              {DIFFICULTY_BLOOM_MAP[difficulty].label}
            </p>
          )}
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
          <AdvancedCustomEditor
            value={questionText}
            onChange={(v) => setValue("questionText", v, { shouldValidate: true })}
            placeholder={"Type or build the question…\n• Σ → math with live preview\n• OCR → paste a photo/screenshot of text\n• ગુજરાતી → keyboard & transliteration"}
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
            <div key={f.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-2 size-4 accent-blue-600"
                aria-label={`Option ${i + 1} correct`}
                {...register(`options.${i}.isCorrect` as const)}
              />
              <Badge variant="outline" className="mt-1.5 w-7 shrink-0 justify-center">
                {String.fromCharCode(65 + i)}
              </Badge>
              <div className="min-w-0 flex-1">
                <AdvancedCustomEditor
                  compact
                  value={optionsValues?.[i]?.text ?? ""}
                  onChange={(v) => setValue(`options.${i}.text` as const, v, { shouldValidate: true })}
                  placeholder={`Option ${String.fromCharCode(65 + i)} — text, $...$ math, ગુજરાતી`}
                />
              </div>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mt-1.5"
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
            <div key={f.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <AdvancedCustomEditor
                  compact
                  value={matchPairsValues?.[i]?.left ?? ""}
                  onChange={(v) => setValue(`matchPairs.${i}.left` as const, v, { shouldValidate: true })}
                  placeholder="Left item"
                />
              </div>
              <span className="mt-2 shrink-0 text-slate-500">→</span>
              <div className="min-w-0 flex-1">
                <AdvancedCustomEditor
                  compact
                  value={matchPairsValues?.[i]?.right ?? ""}
                  onChange={(v) => setValue(`matchPairs.${i}.right` as const, v, { shouldValidate: true })}
                  placeholder="Right item"
                />
              </div>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mt-1.5"
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

      {/* Answer key */}
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
            <AdvancedCustomEditor
              value={answerKey ?? ""}
              onChange={(v) => setValue("answerKey", v, { shouldValidate: true })}
              placeholder={"Answer key — $...$ math, ગુજરાતી, or typed text"}
            />
          )}
        </div>
      )}

      {/* Explanation — full width (solutions are large) */}
      <div className="space-y-1.5">
        <Label>Explanation (optional)</Label>
        <AdvancedCustomEditor
          value={explanation ?? ""}
          onChange={(v) => setValue("explanation", v, { shouldValidate: true })}
          placeholder={"Explain the solution…\n• Σ → math with live preview\n• OCR → paste a photo/screenshot of text\n• ગુજરાતી → keyboard & transliteration"}
        />
        {errors.explanation && <p className="text-xs text-red-400">{errors.explanation.message}</p>}
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

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/questions")}>
          Cancel
        </Button>
        {!editing && (
          <Button
            type="submit"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => {
              submitModeRef.current = "saveNew";
            }}
          >
            {isSubmitting ? "Saving…" : "Save & New"}
          </Button>
        )}
        <Button
          type="submit"
          disabled={isSubmitting}
          onClick={() => {
            submitModeRef.current = "save";
          }}
        >
          {isSubmitting ? "Saving…" : editing ? "Update question" : "Create question"}
        </Button>
      </div>
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
