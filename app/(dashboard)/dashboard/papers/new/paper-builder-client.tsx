"use client";

// ============================================================
//  Paper Builder — Client Component
//  Supports Manual mode (question picker) and Blueprint mode (auto-gen)
// ============================================================

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { listQuestions, getTaxonomyTree, type TaxonomyNode, type QuestionListDTO } from "../../questions/actions";
import { createManualPaper, createBlueprintPaper } from "../actions";
import type { ActionState } from "@/lib/validations";
import { MEDIUMS } from "@/lib/validations";

// ============================================================
//  Types
// ============================================================

interface PaperBuilderProps {
  taxonomy: TaxonomyNode[];
}

interface SectionDraft {
  id: string;
  title: string;
  instructions: string;
  questionIds: string[];
}

interface BlueprintRuleDraft {
  id: string;
  chapterId: string;
  chapterName: string;
  questionType: string;
  count: number;
  marksEach: number;
  difficultyDistribution: { easy: number; medium: number; hard: number };
}

// ============================================================
//  Helpers
// ============================================================

let sectionCounter = 0;
function newSectionId(): string {
  return `section-${Date.now()}-${++sectionCounter}`;
}

let ruleCounter = 0;
function newRuleId(): string {
  return `rule-${Date.now()}-${++ruleCounter}`;
}

function formatQuestionType(type: string): string {
  const map: Record<string, string> = {
    MCQ: "MCQ",
    SHORT_ANSWER: "Short Answer",
    LONG_ANSWER: "Long Answer",
    TRUE_FALSE: "True/False",
    FILL_IN_THE_BLANK: "Fill in the Blanks",
    MATCH_THE_FOLLOWING: "Match the Following",
    CASE_STUDY: "Case Study",
  };
  return map[type] || type;
}

const MEDIUM_LABELS: Record<string, string> = {
  ENGLISH: "English",
  GUJARATI: "Gujarati",
};

// ============================================================
//  Main Component
// ============================================================

