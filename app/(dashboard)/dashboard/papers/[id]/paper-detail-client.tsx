"use client";

// ============================================================
//  Paper Detail & Preview — Dark-Only Refactor
// ============================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, showResultToast, showErrorToast, toast } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KaTeXRenderer } from "@/components/shared/katex-text";
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
} from "lucide-react";
import {
  publishPaper,
  updatePaper,
  deletePaper,
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
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Customization
  const [editMode, setEditMode] = useState(false);
  const [schoolHeader, setSchoolHeader] = useState(paper.schoolHeader || "");
  const [watermarkText, setWatermarkText] = useState(paper.watermarkText || "");
  const [instructions, setInstructions] = useState(paper.instructions || "");

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

  async function handleExportPDF(includeAnswerKey: boolean) {
    setIsExporting(true);
    try {
      const response = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, includeAnswerKey }),
      });
      if (!response.ok) {
        const err = await response.json();
        toast.error(err.error || "Failed to export PDF");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = includeAnswerKey
        ? `${paper.title.replace(/[^a-zA-Z0-9]/g, "_")}_answer_key.pdf`
        : `${paper.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`"${paper.title}.pdf" downloaded.`);
    } catch {
      toast.error("Failed to export PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSaveCustomization() {
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ schoolHeader, watermarkText, instructions }));
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
        <div>
          <div className="flex items-center gap-3">
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
            {new Date(paper.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)} className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            {editMode ? "Cancel" : "Customize"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportPDF(false)} disabled={isExporting} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportPDF(true)} disabled={isExporting} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            {isExporting ? "Exporting..." : "Answer Key"}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>School Header (for PDF)</Label>
                <Textarea
                  value={schoolHeader}
                  onChange={(e) => setSchoolHeader(e.target.value)}
                  placeholder={"School Name\nAddress\nPhone"}
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
                <Label className="mt-2">Instructions</Label>
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
          <div className="rounded-lg border bg-white p-8 text-black">
            {/* School Header */}
            {paper.schoolHeader && (
              <div className="mb-4 text-center text-sm whitespace-pre-line">
                {paper.schoolHeader}
              </div>
            )}

            <Separator className="my-4 bg-slate-300" />

            <div className="text-center">
              <h2 className="text-xl font-bold">{paper.title}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {paper.subject?.name && `${paper.subject.name} — `}
                Total Marks: {paper.totalMarks}
                {paper.duration && ` | Duration: ${paper.duration} min`}
              </p>
            </div>

            {paper.instructions && (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="mb-1 font-semibold">Instructions:</p>
                <p className="whitespace-pre-line">{paper.instructions}</p>
              </div>
            )}

            {paper.sections.map((section) => (
              <div key={section.id} className="mt-6">
                <h3 className="mb-3 border-b border-slate-200 pb-1 text-base font-bold">
                  {section.title}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({section.totalMarks} marks)
                  </span>
                </h3>
                {section.instructions && (
                  <p className="mb-2 text-xs italic text-slate-500">
                    {section.instructions}
                  </p>
                )}

                <div className="space-y-3">
                  {section.questions.map((sq, qIdx) => {
                    const marks = sq.marksOverride ?? sq.question.marks;
                    const q = sq.question;
                    const isMCQ = q.questionType === "MCQ";
                    const options =
                      isMCQ && Array.isArray(q.options)
                        ? (q.options as { label: string; text: string; isCorrect: boolean }[])
                        : [];

                    return (
                      <div key={sq.id} className="flex gap-2">
                        <span className="shrink-0 text-sm font-semibold">
                          {qIdx + 1}.
                        </span>
                        <div className="flex-1">
                          <div className="text-sm">
                            <KaTeXRenderer text={q.questionText} />
                          </div>
                          {isMCQ && options.length > 0 && (
                            <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                              {options.map((opt) => (
                                <div key={opt.label} className="flex gap-1">
                                  <span className="font-medium">({opt.label})</span>
                                  <KaTeXRenderer text={opt.text} />
                                </div>
                              ))}
                            </div>
                          )}
                          {showAnswerKey && q.answerKey && (
                            <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 p-1 text-xs text-emerald-700">
                              <strong>Answer:</strong>{" "}
                              <KaTeXRenderer text={q.answerKey} />
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          [{marks}m]
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {paper.watermarkText && (
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center rotate-[-30deg] text-6xl font-bold text-slate-900/5">
                {paper.watermarkText}
              </div>
            )}
          </div>

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
