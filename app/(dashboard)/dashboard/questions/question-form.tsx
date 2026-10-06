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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createQuestion,
  updateQuestion,
  getQuestionById,
  listQuestions,
  unlinkTranslation,
  autoTranslateCreatePair,
  aiCreateCounterpart,
  retranslateCounterpart,
  type TaxonomyNode,
  type QuestionDetailDTO,
  type QuestionListDTO,
} from "./actions";
import { QUESTIONS_LIST_PATH } from "./list-state";
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
import { nodeLabel, taxLabel } from "@/lib/taxonomy-label";
import { AdvancedCustomEditor } from "@/components/editor/advanced-custom-editor";
import { LoadingButton } from "@/components/shared";
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
import { AlertTriangle, ArrowLeft, Hash, Languages, Search, Sparkles } from "lucide-react";
import {
  detectNumericConversion,
  mcqOptionsLayout,
  parseMcqLayout,
  OPTION_LAYOUT_LABELS,
  OPTION_LAYOUT_ORDER,
  type McqLayoutMode,
} from "@/lib/question-options";

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short Answer",
  LONG_ANSWER: "Long Answer",
  TRUE_FALSE: "True / False",
  FILL_IN_THE_BLANK: "Fill in the Blank",
  MATCH_THE_FOLLOWING: "Match the Following",
  CASE_STUDY: "Case Study",
  NUMERIC: "Numeric",
};

const MEDIUM_LABELS: Record<string, string> = {
  ENGLISH: "English",
  GUJARATI: "Gujarati",
};

