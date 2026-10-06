"use client";

// ============================================================
//  Export Paper Dialog
//
//  One place to prepare a download. Pick which document you want —
//  the question paper, its answer key, or its full solution — then
//  the format (PDF / Word) and the page setup. The answer key and
//  the solution are always produced as their own separate files.
//
//  The page settings arrive pre-filled from the paper's saved config
//  and any change here applies to this export only.
// ============================================================

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SETS, SET_LABELS, normalizeSetCount } from "@/lib/paper-sets";
import { FileText, FileType2, Grid3x3, KeyRound, Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageSettingsEditor } from "./page-settings-editor";
import { DEFAULT_PAGE_CONFIG, type PageConfig } from "@/lib/paper-page";
import { PAPER_DOCUMENT_LABELS, type PaperDocumentType } from "@/lib/paper-document";
import {
  EXPORT_FORMATS,
  downloadPaperExport,
  type ExportFormat,
} from "@/lib/paper-export-client";

const DOCUMENTS: {
  value: PaperDocumentType;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  {
    value: "paper",
    label: PAPER_DOCUMENT_LABELS.paper,
    hint: "The question paper as the students receive it.",
    icon: FileText,
  },
  {
    value: "answer-key",
    label: PAPER_DOCUMENT_LABELS["answer-key"],
    hint: "Numbered answers only, in a document of its own.",
    icon: KeyRound,
  },
  {
    value: "solution",
    label: PAPER_DOCUMENT_LABELS.solution,
    hint: "Every question with its model answer and workings.",
    icon: Lightbulb,
  },
  {
    value: "omr",
    label: PAPER_DOCUMENT_LABELS.omr,
    hint: "Bubble answer sheet for mobile/scanner OMR (PDF only).",
    icon: Grid3x3,
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: string;
  paperTitle: string;
  /** The paper's saved page setup — the starting point for each export. */
  savedConfig: PageConfig | null;
  /** How many sets the paper is configured for (Set A / Set B …). */
  setCount?: number;
};

export function ExportPaperDialog({
  open,
  onOpenChange,
  paperId,
  paperTitle,
  savedConfig,
  setCount = 1,
}: Props) {
  const [documentType, setDocumentType] = useState<PaperDocumentType>("paper");
  const [config, setConfig] = useState<PageConfig>(savedConfig ?? DEFAULT_PAGE_CONFIG);
  // Only meaningful for the paper itself: a clean student copy by default,
  // since the answers now have their own separate documents.
  const [includeAnswerKey, setIncludeAnswerKey] = useState(false);
  // How many sets this download contains — defaults to the paper's own count.
  const [sets, setSets] = useState(normalizeSetCount(setCount));
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  function handleOpenChange(next: boolean) {
    // Re-seed from the saved config every time the dialog is opened.
    if (next) {
      setConfig(savedConfig ?? DEFAULT_PAGE_CONFIG);
      setIncludeAnswerKey(false);
      setDocumentType("paper");
      setSets(normalizeSetCount(setCount));
      setBusy(null);
    }
    onOpenChange(next);
  }

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      await downloadPaperExport({
        paperId,
        paperTitle,
        documentType,
        format,
        includeAnswerKey:
          documentType === "paper" || documentType === "omr" ? includeAnswerKey : false,
        pageOverrides: config,
        setCount: sets,
      });
      toast.success(`${PAPER_DOCUMENT_LABELS[documentType]} downloaded.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export paper</DialogTitle>
          <DialogDescription>
            Choose what to download and in which format. The answer key, the solution and the OMR
            answer sheet are always generated as separate documents. Page setup changes apply to
            this download only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document kind */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {DOCUMENTS.map((doc) => {
              const active = documentType === doc.value;
              return (
                <button
                  key={doc.value}
                  type="button"
                  onClick={() => setDocumentType(doc.value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-muted/30 hover:bg-muted/60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <doc.icon
                      className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="text-xs font-semibold">{doc.label}</span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {doc.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sets — every set reshuffles questions and options, so the key,
              solution and OMR sheet are produced set-wise in the same file. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
            <div>
              <Label className="text-xs">Sets in this export</Label>
              <p className="text-[11px] text-muted-foreground">
                {sets > 1
                  ? `Set A–${SET_LABELS[sets - 1]} in one file: sets B onward reshuffle the question order and the MCQ options, and each set gets its own answer key, solution and OMR sheet.`
                  : "One set. Raise this to export every set of the paper in a single file."}
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={MAX_SETS}
              value={sets}
              onChange={(e) => setSets(normalizeSetCount(e.target.value))}
              className="h-8 w-20 shrink-0 text-sm"
              aria-label="Number of sets"
            />
          </div>

          {/* Answers — the paper prints them inline/on a page; the OMR sheet
              shades the correct bubbles into a scoring master copy. */}
          {(documentType === "paper" || documentType === "omr") && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
              <div>
                <Label className="text-xs">
                  {documentType === "omr" ? "Fill correct answers (master copy)" : "Print answers on the paper too"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {documentType === "omr"
                    ? !includeAnswerKey
                      ? "Off — a blank student sheet."
                      : "Correct bubbles are printed solid black for scoring."
                    : !includeAnswerKey
                      ? "Off — this export is a clean student copy."
                      : config.answerKeyOnNewPage
                        ? "Answers are collected on their own page."
                        : "Answers print under each question."}
                </p>
              </div>
              <Switch
                checked={includeAnswerKey}
                onCheckedChange={(checked) => setIncludeAnswerKey(Boolean(checked))}
              />
            </div>
          )}

          <PageSettingsEditor
            value={config}
            onChange={(next) => {
              setConfig(next);
              // "Answer key on a new page" is a placement choice — turn the key
              // itself on too, so flipping that switch can never silently drop
              // the answers from the paper export.
              if (next.answerKeyOnNewPage && documentType === "paper") setIncludeAnswerKey(true);
            }}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={!!busy}>
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((f) => {
              const Icon = f.value === "pdf" ? FileText : FileType2;
              // The OMR sheet is a PDF-only document: its layout depends on
              // exact print geometry (registration marks, bubble positions).
              const omrPdfOnly = documentType === "omr" && f.value === "docx";
              return (
                <Button
                  key={f.value}
                  onClick={() => void download(f.value)}
                  disabled={!!busy || omrPdfOnly}
                  title={omrPdfOnly ? "OMR sheet exports as PDF only." : f.hint}
                  className="gap-1.5"
                >
                  {busy === f.value ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {f.label}
                </Button>
              );
            })}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
