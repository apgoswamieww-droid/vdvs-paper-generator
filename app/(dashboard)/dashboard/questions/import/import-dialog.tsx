"use client";

// ============================================================
//  Bulk Import Dialog (.docx)
//
//  Teacher picks Subject → Chapter (→ Topic) targeting, uploads
//  a Word file following the template, and sees per-row results.
//  Uses the importQuestionsFromDocx Server Action via useActionState.
// ============================================================

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { importQuestionsFromDocx, type ImportResult } from "./actions";
import type { TaxonomyNode } from "../actions";
import { DOCX_TEMPLATE_SAMPLE } from "@/lib/docx-import";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "cn";

export function ImportDialog({
  open,
  onOpenChange,
  tree,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tree: TaxonomyNode[];
  onImported: () => void;
}) {
  const [state, formAction, pending] = useActionState<ImportResult | null, FormData>(
    importQuestionsFromDocx,
    null
  );

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Toast feedback for the import result (in addition to inline panel)
  useEffect(() => {
    if (!state) return;
    if (state.error) {
      toast.error(state.error);
    } else if (state.success) {
      toast.success(`Import finished — ${state.imported} imported, ${state.failed} failed.`);
    } else {
      toast.error("Import failed — check the errors below.");
    }
  }, [state]);

  async function handleDownloadTemplate() {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/import-template");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "question-import-template.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded. Fill it in and upload it here.");
    } catch {
      toast.error("Could not download the template. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  const subjects = useMemo(() => tree.find((c) => c.id === classId)?.children ?? [], [tree, classId]);
  const chapters = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.children ?? [],
    [subjects, subjectId]
  );
  const topics = useMemo(
    () => chapters.find((c) => c.id === chapterId)?.children ?? [],
    [chapters, chapterId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Questions (.docx)</DialogTitle>
          <DialogDescription>
            Upload a Microsoft Word file following the template. Each question block is separated
            by <code className="mx-1 rounded bg-slate-800 px-1">---</code>.
          </DialogDescription>
        </DialogHeader>

        {/* Download template */}
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-medium">Need the format?</p>
            <p className="text-xs text-muted-foreground">
              Download the ready-made template with instructions and examples for all 7 question types.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={isDownloading}
            className="ml-3 shrink-0 gap-1.5"
          >
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {isDownloading ? "Downloading…" : "Download Template"}
          </Button>
        </div>

        <form action={formAction} className="space-y-4">
          {/* Taxonomy targeting */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select
                items={tree.map((c) => ({ value: c.id, label: c.name }))}
                value={classId || null}
                onValueChange={(v) => {
                  setClassId(typeof v === "string" ? v : "");
                  setSubjectId("");
                  setChapterId("");
                  setTopicId("");
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
              <Select
                items={subjects.map((s) => ({ value: s.id, label: s.name }))}
                value={subjectId || null}
                onValueChange={(v) => {
                  setSubjectId(typeof v === "string" ? v : "");
                  setChapterId("");
                  setTopicId("");
                }}
                disabled={!classId}
              >
                <SelectTrigger className="w-full bg-slate-950">
                  <SelectValue placeholder={classId ? "Select subject" : "Select class first"} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Chapter *</Label>
              <Select
                items={chapters.map((c) => ({ value: c.id, label: c.name }))}
                value={chapterId || null}
                onValueChange={(v) => {
                  setChapterId(typeof v === "string" ? v : "");
                  setTopicId("");
                }}
                disabled={!subjectId}
              >
                <SelectTrigger className="w-full bg-slate-950">
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
            </div>

            <div className="space-y-1.5">
              <Label>Topic (optional)</Label>
              <Select
                items={topics.map((t) => ({ value: t.id, label: t.name }))}
                value={topicId || null}
                onValueChange={(v) => setTopicId(typeof v === "string" ? v : "")}
                disabled={!chapterId}
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

          {/* Hidden taxonomy fields for the action */}
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="chapterId" value={chapterId} />
          <input type="hidden" name="topicId" value={topicId} />

          {/* File */}
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Word file (.docx, max 2 MB)</Label>
            <Input id="import-file" type="file" name="file" accept=".docx" required />
            <p className="text-xs text-slate-500">
              All questions in the file go under the selected chapter/topic.
            </p>
          </div>

          {/* Result panel */}
          {state && !state.error && (
            <div
              className={cn(
                "space-y-2 rounded-lg border p-3 text-sm",
                state.success ? "border-emerald-800 bg-emerald-950/40" : "border-red-800 bg-red-950/40"
              )}
            >
              <p className="font-medium">
                {state.success ? "Import finished" : "Import failed"} — {state.imported} imported,{" "}
                {state.failed} failed out of {state.total}
              </p>
              {state.errors.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {state.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-300">
                      Q{e.row}: {e.error}{" "}
                      <span className="text-slate-500">({e.questionPreview})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {state?.error && (
            <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Close
            </Button>
            <LoadingButton type="submit" loading={pending} loadingText="Importing…">
              Import questions
            </LoadingButton>
          </DialogFooter>
        </form>

        {/* Template guide */}
        <details className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-300">Template guide</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{DOCX_TEMPLATE_SAMPLE}</pre>
          <p className="mt-2">
            Write this content in Word and save as .docx. <code>*</code> after an option marks it
            correct. Gujarati and $...$ math are preserved.
          </p>
        </details>
      </DialogContent>
    </Dialog>
  );
}