// Types whose answer key / explanation are language-dependent — for these,
// the AI translate call also translates the answer (mirrors the server-side
// list in actions.ts).
const TRANSLATABLE_ANSWER_TYPES = [
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "FILL_IN_THE_BLANK",
  "MATCH_THE_FOLLOWING",
  "CASE_STUDY",
];

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
  initialLink,
  returnTo,
}: {
  editing: QuestionDetailDTO | null;
  tree: TaxonomyNode[];
  onSaved?: () => void;
  /** Deep-link target (?link=<id>): open the form as this question's translation. */
  initialLink?: QuestionDetailDTO | null;
  /** Listing URL (incl. its table state) to return to after save/cancel. */
  returnTo?: string;
}) {
  const router = useRouter();
  /** Where "back" lands — the listing resumes here with its filters intact. */
  const backHref = returnTo ?? QUESTIONS_LIST_PATH;

  // Editing: infer the class from the tree so the cascade is pre-filled
  const [classIdState, setClassIdState] = useState(() => {
    if (!editing?.subject?.id) return "";
    return tree.find((c) => c.children.some((s) => s.id === editing.subject?.id))?.id ?? "";
  });
  const [classError, setClassError] = useState<string | null>(null);
  const submitModeRef = useRef<"save" | "saveNew" | "autoTranslate" | "saveLink">("save");
  const [autoPending, setAutoPending] = useState(false);
  const [aiFillPending, setAiFillPending] = useState(false);
  const [aiGenPending, setAiGenPending] = useState(false);
  // Set after a save whose wording changed while a counterpart is linked —
  // the paired row still holds the older translation (text is never
  // overwritten automatically; the operator re-translates explicitly).
  const [translationOutdated, setTranslationOutdated] = useState(false);
  const [retransPending, setRetransPending] = useState(false);

  // ---- Bilingual pairing ----
  const [linkParent, setLinkParent] = useState<QuestionDetailDTO | null>(initialLink ?? null);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkSearched, setLinkSearched] = useState(false);
  const [linkResults, setLinkResults] = useState<QuestionListDTO[]>([]);
  const [pairUnlinked, setPairUnlinked] = useState(false);
  const appliedInitialLink = useRef(false);

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
        layout: parseMcqLayout(editing.options),
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
      layout: "auto",
    };
  }, [editing]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
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

  // An MCQ whose correct option is a plain number can become a numeric-answer
  // question — the student types the value instead of picking it.
  const optionsValue = watch("options");
  const numericConversion = useMemo(
    () =>
      questionType === "MCQ"
        ? detectNumericConversion({ kind: "mcq", choices: optionsValue ?? [] })
        : null,
    [questionType, optionsValue]
  );

  function convertToNumericQuestion() {
    if (!numericConversion) return;
    setValue("questionType", "NUMERIC", { shouldValidate: true });
    setValue("answerKey", numericConversion.text, { shouldValidate: true });
    toast.success(`Now a numeric question — answer set to ${numericConversion.text}.`);
  }
  const questionText = watch("questionText");
  const explanation = watch("explanation");
  const answerKey = watch("answerKey");
  const matchPairsValues = watch("matchPairs");
  const medium = watch("medium");
  const difficulty = watch("difficulty");
  const optionsValues = watch("options");
  const layoutMode = (watch("layout") as McqLayoutMode) ?? "auto";

  // Auto-set Bloom level when Difficulty changes (create mode only).
  // Idempotent: it only remaps when the current Bloom level is invalid for
  // the difficulty, so an inherited (valid) pair survives — including under
  // StrictMode's double-invoked effects.
  useEffect(() => {
    if (editing || !difficulty) return;
    const mapping = DIFFICULTY_BLOOM_MAP[difficulty];
    if (!mapping) return;
    const current = getValues("bloomLevel");
    if (!mapping.levels.includes(current)) {
      setValue("bloomLevel", mapping.default as QuestionFormInput["bloomLevel"], {
        shouldValidate: true,
      });
    }
  }, [difficulty, editing, getValues, setValue]);

  // Filter Bloom levels based on selected Difficulty
  const availableBloomLevels = useMemo(() => {
    if (!difficulty) return BLOOM_LEVELS;
    const mapping = DIFFICULTY_BLOOM_MAP[difficulty];
    return mapping ? mapping.levels : BLOOM_LEVELS;
  }, [difficulty]);

  // Reset the taxonomy cascade when it no longer belongs to the selected
  // medium (e.g. an external medium switch). Idempotent: a link-driven
  // state that already resolved into the new medium never trips it, so
  // StrictMode's double-invoked effects are harmless here. User switches
  // go through the Medium select's onValueChange, which clears inline.
  const subjectValidForMedium = useMemo(() => {
    if (editing || !subjectId) return true;
    return tree.some((c) =>
      c.children.some((s) => s.id === subjectId && s.medium === medium)
    );
  }, [editing, subjectId, tree, medium]);
  useEffect(() => {
    if (subjectValidForMedium) return;
    setClassIdState("");
    setValue("subjectId", "");
    setValue("chapterId", "");
    setValue("topicId", "");
  }, [subjectValidForMedium, setValue]);

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

  // ---------- bilingual link helpers ----------
  /**
   * Adopts `parent` as the bilingual counterpart: flips the medium to its
   * opposite, inherits chapter/topic/difficulty/Bloom/type/marks, and COPIES
   * the source content into the form so the operator translates IN PLACE —
   * manual editing, or one click of "AI Translate to <language>".
   *
   * Taxonomy resolves name → subject code → list position (mirroring the
   * server's resolvePairTaxonomy); any level without a counterpart stays
   * empty for the operator to pick.
   */
  const applyLink = useCallback(
    (parent: QuestionDetailDTO) => {
      const targetMedium = parent.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH";

      setValue("medium", targetMedium, { shouldValidate: true });
      const targetSubjectName = parent.subject?.name ?? "";
      const parentSubjectCode = parent.subject?.code ?? null;
      // The source subject node (any medium) gives the parallel chapter/topic
      // lists for the position fallback.
      const sourceSubjectNode =
        tree.flatMap((c) => c.children).find((s) => s.id === parent.subject?.id) ?? null;
      const subjectMatches = (s: TaxonomyNode) =>
        s.medium === targetMedium &&
        (s.name === targetSubjectName ||
          (!!parentSubjectCode && s.code === parentSubjectCode));
      const classNode =
        tree.find((c) =>
          c.children.some((s) => s.id === parent.subject?.id || subjectMatches(s))
        ) ?? null;
      setClassIdState(classNode?.id ?? "");
      setClassError(null);
      const targetSubject = classNode?.children.find(subjectMatches) ?? null;

      // Chapter: name → position in the parallel lists (equal counts only —
      // never silently pair mismatched sequences).
      let targetChapter =
        targetSubject?.children.find(
          (ch) => parent.chapter && ch.name === parent.chapter.name
        ) ?? null;
      if (!targetChapter && parent.chapter && sourceSubjectNode && targetSubject) {
        const srcChapters = sourceSubjectNode.children;
        const idx = srcChapters.findIndex((ch) => ch.id === parent.chapter!.id);
        if (idx >= 0 && srcChapters.length === targetSubject.children.length) {
          targetChapter = targetSubject.children[idx] ?? null;
        }
      }

      // Topic: name → position (equal counts only).
      const parentChapter = parent.chapter;
      const parentTopicId = parent.topicId;
      let targetTopic =
        targetChapter?.children.find(
          (t) => parent.topicName && t.name === parent.topicName
        ) ?? null;
      if (!targetTopic && parentChapter && parentTopicId && targetChapter && sourceSubjectNode) {
        const sourceChapterNode =
          sourceSubjectNode.children.find((ch) => ch.id === parentChapter.id) ?? null;
        const srcTopics = sourceChapterNode?.children ?? [];
        const idx = srcTopics.findIndex((t) => t.id === parentTopicId);
        if (idx >= 0 && srcTopics.length === targetChapter.children.length) {
          targetTopic = targetChapter.children[idx] ?? null;
        }
      }

      setValue("subjectId", targetSubject?.id ?? "", { shouldValidate: true });
      setValue("chapterId", targetChapter?.id ?? "", { shouldValidate: true });
      setValue("topicId", targetTopic?.id ?? "", { shouldValidate: true });
      const missing: string[] = [];
      if (!targetSubject) missing.push(`subject "${targetSubjectName}"`);
      else if (parent.chapter && !targetChapter)
        missing.push(`chapter "${parent.chapter.name}"`);
      else if (parent.topicName && !targetTopic)
        missing.push(`topic "${parent.topicName}"`);
      if (missing.length) {
        toast.warning(
          `No ${MEDIUM_LABELS[targetMedium]} ${missing.join(
            ", "
          )} — select the taxonomy manually.`
        );
      }
      setValue("difficulty", parent.difficulty, { shouldValidate: true });
      setValue(
        "bloomLevel",
        (parent.bloomLevel ??
          DIFFICULTY_BLOOM_MAP[parent.difficulty]?.default ??
          "UNDERSTAND") as QuestionFormInput["bloomLevel"],
        { shouldValidate: true }
      );
      setValue("questionType", parent.questionType, { shouldValidate: true });
      setValue("caseStudyFormat", parent.caseStudyFormat ?? undefined, {
        shouldValidate: true,
      });
      setValue("marks", parent.marks, { shouldValidate: true });

      // Content prefill — the source content becomes the working draft: edit
      // it in place (manual) or hit "AI Translate to <language>" to have it
      // filled automatically. Structure (correct flags, pair shape, layout)
      // carries over; only the words are language-specific.
      const parentParsed = parseOptions(parent);
      setValue("questionText", parent.questionText, { shouldValidate: true });
      setValue("answerKey", parent.answerKey ?? "", { shouldValidate: true });
      setValue("explanation", parent.explanation ?? "");
      setValue("tags", parent.tags ?? []);
      setValue("previousYearTag", parent.previousYearTag ?? "");
      if (parent.questionType === "MCQ") {
        if (parentParsed.choices?.length) {
          setValue(
            "options",
            parentParsed.choices.map((o) => ({ ...o })),
            { shouldValidate: true }
          );
          setValue("layout", parseMcqLayout(parent.options));
        } else {
          setValue(
            "options",
            (getValues("options") ?? []).map((o) => ({ ...o, text: "" }))
          );
        }
      } else if (parent.questionType === "MATCH_THE_FOLLOWING") {
        if (parentParsed.pairs?.length) {
          setValue(
            "matchPairs",
            parentParsed.pairs.map((p) => ({ ...p })),
            { shouldValidate: true }
          );
        } else {
          setValue(
            "matchPairs",
            (getValues("matchPairs") ?? []).map(() => ({ left: "", right: "" }))
          );
        }
      } else {
        // Types without options/pairs: clear stale rows left over from a
        // previously selected type.
        setValue(
          "options",
          (getValues("options") ?? []).map((o) => ({ ...o, text: "" }))
        );
        setValue(
          "matchPairs",
          (getValues("matchPairs") ?? []).map(() => ({ left: "", right: "" }))
        );
      }

      setLinkParent(parent);
      setShowLinkSearch(false);
      setLinkResults([]);
      setLinkSearch("");
      setLinkSearched(false);
    },
    [tree, getValues, setValue]
  );

  // Deep-link from the bank (?link=<id>) opens the form as its translation.
  useEffect(() => {
    if (initialLink && !appliedInitialLink.current) {
      appliedInitialLink.current = true;
      applyLink(initialLink);
    }
  }, [initialLink, applyLink]);

  async function searchLink() {
    const term = linkSearch.trim();
    if (!term) return;
    setLinkSearching(true);
    try {
      const res = await listQuestions({ search: term, pageSize: 6 });
      setLinkResults(res.items);
    } catch {
      toast.error("Could not search questions.");
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
      setLinkSearched(true);
    }
  }

  async function pickLinkResult(row: QuestionListDTO) {
    setLinkSearching(true);
    try {
      const parent = await getQuestionById(row.id);
      if (!parent) {
        toast.error("Could not load the selected question.");
        return;
      }
      applyLink(parent);
      toast.success(
        `Linked to #${parent.code} — you are now writing the ${
          MEDIUM_LABELS[parent.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH"]
        } version.`
      );
    } finally {
      setLinkSearching(false);
    }
  }

  function cancelLinkSearch() {
    setShowLinkSearch(false);
    setLinkResults([]);
    setLinkSearched(false);
    setLinkSearch("");
  }

  async function handleUnlink() {
    if (editing) {
      const res = await unlinkTranslation(editing.id);
      if (!res.success) {
        toast.error(res.error ?? "Could not unlink the translation pair.");
        return;
      }
      setPairUnlinked(true);
      toast.success(res.message ?? "Translation pair unlinked.");
      router.refresh();
      return;
    }
    // Create mode: drop the link but keep the inherited metadata in the form.
    setLinkParent(null);
    cancelLinkSearch();
  }

  // ---------- AI translate-in-place (create mode, link flow) ----------
  // Translates the prefilled draft (source content copied by applyLink) into
  // the form's current medium and fills every language-dependent field. The
  // operator reviews and saves — the manual flow is simply editing the same
  // prefilled fields instead.
  async function aiFillTranslation() {
    if (!linkParent) return;
    const values = getValues();
    const targetLanguage = values.medium === "GUJARATI" ? "Gujarati" : "English";
    const translatable = TRANSLATABLE_ANSWER_TYPES.includes(values.questionType);
    setAiFillPending(true);
    try {
      const res = await fetch("/api/ai/translate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage,
          questionType: values.questionType,
          questionText: values.questionText,
          options: values.questionType === "MCQ" ? values.options : undefined,
          matchPairs:
            values.questionType === "MATCH_THE_FOLLOWING" ? values.matchPairs : undefined,
          answerKey: translatable && values.answerKey ? values.answerKey : undefined,
          explanation: values.explanation || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        translated?: {
          questionText?: string;
          options?: MCQOption[];
          matchPairs?: MatchPair[];
          answerKey?: string;
          explanation?: string;
        };
      } | null;
      if (!res.ok || !body?.ok || !body.translated) {
        toast.error(body?.error ?? "AI translation failed.");
        return;
      }
      const t = body.translated;
      if (t.questionText) setValue("questionText", t.questionText, { shouldValidate: true });
      if (values.questionType === "MCQ" && t.options?.length) {
        setValue("options", t.options, { shouldValidate: true });
      }
      if (values.questionType === "MATCH_THE_FOLLOWING" && t.matchPairs?.length) {
        setValue("matchPairs", t.matchPairs, { shouldValidate: true });
      }
      if (t.answerKey && translatable) {
        setValue("answerKey", t.answerKey, { shouldValidate: true });
      }
      if (t.explanation) setValue("explanation", t.explanation);
      toast.success(`Translated to ${targetLanguage} — review the text, then save.`);
    } catch {
      toast.error("AI translation failed. Please try again.");
    } finally {
      setAiFillPending(false);
    }
  }

  // ---------- AI Generate Translation (edit mode, unlinked question) ----------
  // Creates the counterpart in the opposite medium in one click: counterpart
  // taxonomy resolved server-side, content translated, both rows joined
  // under one translationGroupId. The form refreshes into its linked state.
  async function aiGenerateCounterpart() {
    if (!editing) return;
    setAiGenPending(true);
    try {
      const res = await aiCreateCounterpart(editing.id);
      if (!res.success) {
        toast.error(res.error ?? "Could not generate the translation.");
        return;
      }
      toast.success(res.message ?? "Translation generated.");
      router.refresh();
    } finally {
      setAiGenPending(false);
    }
  }

  // ---------- AI re-translate counterpart (edit mode, linked) ----------
  // Rewrites ONLY the paired row's language fields from this question.
  // Language-neutral fields already sync on save (see updateQuestion).
  async function handleRetranslate() {
    if (!editing) return;
    setRetransPending(true);
    try {
      const res = await retranslateCounterpart(editing.id);
      if (!res.success) {
        toast.error(res.error ?? "Could not re-translate the counterpart.");
        return;
      }
      setTranslationOutdated(false);
      toast.success(res.message ?? "Counterpart re-translated.");
      router.refresh();
    } finally {
      setRetransPending(false);
    }
  }

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

    // ✨ Auto-Translate & Save Both Languages — translate + persist both
    // halves of a fresh pair in one server round-trip (create mode only).
    if (!editing && submitModeRef.current === "autoTranslate") {
      setAutoPending(true);
      try {
        fd.set("payload", JSON.stringify({ ...values, linkQuestionId: "" }));
        const res = await autoTranslateCreatePair(null, fd);
        if (!res.success) {
          setServerError(res.error);
          toast.error(res.error ?? "Could not save the translation pair.");
          return;
        }
        toast.success(res.message ?? "Saved both languages.");
        router.push(backHref);
      } finally {
        setAutoPending(false);
      }
      return;
    }

    fd.set(
      "payload",
      JSON.stringify({ ...values, linkQuestionId: linkParent?.id ?? "" })
    );
    const res = editing ? await updateQuestion(editing.id, null, fd) : await createQuestion(null, fd);
    if (!res.success) {
      setServerError(res.error);
      toast.error(res.error ?? "Could not save question.");
      return;
    }

    // "Link — Manual Translation" (edit mode): persist first, then reopen the
    // create form deep-linked to this question as the translation parent —
    // taxonomy + content are prefilled there for in-place translating.
    if (editing && submitModeRef.current === "saveLink") {
      toast.success(res.message ?? "Saved — now write the translation.");
      router.push(`/dashboard/questions/new?link=${editing.id}`);
      return;
    }

    // Save & New → keep the page, reset everything
    if (!editing && submitModeRef.current === "saveNew") {
      reset();
      setClassIdState("");
      setLinkParent(null);
      cancelLinkSearch();
      toast.success("Saved. Ready for the next question.");
      onSaved?.();
      return;
    }

    if (editing) {
      setTranslationOutdated(!!res.translationOutdated);
      toast.success(res.message ?? "Question saved");
      // The in-page "re-translate" chip is gone now that we leave the form —
      // warn here so a stale counterpart is never silently kept.
      if (res.translationOutdated) {
        toast.warning(
          "Saved — the linked translation still has the previous wording. Open it to re-translate."
        );
      }
      // Back to the bank on the exact page/filter state the edit was opened
      // from — returnTo carries it in its query string.
      router.push(backHref);
      return;
    }

    toast.success(res.message ?? "Question saved");
    router.push(backHref);
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
          onClick={() => router.push(backHref)}
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
          disabled={!!linkParent}
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

      {/* Bilingual pairing (create mode) */}
      {!editing && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" aria-hidden />
              <span className="font-[Nunito] text-sm font-medium text-foreground">
                Bilingual Translation
              </span>
              {linkParent && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-[10px] text-emerald-400"
                >
                  EN/GUJ Linked
                </Badge>
              )}
            </div>
            {!linkParent && !showLinkSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLinkSearch(true)}
              >
                <Search className="mr-1 h-3.5 w-3.5" />
                Link to Existing Question
              </Button>
            )}
          </div>

          {linkParent ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <span>
                  Linked to <span className="font-mono font-semibold">#{linkParent.code}</span>{" "}
                  ({MEDIUM_LABELS[linkParent.medium]})
                </span>
                <span className="line-clamp-1 min-w-0 flex-1 text-muted-foreground">
                  {linkParent.questionText}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void handleUnlink()}
                >
                  Unlink
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LoadingButton
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={aiFillPending}
                  loadingText="Translating…"
                  disabled={isSubmitting}
                  onClick={() => void aiFillTranslation()}
                  className="border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  AI Translate to {MEDIUM_LABELS[medium]}
                </LoadingButton>
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Content is prefilled from #{linkParent.code} — edit it in place (manual) or let
                  AI fill the {MEDIUM_LABELS[medium]} text, then save.
                </p>
              </div>
            </div>
          ) : showLinkSearch ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchLink();
                    }
                  }}
                  placeholder="Search by code (#506892) or question text"
                  className="bg-slate-950"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void searchLink()}
                  disabled={linkSearching}
                >
                  {linkSearching ? "Searching…" : "Search"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={cancelLinkSearch}>
                  Cancel
                </Button>
              </div>
              {linkResults.length > 0 && (
                <div className="max-h-44 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60">
                  {linkResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void pickLinkResult(r)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60"
                    >
                      <span className="font-mono text-muted-foreground">#{r.code}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {MEDIUM_LABELS[r.medium] ?? r.medium}
                      </Badge>
                      <span className="line-clamp-1 text-muted-foreground">
                        {r.questionText}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {linkSearched && linkResults.length === 0 && (
                <p className="text-xs text-muted-foreground">No matching questions found.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Link the same question in the other language — chapter, topic, difficulty, Bloom
              level, type and marks are inherited from the linked question, the medium switches
              to its opposite, and its content is prefilled here for you to translate manually or
              with one click of AI. Both versions can then be swapped on any paper.
            </p>
          )}
        </div>
      )}

      {/* Bilingual pair status (edit mode) */}
      {editing && editing.linked && !pairUnlinked && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Languages className="h-4 w-4 shrink-0" aria-hidden />
            <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-400">
              EN/GUJ Linked
            </Badge>
            <span className="min-w-0 flex-1 text-muted-foreground">
              Part of a bilingual pair — the medium is locked while linked. Marks, difficulty and
              the correct answer stay in sync automatically.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => void handleUnlink()}
            >
              Unlink
            </Button>
          </div>
          {translationOutdated && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-muted-foreground">
                The linked counterpart still holds the previous wording — text is never
                overwritten automatically.
              </span>
              <LoadingButton
                type="button"
                size="sm"
                variant="outline"
                loading={retransPending}
                loadingText="Translating…"
                disabled={isSubmitting}
                onClick={() => void handleRetranslate()}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Re-translate counterpart
              </LoadingButton>
            </div>
          )}
        </div>
      )}

      {/* Bilingual pairing options (edit mode, not yet linked) */}
      {editing && !editing.linked && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" aria-hidden />
              <span className="font-[Nunito] text-sm font-medium text-foreground">
                Bilingual Translation
              </span>
              <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">
                Not linked
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  submitModeRef.current = "saveLink";
                  void onSubmit();
                }}
              >
                <Search className="mr-1 h-3.5 w-3.5" />
                Link — Manual Translation
              </Button>
              <LoadingButton
                type="button"
                variant="outline"
                size="sm"
                loading={aiGenPending}
                loadingText="Translating…"
                disabled={isSubmitting}
                onClick={() => void aiGenerateCounterpart()}
                className="border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm hover:bg-zinc-900 hover:text-zinc-100"
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                AI Generate Translation
              </LoadingButton>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            No {MEDIUM_LABELS[editing.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH"]}{" "}
            counterpart yet — pair it manually (saves, then opens a prefilled translation form) or
            let AI create the {MEDIUM_LABELS[editing.medium === "ENGLISH" ? "GUJARATI" : "ENGLISH"]}{" "}
            version now, with the matching chapter/topic in its medium.
          </p>
        </div>
      )}

      {/* Taxonomy cascade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Class *</Label>
          <Select
            items={filteredTree.map((c) => ({ value: c.id, label: nodeLabel(c) }))}
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
                  {nodeLabel(c)}
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
            items={subjects.map((s) => ({ value: s.id, label: taxLabel(s.name, s.questionCount) }))}
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
                  {taxLabel(s.name, s.questionCount)}
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
            items={chapters.map((c) => ({ value: c.id, label: taxLabel(c.name, c.questionCount) }))}
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
                  {taxLabel(c.name, c.questionCount)}
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
            items={topics.map((t) => ({ value: t.id, label: taxLabel(t.name, t.questionCount) }))}
            value={topicId || null}
            onValueChange={(v) => setValue("topicId", typeof v === "string" ? v : "")}
          >
            <SelectTrigger className="w-full bg-slate-950" aria-invalid={!!errors.topicId}>
              <SelectValue placeholder={chapterId ? "Select topic" : "Select chapter first"} />
            </SelectTrigger>
            <SelectContent>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {taxLabel(t.name, t.questionCount)}
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

      {/* A numeric correct option means this MCQ can be answered by typing */}
      {numericConversion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-secondary/30 bg-secondary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Correct option <span className="font-semibold text-foreground">({numericConversion.label})</span>{" "}
            is the number <span className="font-semibold text-foreground">{numericConversion.text}</span> — students
            could type it instead of choosing.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={convertToNumericQuestion}
          >
            <Hash className="h-3.5 w-3.5" />
            Convert to numeric
          </Button>
        </div>
      )}

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

            {/* Options in the selected layout — mirrors the printed paper. */}
            {questionType === "MCQ" && (optionsValues ?? []).some((o) => o?.text?.trim()) && (
              <div
                className="mt-3 grid gap-x-4 gap-y-2"
                style={{ gridTemplateColumns: `repeat(${mcqOptionsLayout((optionsValues ?? []).map((o) => o?.text ?? ""), layoutMode)}, minmax(0, 1fr))` }}
              >
                {(optionsValues ?? [])
                  .filter((o) => o?.text?.trim())
                  .map((o) => (
                    <div
                      key={o.label}
                      className={`flex items-baseline gap-1.5 rounded px-1 ${
                        o.isCorrect ? "bg-emerald-500/10 text-emerald-300" : ""
                      }`}
                    >
                      <span className="shrink-0 font-medium">({o.label})</span>
                      <span className="min-w-0">
                        <KaTeXRenderer text={o.text} />
                      </span>
                      {o.isCorrect && <span className="shrink-0 text-emerald-400">✓</span>}
                    </div>
                  ))}
              </div>
            )}

            {/* Match pairs preview */}
            {questionType === "MATCH_THE_FOLLOWING" &&
              (matchPairsValues ?? []).some((p) => p?.left?.trim()) && (
                <div className="mt-3 space-y-1">
                  {(matchPairsValues ?? [])
                    .filter((p) => p?.left?.trim())
                    .map((p, i) => (
                      <div key={i} className="flex items-baseline gap-1.5 text-[13px]">
                        <span className="shrink-0 text-slate-400">
                          ({String.fromCharCode(97 + i)})
                        </span>
                        <span className="min-w-0">
                          <KaTeXRenderer text={p.left} />
                        </span>
                        <span className="shrink-0 text-slate-500">→</span>
                        <span className="min-w-0">
                          <KaTeXRenderer text={p.right} />
                        </span>
                      </div>
                    ))}
                </div>
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

          <div className="space-y-1.5 border-t border-slate-800 pt-3">
            <Label>Option layout</Label>
            <Select
              items={OPTION_LAYOUT_ORDER.map((l) => ({
                value: l,
                label: OPTION_LAYOUT_LABELS[l],
              }))}
              value={(watch("layout") as McqLayoutMode) ?? "auto"}
              onValueChange={(v) =>
                v && setValue("layout", v as McqLayoutMode, { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTION_LAYOUT_ORDER.map((l) => (
                  <SelectItem key={l} value={l}>
                    {OPTION_LAYOUT_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              How options are arranged on the printed paper and in previews.
            </p>
          </div>
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
          <Label>
            {questionType === "NUMERIC"
              ? "Numeric answer"
              : `Answer key ${questionType === "TRUE_FALSE" ? "" : "(optional)"}`}
          </Label>
          {questionType === "NUMERIC" ? (
            <>
              <Input
                inputMode="decimal"
                value={answerKey ?? ""}
                onChange={(e) => setValue("answerKey", e.target.value, { shouldValidate: true })}
                placeholder="e.g. 42, -3.5 or 1/2"
                className="bg-slate-950"
              />
              <p className="text-[11px] text-muted-foreground">
                Students type this value instead of picking an option. Fractions like 1/2 are
                accepted.
              </p>
              {errors.answerKey && (
                <p className="text-xs text-red-400">{errors.answerKey.message}</p>
              )}
            </>
          ) : questionType === "TRUE_FALSE" ? (
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
        <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
          Cancel
        </Button>
        {!editing && !linkParent && (
          <LoadingButton
            type="button"
            variant="outline"
            loading={autoPending}
            loadingText="Translating…"
            disabled={isSubmitting}
            onClick={() => {
              submitModeRef.current = "autoTranslate";
              void onSubmit();
            }}
            className="border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm hover:bg-zinc-900 hover:text-zinc-100"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Auto-Translate &amp; Save Both Languages
          </LoadingButton>
        )}
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
