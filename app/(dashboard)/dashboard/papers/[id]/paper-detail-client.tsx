"use client";

// ============================================================
//  Paper Detail & Preview — Dark-Only Refactor
// ============================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateISO } from "@/lib/utils";
import { ConfirmDialog, showResultToast, showErrorToast, toast } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HeaderRenderer } from "@/components/paper/header-renderer";
import { PageSettingsEditor } from "@/components/paper/page-settings-editor";
import { PaperSheet } from "@/components/paper/paper-sheet";
import { ExportPaperDialog } from "@/components/paper/export-paper-dialog";
import { ReplaceQuestionDialog } from "@/components/paper/replace-question-dialog";
import {
  DEFAULT_PAGE_CONFIG,
  normalizePageConfig,
  type PageConfig,
} from "@/lib/paper-page";
import { mcqOptionsLayout, parseMcqLayout, parseMcqOptions } from "@/lib/question-options";
import { displaySectionInstructions } from "@/lib/section-instructions";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { downloadPaperExport } from "@/lib/paper-export-client";
import { PAPER_DOCUMENT_LABELS, type PaperDocumentType } from "@/lib/paper-document";
import {
  EMPTY_HEADER,
  buildHeaderContext,
  defaultHeaderFromSchool,
  isCanvasHeader,
} from "@/lib/paper-header";
import {
  Download,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle,
  Clock,
  Hash,
  Users,
  Settings,
  Loader2,
  ArrowLeft,
  Repeat2,
  KeyRound,
  Lightbulb,
  Grid3x3,
} from "lucide-react";
import {
  publishPaper,
  updatePaper,
  deletePaper,
  replacePaperQuestion,
  type PaperDetailDTO,
} from "../actions";
import type { ActionState } from "@/lib/validations";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  DRAFT: { color: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: Clock },
  PUBLISHED: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: CheckCircle },
  ARCHIVED: { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20", icon: FileText },
};