export function PaperBuilderClient({ taxonomy }: PaperBuilderProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "blueprint">("manual");
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ActionState | null>(null);

  // Shared paper metadata
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [passingMarks, setPassingMarks] = useState("");
  const [instructions, setInstructions] = useState("");
  const [schoolHeader, setSchoolHeader] = useState("");
  const [watermarkText, setWatermarkText] = useState("");

  // ---- Manual Mode State ----
  const [sections, setSections] = useState<SectionDraft[]>([
    { id: newSectionId(), title: "Section A", instructions: "", questionIds: [] },
  ]);
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0].id);

  // Question search/filter state
  const [qSearch, setQSearch] = useState("");
  const [qMedium, setQMedium] = useState("");
  const [qSubjectId, setQSubjectId] = useState("");
  const [qChapterId, setQChapterId] = useState("");
  const [qType, setQType] = useState("");
  const [qDifficulty, setQDifficulty] = useState("");
  const [questionResults, setQuestionResults] = useState<QuestionListDTO[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [isSearching, startSearchTransition] = useTransition();

  // ---- Blueprint Mode State ----
  const [bpClassLevelId, setBpClassLevelId] = useState("");
  const [bpSubjectId, setBpSubjectId] = useState("");
  const [bpMedium, setBpMedium] = useState("");
  const [rules, setRules] = useState<BlueprintRuleDraft[]>([
    {
      id: newRuleId(),
      chapterId: "",
      chapterName: "",
      questionType: "MCQ",
      count: 2,
      marksEach: 1,
      difficultyDistribution: { easy: 0, medium: 100, hard: 0 },
    },
  ]);

  // ---- Derived Data ----
  const allSelectedIds = new Set(sections.flatMap((s) => s.questionIds));
  const computedTotalMarks = sections.reduce((sum, s) => {
    // We'll use the totalMarks input, but also show a computed value
    return sum;
  }, 0);

  // Taxonomy helpers
  const selectedClass = taxonomy.find((cl) =>
    cl.children.some((s) => s.id === (qSubjectId || subjectId))
  );

  // ---- Question Search ----
  const searchQuestions = useCallback(
    (page = 1) => {
      startSearchTransition(async () => {
        const filters: Record<string, unknown> = {
          page,
          pageSize: 15,
        };
        if (qSearch) filters.search = qSearch;
        if (qMedium) filters.medium = qMedium;
        if (qSubjectId) filters.subjectId = qSubjectId;
        if (qChapterId) filters.chapterId = qChapterId;
        if (qType) filters.questionType = qType;
        if (qDifficulty) filters.difficulty = qDifficulty;

        const result = await listQuestions(filters);
        setQuestionResults(result.items);
        setQuestionTotal(result.meta.total);
        setQuestionPage(page);
      });
    },
    [qSearch, qMedium, qSubjectId, qChapterId, qType, qDifficulty]
  );

  // ---- Section Management ----
  function addSection() {
    const letter = String.fromCharCode(65 + sections.length);
    const newSection: SectionDraft = {
      id: newSectionId(),
      title: `Section ${letter}`,
      instructions: "",
      questionIds: [],
    };
    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newSection.id);
  }

  function removeSection(sectionId: string) {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    if (activeSectionId === sectionId) {
      setActiveSectionId(sections[0].id);
    }
  }

  function updateSection(sectionId: string, updates: Partial<SectionDraft>) {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
    );
  }

  function toggleQuestionInActiveSection(questionId: string) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== activeSectionId) return s;
        const has = s.questionIds.includes(questionId);
        return {
          ...s,
          questionIds: has
            ? s.questionIds.filter((id) => id !== questionId)
            : [...s.questionIds, questionId],
        };
      })
    );
  }

  // ---- Blueprint Rule Management ----
  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        id: newRuleId(),
        chapterId: "",
        chapterName: "",
        questionType: "MCQ",
        count: 2,
        marksEach: 1,
        difficultyDistribution: { easy: 0, medium: 100, hard: 0 },
      },
    ]);
  }

  function removeRule(ruleId: string) {
    if (rules.length <= 1) return;
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  }

  function updateRule(ruleId: string, updates: Partial<BlueprintRuleDraft>) {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r))
    );
  }

  // ---- Submit ----
  async function handleSubmit() {
    setActionState(null);

    const baseMeta = {
      title,
      description,
      duration: duration ? Number(duration) : undefined,
      totalMarks: totalMarks ? Number(totalMarks) : 0,
      passingMarks: passingMarks || undefined,
      instructions,
      schoolHeader,
      watermarkText,
    };

    let result: ActionState;

    if (mode === "manual") {
      const payload = {
        ...baseMeta,
        generationMode: "MANUAL" as const,
        subjectId: subjectId || undefined,
        sections: sections.map((s) => ({
          title: s.title,
          instructions: s.instructions || undefined,
          questionIds: s.questionIds,
        })),
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      result = await createManualPaper(null, fd);
    } else {
      const payload = {
        ...baseMeta,
        generationMode: "BLUEPRINT" as const,
        subjectId: bpSubjectId,
        classLevelId: bpClassLevelId,
        totalMarks: totalMarks ? Number(totalMarks) : rules.reduce((s, r) => s + r.count * r.marksEach, 0),
        rules: rules.map((r) => ({
          chapterId: r.chapterId,
          chapterName: r.chapterName,
          questionType: r.questionType,
          count: r.count,
          marksEach: r.marksEach,
          difficultyDistribution: r.difficultyDistribution,
        })),
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      result = await createBlueprintPaper(null, fd);
    }

    setActionState(result);
    if (result.success && result.id) {
      router.push(`/dashboard/papers/${result.id}`);
    }
  }

  // ---- Blueprint computed totals ----
  const bpComputedTotal = rules.reduce((sum, r) => sum + r.count * r.marksEach, 0);

  // ---- Render ----
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      {/* Left: Main content */}
      <div className="space-y-6">
        {/* Error display */}
        {actionState && !actionState.success && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {actionState.error}
          </div>
        )}

        {/* Paper Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Paper Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Unit Test - 1 Mathematics"
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g., 90"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Marks *</Label>
                <Input
                  type="number"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  placeholder="e.g., 50"
                />
              </div>
              <div className="space-y-2">
                <Label>Passing Marks</Label>
                <Input
                  type="number"
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(e.target.value)}
                  placeholder="e.g., 20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description for this paper"
              />
            </div>
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., All questions are compulsory. Draw diagrams wherever necessary."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "manual" | "blueprint")}>
          <TabsList>
            <TabsTrigger value="manual">
              Manual Mode
            </TabsTrigger>
            <TabsTrigger value="blueprint">
              Blueprint Mode
            </TabsTrigger>
          </TabsList>

          {/* ============ MANUAL MODE ============ */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            {/* Section Tabs */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Sections</CardTitle>
                  <Button variant="outline" size="sm" onClick={addSection}>
                    + Add Section
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Section tabs */}
                <div className="flex flex-wrap gap-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSectionId(section.id)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        activeSectionId === section.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {section.title}
                      <span className="text-xs opacity-60">
                        ({section.questionIds.length})
                      </span>
                      {sections.length > 1 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                          className="ml-1 cursor-pointer text-red-400 hover:text-red-300"
                        >
                          ×
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Active section config */}
                {sections.find((s) => s.id === activeSectionId) && (
                  <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Section Title</Label>
                        <Input
                          value={sections.find((s) => s.id === activeSectionId)?.title || ""}
                          onChange={(e) => updateSection(activeSectionId, { title: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Instructions (optional)</Label>
                        <Input
                          value={sections.find((s) => s.id === activeSectionId)?.instructions || ""}
                          onChange={(e) => updateSection(activeSectionId, { instructions: e.target.value })}
                          placeholder="e.g., Answer all questions"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Question Selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Select Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Input
                    placeholder="Search questions..."
                    value={qSearch}
                    onChange={(e) => setQSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchQuestions()}
                    className="text-sm"
                  />
                  <Select value={qMedium} onValueChange={(v) => { setQMedium(v ?? ""); setQSubjectId(""); setQChapterId(""); }}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All Mediums" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Mediums</SelectItem>
                      {MEDIUMS.map((m) => (
                        <SelectItem key={m} value={m}>{MEDIUM_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={qSubjectId} onValueChange={(v) => { setQSubjectId(v ?? ""); setQChapterId(""); }}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All Subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {taxonomy.flatMap((cl) =>
                        cl.children
                          .filter((s) => !qMedium || s.medium === qMedium)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {cl.name} — {s.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={qType} onValueChange={(v) => setQType(v ?? "")}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "TRUE_FALSE", "FILL_IN_THE_BLANK", "MATCH_THE_FOLLOWING", "CASE_STUDY"].map((t) => (
                        <SelectItem key={t} value={t}>{formatQuestionType(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={qDifficulty} onValueChange={(v) => setQDifficulty(v ?? "")}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All Difficulties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Difficulties</SelectItem>
                      <SelectItem value="EASY">Easy</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HARD">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => searchQuestions()} disabled={isSearching}>
                  {isSearching ? "Searching..." : "Search"}
                </Button>

                {/* Chapter filter (only when subject is selected) */}
                {qSubjectId && (() => {
                  const allChapters = taxonomy
                    .flatMap((cl) => cl.children)
                    .find((s) => s.id === qSubjectId)
                    ?.children || [];
                  return allChapters.length > 0 ? (
                    <Select value={qChapterId} onValueChange={(v) => setQChapterId(v ?? "")}>
                      <SelectTrigger className="w-60 text-sm">
                        <SelectValue placeholder="All Chapters" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Chapters</SelectItem>
                        {allChapters.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null;
                })()}

                {/* Results */}
                {questionResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">{questionTotal} questions found</p>
                    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {questionResults.map((q) => {
                        const isSelected = sections
                          .find((s) => s.id === activeSectionId)
                          ?.questionIds.includes(q.id);
                        return (
                          <div
                            key={q.id}
                            onClick={() => toggleQuestionInActiveSection(q.id)}
                            className={`flex items-start gap-3 rounded-lg border p-3 transition cursor-pointer ${
                              isSelected
                                ? "border-primary/40 bg-primary/10"
                                : "bg-card hover:border-border/80"
                            }`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleQuestionInActiveSection(q.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white line-clamp-2">
                                <KaTeXRenderer text={q.questionText} />
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                  {formatQuestionType(q.questionType)}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] ${
                                  q.difficulty === "EASY" ? "border-emerald-500/30 text-emerald-400" :
                                  q.difficulty === "HARD" ? "border-red-500/30 text-red-400" :
                                  "border-amber-500/30 text-amber-400"
                                }`}>
                                  {q.difficulty}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {q.marks} marks
                                </Badge>
                                {q.chapter && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {q.chapter.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Pagination */}
                    <div className="flex justify-center gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={questionPage <= 1}
                        onClick={() => searchQuestions(questionPage - 1)}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={questionResults.length < 15}
                        onClick={() => searchQuestions(questionPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

                {questionResults.length === 0 && !isSearching && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Use the filters above and click Search to find questions.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ BLUEPRINT MODE ============ */}
          <TabsContent value="blueprint" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Blueprint Rules</CardTitle>
                  <Button variant="outline" size="sm" onClick={addRule}>
                    + Add Rule
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Define how questions should be picked automatically per chapter.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Class & Subject selection */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Medium *</Label>
                    <Select value={bpMedium} onValueChange={(v) => { setBpMedium(v ?? ""); setBpClassLevelId(""); setBpSubjectId(""); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select medium" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDIUMS.map((m) => (
                          <SelectItem key={m} value={m}>{MEDIUM_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Class *</Label>
                    <Select value={bpClassLevelId} onValueChange={(v) => { setBpClassLevelId(v ?? ""); setBpSubjectId(""); }} disabled={!bpMedium}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxonomy
                          .filter((cl) => cl.children.some((s) => s.medium === bpMedium))
                          .map((cl) => (
                            <SelectItem key={cl.id} value={cl.id}>{cl.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject *</Label>
                    <Select value={bpSubjectId} onValueChange={(v) => setBpSubjectId(v ?? "")} disabled={!bpClassLevelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxonomy
                          .find((cl) => cl.id === bpClassLevelId)
                          ?.children
                          .filter((s) => s.medium === bpMedium)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Rules */}
                {rules.map((rule, idx) => {
                  const chapters = taxonomy
                    .flatMap((cl) => cl.children)
                    .find((s) => s.id === bpSubjectId)
                    ?.children || [];

                  return (
                    <div key={rule.id} className="rounded-lg border bg-muted/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Rule {idx + 1}</span>
                        {rules.length > 1 && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => removeRule(rule.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Chapter *</Label>
                          <Select
                            value={rule.chapterId}
                            onValueChange={(v) => {
                              const ch = chapters.find((c) => c.id === v);
                              updateRule(rule.id, { chapterId: v ?? "", chapterName: ch?.name || "" });
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Chapter" />
                            </SelectTrigger>
                            <SelectContent>
                              {chapters.map((ch) => (
                                <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Type *</Label>
                          <Select
                            value={rule.questionType}
                            onValueChange={(v) => updateRule(rule.id, { questionType: v ?? "MCQ" })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["MCQ", "SHORT_ANSWER", "LONG_ANSWER", "TRUE_FALSE", "FILL_IN_THE_BLANK", "MATCH_THE_FOLLOWING", "CASE_STUDY"].map((t) => (
                                <SelectItem key={t} value={t}>{formatQuestionType(t)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Count *</Label>
                          <Input
                            type="number"
                            min={1}
                            value={rule.count}
                            onChange={(e) => updateRule(rule.id, { count: Number(e.target.value) })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Marks Each *</Label>
                          <Input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={rule.marksEach}
                            onChange={(e) => updateRule(rule.id, { marksEach: Number(e.target.value) })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Difficulty distribution */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Difficulty Distribution (must sum to 100%)
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(["easy", "medium", "hard"] as const).map((d) => (
                            <div key={d} className="flex items-center gap-2">
                              <span className={`text-xs capitalize ${
                                d === "easy" ? "text-emerald-400" : d === "hard" ? "text-red-400" : "text-amber-400"
                              }`}>
                                {d}
                              </span>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={rule.difficultyDistribution[d]}
                                onChange={(e) =>
                                  updateRule(rule.id, {
                                    difficultyDistribution: {
                                      ...rule.difficultyDistribution,
                                      [d]: Number(e.target.value),
                                    },
                                  })
                                }
                                className="h-8 w-20 text-sm"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          ))}
                        </div>
                        {rule.difficultyDistribution.easy + rule.difficultyDistribution.medium + rule.difficultyDistribution.hard !== 100 && (
                          <p className="text-xs text-red-400">Must sum to 100%</p>
                        )}
                      </div>

                      {/* Rule subtotal */}
                <p className="text-xs text-muted-foreground">
                        Subtotal: {rule.count} × {rule.marksEach} = <span className="text-foreground font-medium">{rule.count * rule.marksEach} marks</span>
                      </p>
                    </div>
                  );
                })}

                {/* Blueprint summary */}
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-4">
                  <p className="text-sm text-violet-300">
                    Auto-generated total: <span className="font-bold text-violet-200">{bpComputedTotal} marks</span>
                    {" "}from {rules.length} rule(s)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Right: Customization sidebar + Submit */}
      <div className="space-y-6">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="text-base">PDF Customization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>School Header</Label>
              <Textarea
                value={schoolHeader}
                onChange={(e) => setSchoolHeader(e.target.value)}
                placeholder={"Demo High School\nAhmedabad, Gujarat\nPhone: +91 98765 43210"}
                className="text-sm"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Watermark Text</Label>
              <Input
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="e.g., CONFIDENTIAL"
                className="text-sm"
              />
            </div>

            <Separator />

            {/* Summary */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Mode</span>
                <Badge variant="outline" className={mode === "manual" ? "border-primary/30 text-primary" : "border-violet-500/30 text-violet-400"}>
                  {mode === "manual" ? "Manual" : "Blueprint"}
                </Badge>
              </div>
              {mode === "manual" && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sections</span>
                    <span className="text-foreground">{sections.length}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Questions</span>
                    <span className="text-foreground">{sections.reduce((s, sec) => s + sec.questionIds.length, 0)}</span>
                  </div>
                </>
              )}
              {mode === "blueprint" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Blueprint Total</span>
                  <span className="text-foreground">{bpComputedTotal} marks</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Target Marks</span>
                <span className="text-foreground">{totalMarks || "—"}</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isPending || !title}
            >
              {isPending ? "Creating..." : "Create Paper"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
