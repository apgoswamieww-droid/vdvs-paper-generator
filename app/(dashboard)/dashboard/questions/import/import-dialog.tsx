"use client";

// ============================================================
//  Bulk Import Questions (.docx, table format)
//
//  Three steps in one dialog:
//    1. Pick the taxonomy and download the template.
//    2. Upload the filled file — the server parses it and returns a
//       preview WITHOUT writing anything.
//    3. Review the preview, fix anything flagged, then commit.
//
//  Step 2 exists because the previous importer wrote every row inside a
//  single transaction: one bad cell discarded the whole file, and the
//  teacher saw per-row counts that did not match what was saved. Parsing
//  separately makes the numbers honest and lets a teacher fix a row
//  instead of re-exporting from Word.
// ============================================================

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KaTeXRenderer } from "@/components/shared/katex-text";
import { cn } from "cn";
import type { TaxonomyNode } from "../actions";
import { nodeLabel, taxLabel } from "@/lib/taxonomy-label";
import {
  commitImport,
  parseImportFile,
  type ImportPreviewRow,
  type ImportRowError,
} from "./actions";

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
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Preview state — set once the server has parsed an upload.
  const [preview, setPreview] = useState<{
    fileName: string;
    contentHash: string;
    rows: ImportPreviewRow[];
    errors: ImportRowError[];
    targetingMismatch: string | null;
    blankBoxes: number;
  } | null>(null);
  const [committed, setCommitted] = useState<{ imported: number; failed: number } | null>(null);

  const [parsing, startParse] = useTransition();
  const [committing, startCommit] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const subjects = useMemo(
    () => tree.find((c) => c.id === classId)?.children ?? [],
    [tree, classId]
  );
  const chapters = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.children ?? [],
    [subjects, subjectId]
  );
  const topics = useMemo(
    () => chapters.find((c) => c.id === chapterId)?.children ?? [],
    [chapters, chapterId]
  );

  const readyToDownload = !!subjectId && !!chapterId;
  const readyToParse = readyToDownload && !!file;

  // A row with a problem must be corrected before the batch is saved, so
  // the commit button stays disabled while any error stands.
  const hasBlockingErrors = (preview?.errors.length ?? 0) > 0;

  function resetAll() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDownloadTemplate() {
    if (!readyToDownload) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ subjectId, chapterId, count: "10" });
      if (topicId) params.set("topicId", topicId);
      const res = await fetch(`/api/import-template?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not download the template.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "question-import-template.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded. Fill it in and upload it below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the template.");
    } finally {
      setIsDownloading(false);
    }
  }

  function handleParse() {
    if (!file || !readyToDownload) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subjectId", subjectId);
    formData.append("chapterId", chapterId);
    formData.append("topicId", topicId);

    startParse(async () => {
      const result = await parseImportFile(formData);
      if (!result.ok) {
        toast.error(result.error ?? "Could not read that file.");
        setPreview(null);
        return;
      }
      setCommitted(null);
      setPreview({
        fileName: result.fileName,
        contentHash: result.contentHash,
        rows: result.rows,
        errors: result.errors,
        targetingMismatch: result.targetingMismatch,
        blankBoxes: result.blankBoxes,
      });

      if (result.errors.length > 0) {
        toast.error(
          `${result.errors.length} row(s) need attention — fix them in Word and upload again.`
        );
      } else if (result.rows.length === 0) {
        toast.warning("No questions were filled in.");
      } else {
        toast.success(`${result.rows.length} question(s) ready to import.`);
      }
    });
  }

  function handleCommit() {
    if (!preview || hasBlockingErrors || preview.rows.length === 0) return;

    startCommit(async () => {
      const result = await commitImport({
        fileName: preview.fileName,
        contentHash: preview.contentHash,
        targets: { subjectId, chapterId, topicId: topicId || null },
        rows: preview.rows,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Could not import those questions.");
        return;
      }

      setCommitted({ imported: result.imported, failed: result.failed });
      setPreview(null);
      resetAll();
      onImported();
      toast.success(
        result.failed > 0
          ? `${result.imported} imported, ${result.failed} skipped.`
          : `${result.imported} question(s) imported — awaiting review.`
      );
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAll();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Questions (.docx)</DialogTitle>
          <DialogDescription>
            Download the template for a chapter, fill in the boxes, then upload it. Each
            question is one table — nothing to memorise beyond typing over the grey hints.
          </DialogDescription>
        </DialogHeader>

        {/* 1 — taxonomy + template */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select
              items={tree.map((c) => ({ value: c.id, label: nodeLabel(c) }))}
              value={classId || null}
              onValueChange={(v) => {
                setClassId(typeof v === "string" ? v : "");
                setSubjectId("");
                setChapterId("");
                setTopicId("");
                resetAll();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {tree.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {nodeLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Subject *</Label>
            <Select
              items={subjects.map((s) => ({
                value: s.id,
                label: taxLabel(s.name, s.questionCount),
              }))}
              value={subjectId || null}
              onValueChange={(v) => {
                setSubjectId(typeof v === "string" ? v : "");
                setChapterId("");
                setTopicId("");
                resetAll();
              }}
              disabled={!classId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={classId ? "Select subject" : "Select class first"} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {taxLabel(s.name, s.questionCount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Chapter *</Label>
            <Select
              items={chapters.map((c) => ({
                value: c.id,
                label: taxLabel(c.name, c.questionCount),
              }))}
              value={chapterId || null}
              onValueChange={(v) => {
                setChapterId(typeof v === "string" ? v : "");
                setTopicId("");
                resetAll();
              }}
              disabled={!subjectId}
            >
              <SelectTrigger className="w-full">
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
          </div>

          <div className="space-y-1.5">
            <Label>Topic (optional)</Label>
            <Select
              items={topics.map((t) => ({
                value: t.id,
                label: taxLabel(t.name, t.questionCount),
              }))}
              value={topicId || null}
              onValueChange={(v) => {
                setTopicId(typeof v === "string" ? v : "");
                resetAll();
              }}
              disabled={!chapterId}
            >
              <SelectTrigger className="w-full">
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
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="font-[Nunito] text-sm font-medium">Step 1 — get the template</p>
            <p className="font-[Nunito] text-xs text-muted-foreground">
              It records the chapter, so the questions land in the right place.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={!readyToDownload || isDownloading}
            className="shrink-0 gap-1.5 font-[Nunito]"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isDownloading ? "Building…" : "Download template"}
          </Button>
        </div>

        {/* 2 — upload */}
        <div className="space-y-1.5">
          <Label htmlFor="import-file">Step 2 — upload the filled template</Label>
          <Input
            id="import-file"
            type="file"
            accept=".docx"
            disabled={!readyToDownload}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setCommitted(null);
            }}
          />
          <p className="font-[Nunito] text-xs text-muted-foreground">
            Saved as .docx, max 2 MB. Nothing is saved until you confirm the preview.
          </p>
        </div>

        {/* Gated on `file`, not `preview`: this button is the only trigger for
            parseImportFile, and `preview` starts null — guarding on it meant the
            button never rendered, so selecting a file did nothing at all. */}
        {file && (
          <LoadingButton
            type="button"
            variant="outline"
            onClick={handleParse}
            loading={parsing}
            loadingText="Reading…"
            disabled={!readyToParse}
            className="w-full gap-1.5 font-[Nunito]"
          >
            <FileCheck2 className="h-4 w-4" />
            {preview ? "Re-read the file" : "Read the file"}
          </LoadingButton>
        )}

        {/* 3 — preview */}
        {preview && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="font-[Rasa] flex items-center justify-between text-lg font-semibold">
                Step 3 — review
                <Badge variant="outline" className="font-[Nunito] text-[10px]">
                  {preview.fileName}
                </Badge>
              </CardTitle>
              <CardDescription className="font-[Nunito] text-xs">
                {preview.rows.length} question(s) read
                {preview.blankBoxes > 0 && ` · ${preview.blankBoxes} blank box(es) skipped`}.
                Imported questions arrive as <strong>PENDING</strong> and stay out of papers
                until a teacher approves them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {preview.targetingMismatch && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p className="font-[Nunito] text-xs text-amber-300">
                    {preview.targetingMismatch}
                  </p>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="font-[Nunito] text-sm font-semibold text-red-300">
                    {preview.errors.length} row(s) cannot be imported
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {preview.errors.map((e, i) => (
                      <li key={i} className="font-[Nunito] text-xs text-red-300/90">
                        <strong>Q{e.index}</strong> — {e.message}
                        {e.preview && (
                          <span className="text-red-300/60"> ({e.preview})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 font-[Nunito] text-xs text-red-300/80">
                    Fix these in Word and upload the file again — nothing is saved until every
                    row is valid.
                  </p>
                </div>
              )}

              {preview.rows.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead className="w-16">Marks</TableHead>
                        <TableHead className="w-20">Medium</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((r) => (
                        <TableRow key={r.index}>
                          <TableCell className="font-[Nunito] text-xs tabular-nums">
                            {r.index}
                          </TableCell>
                          <TableCell>
                            <KaTeXRenderer
                              text={r.questionText}
                              className="font-[Nunito] line-clamp-2 text-xs"
                            />
                            {r.options.length > 0 && (
                              <p className="font-[Nunito] mt-0.5 truncate text-[11px] text-muted-foreground">
                                {r.options
                                  .map((o) => `${o.label}) ${o.text}${o.isCorrect ? " ✓" : ""}`)
                                  .join("  ")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="font-[Nunito] text-[11px] text-muted-foreground">
                            {r.questionType.replace(/_/g, " ").toLowerCase()}
                          </TableCell>
                          <TableCell className="font-[Nunito] text-xs tabular-nums">
                            {r.marks}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "font-[Nunito] text-[11px]",
                              r.medium === "GUJARATI" ? "text-amber-400" : "text-muted-foreground"
                            )}
                          >
                            {r.medium === "GUJARATI" ? "Gujarati" : "English"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {committed && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="font-[Nunito] text-sm text-emerald-300">
              {committed.imported} question(s) imported
              {committed.failed > 0 && `, ${committed.failed} skipped`}. They are awaiting
              review — approve them from Review Questions before using them in a paper.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {preview && !hasBlockingErrors && preview.rows.length > 0 && (
            <LoadingButton
              type="button"
              onClick={handleCommit}
              loading={committing}
              loadingText="Importing…"
            >
              Import {preview.rows.length} question(s)
            </LoadingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}