export function PaperDetailClient({ paper }: { paper: PaperDetailDTO }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Which standalone document the header's quick-action buttons are fetching.
  const [quickExporting, setQuickExporting] = useState<PaperDocumentType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{
    sectionId: string;
    questionId: string;
    questionText: string;
  } | null>(null);

  // Customization
  const [editMode, setEditMode] = useState(false);

  // The header comes from the school's reusable design (single source of
  // truth) — papers no longer store their own copy.
  const headerConfig = useMemo(
    () =>
      paper.school?.headerConfig ??
      (paper.school ? defaultHeaderFromSchool(paper.school) : EMPTY_HEADER),
    [paper.school]
  );
  const [watermarkText, setWatermarkText] = useState(paper.watermarkText || "");
  const [instructions, setInstructions] = useState(paper.instructions || "");
  const [pageConfig, setPageConfig] = useState<PageConfig>(() =>
    normalizePageConfig(paper.pageConfig ?? DEFAULT_PAGE_CONFIG)
  );

  const headerContext = useMemo(
    () =>
      buildHeaderContext({
        paperTitle: paper.title,
        date: new Date(paper.createdAt),
        className: paper.subject?.classLevel?.name ?? "",
        subjectName: paper.subject?.name ?? "",
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        school: {
          name: paper.school?.name ?? "",
          logoUrl: paper.school?.logoUrl ?? null,
          address: paper.school?.address ?? null,
          phone: paper.school?.phone ?? null,
          board: paper.school?.board ?? null,
          academicYear: paper.school?.academicYear ?? null,
        },
      }),
    [paper]
  );

  const statusCfg = STATUS_CONFIG[paper.status] || STATUS_CONFIG.DRAFT;
  const StatusIcon = statusCfg.icon;

  function handlePublish() {
    startTransition(async () => {
      try {
        const result = await publishPaper(paper.id);
        setActionState(result);
        showResultToast(result, { successMessage: "Paper published." });
        if (result.success) router.refresh();
      } catch {
        showErrorToast();
      }
    });
  }

  function handleDelete() {
    setShowDeleteConfirm(false);
    startTransition(async () => {
      try {
        const result = await deletePaper(paper.id);
        if (result.success) {
          toast.success("Paper deleted.");
          router.push("/dashboard/papers");
        } else {
          showResultToast(result);
        }
      } catch {
        showErrorToast();
      }
    });
  }

  async function handleReplaceQuestion(newQuestionId: string) {
    if (!replaceTarget) return;
    try {
      const result = await replacePaperQuestion({
        sectionId: replaceTarget.sectionId,
        currentQuestionId: replaceTarget.questionId,
        newQuestionId,
      });
      setActionState(result);
      showResultToast(result, { successMessage: "Question replaced." });
      if (result.success) {
        setReplaceTarget(null);
        router.refresh();
      }
    } catch {
      showErrorToast();
    }
  }

  /**
   * Quick actions: the answer key and the solution are separate documents, so
   * they get their own buttons that download straight away (PDF, using the
   * paper's saved page setup). The dialog stays for choosing another format.
   */
  async function handleQuickExport(documentType: PaperDocumentType) {
    setQuickExporting(documentType);
    try {
      await downloadPaperExport({
        paperId: paper.id,
        paperTitle: paper.title,
        documentType,
        format: "pdf",
      });
      toast.success(`${PAPER_DOCUMENT_LABELS[documentType]} downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setQuickExporting(null);
    }
  }

  async function handleSaveCustomization() {
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ watermarkText, instructions, pageConfig }));
    const result = await updatePaper(paper.id, null, fd);
    setActionState(result);
    showResultToast(result, { successMessage: "Customization saved." });
    if (result.success) {
      setEditMode(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/papers")}
            className="shrink-0"
            aria-label="Back to papers"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-[Rasa] text-2xl font-bold tracking-tight">{paper.title}</h1>
              <Badge variant="outline" className={statusCfg.color}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {paper.status}
              </Badge>
              <Badge
                variant="outline"
                className={
                  paper.generationMode === "MANUAL"
                    ? "border-primary/30 text-primary"
                    : "border-violet-500/30 text-violet-400"
                }
              >
                {paper.generationMode}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Created by {paper.createdBy?.name || paper.createdBy?.email} on{" "}
              {formatDateISO(paper.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)} className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            {editMode ? "Cancel" : "Customize"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleQuickExport("answer-key")}
            disabled={!!quickExporting}
            className="gap-1.5"
            title="Download this paper's answer key as a separate PDF"
          >
            {quickExporting === "answer-key" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            Answer Key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleQuickExport("solution")}
            disabled={!!quickExporting}
            className="gap-1.5"
            title="Download a separate PDF with every question solved"
          >
            {quickExporting === "solution" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lightbulb className="h-3.5 w-3.5" />
            )}
            Solution
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleQuickExport("omr")}
            disabled={!!quickExporting}
            className="gap-1.5"
            title="Download a bubble answer sheet (PDF) for mobile/scanner OMR"
          >
            {quickExporting === "omr" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Grid3x3 className="h-3.5 w-3.5" />
            )}
            OMR Sheet
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          {paper.status === "DRAFT" && (
            <Button size="sm" onClick={handlePublish} disabled={isPending} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              {isPending ? "Publishing…" : "Publish"}
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={isPending} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Error/Success */}
      {actionState && !actionState.success && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionState.error}
        </div>
      )}
      {actionState && actionState.success && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {actionState.message}
        </div>
      )}

      {/* Customization Panel */}
      {editMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paper Customization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Page Layout (PDF &amp; Word)</Label>
              <PageSettingsEditor value={pageConfig} onChange={setPageConfig} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Watermark Text</Label>
                <Input
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g., CONFIDENTIAL"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="text-sm"
                  rows={3}
                />
              </div>
            </div>
          <Button size="sm" onClick={handleSaveCustomization} className="gap-1.5" disabled={isPending}>
            <Settings className="h-3.5 w-3.5" />
            Save Customization
          </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Marks", value: paper.totalMarks, icon: Hash },
          { label: "Passing Marks", value: paper.passingMarks ?? "—", icon: CheckCircle },
          { label: "Duration", value: paper.duration ? `${paper.duration} min` : "—", icon: Clock },
          { label: "Questions", value: paper.sections.reduce((sum, s) => sum + s.questions.length, 0), icon: Users },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <stat.icon className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paper Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Paper Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <PaperSheet config={pageConfig}>
            {/* School Header */}
            {headerConfig.rows.length > 0 || isCanvasHeader(headerConfig) ? (
              <HeaderRenderer
                config={headerConfig}
                context={headerContext}
                logoUrl={paper.school?.logoUrl ?? null}
                className="mb-4"
              />
            ) : (
              paper.schoolHeader && (
                <div className="mb-4 text-center text-sm whitespace-pre-line">
                  {paper.schoolHeader}
                </div>
              )
            )}

            <Separator className="my-4 bg-slate-300" />

            {instructions && (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="mb-1 font-semibold">Instructions:</p>
                <p className="whitespace-pre-line">{instructions}</p>
              </div>
            )}

            <div
              style={
                pageConfig.columns === 2
                  ? { columnCount: 2, columnGap: "2rem", columnRule: "1px solid #1a1a1a", columnFill: "balance" }
                  : undefined
              }
            >
            {paper.sections.map((section, sIdx) => {
              // Continuous numbering across sections — matches every export.
              const numberOffset = paper.sections
                .slice(0, sIdx)
                .reduce((sum, s) => sum + s.questions.length, 0);
              return (
              <div key={section.id} className="mt-6">
                <h3 className="mb-3 border-b border-slate-200 pb-1 text-base font-bold">
                  {section.title}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({section.totalMarks} marks)
                  </span>
                </h3>
                {displaySectionInstructions(section.instructions) && (
                  <p className="mb-2 text-xs italic text-slate-500">
                    {displaySectionInstructions(section.instructions)}
                  </p>
                )}

                <div className="space-y-3">
                  {section.questions.map((sq, qIdx) => {
                    const q = sq.question;
                    const isMCQ = q.questionType === "MCQ";
                    const options = isMCQ ? parseMcqOptions(q.options) : [];

                    return (
                      <div key={sq.id} className="flex gap-2">
                        <span className="shrink-0 text-sm font-semibold">
                          {numberOffset + qIdx + 1}.
                        </span>
                        <div className="flex-1">
                          <div className="text-sm">
                            <KaTeXRenderer text={q.questionText} />
                          </div>
                          {isMCQ && options.length > 0 && (
                            <div
                              className="mt-1 grid gap-1 text-xs"
                              style={{
                                gridTemplateColumns: `repeat(${mcqOptionsLayout(
                                  options.map((o) => o.text),
                                  parseMcqLayout(q.options)
                                )}, minmax(0, 1fr))`,
                              }}
                            >
                              {options.map((opt) => (
                                <div key={opt.label} className="flex gap-1">
                                  <span className="font-medium">({opt.label})</span>
                                  <KaTeXRenderer text={opt.text} />
                                </div>
                              ))}
                            </div>
                          )}
                          {q.questionType === "NUMERIC" && (
                            <p className="mt-1 text-xs text-slate-500">
                              Answer: ____________________
                            </p>
                          )}
                          {showAnswerKey && q.answerKey && (
                            <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 p-1 text-xs text-emerald-700">
                              <strong>Answer:</strong>{" "}
                              <KaTeXRenderer text={q.answerKey} />
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="gap-1"
                            title="Swap this question for another from the bank"
                            onClick={() =>
                              setReplaceTarget({
                                sectionId: section.id,
                                questionId: q.id,
                                questionText: q.questionText,
                              })
                            }
                          >
                            <Repeat2 className="h-3 w-3" />
                            Replace
                          </Button>
                        </div>
                      </div>
                    );
                  })}
</div>
                </div>
                );
              })}
            </div>

            {watermarkText && (
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center rotate-[-30deg] text-6xl font-bold text-slate-900/5">
                {watermarkText}
              </div>
            )}
          </PaperSheet>

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className="gap-1.5"
            >
              {showAnswerKey ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide Answer Key
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Show Answer Key
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ReplaceQuestionDialog
        open={!!replaceTarget}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
        current={
          replaceTarget
            ? { id: replaceTarget.questionId, questionText: replaceTarget.questionText }
            : null
        }
        excludeIds={paper.sections.flatMap((s) => s.questions.map((sq) => sq.question.id))}
        onSelect={(replacement) => void handleReplaceQuestion(replacement.id)}
      />

      <ExportPaperDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        paperId={paper.id}
        paperTitle={paper.title}
        savedConfig={paper.pageConfig}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this paper?"
        description={`"${paper.title}" and all its sections will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        loading={isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
