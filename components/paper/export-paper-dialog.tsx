"use client";

// ============================================================
//  Export Paper Dialog
//
//  One place to prepare a download: pick PDF or Word, include the
//  answer key, and fine-tune the page setup. The page settings
//  arrive pre-filled from the paper's saved config and any change
//  here applies to this export only.
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
import { Label } from "@/components/ui/label";
import { FileText, FileType2, Loader2 } from "lucide-react";
import { PageSettingsEditor } from "./page-settings-editor";
import { DEFAULT_PAGE_CONFIG, type PageConfig } from "@/lib/paper-page";

type ExportFormat = "pdf" | "docx";

const FORMATS: {
  value: ExportFormat;
  label: string;
  hint: string;
  endpoint: string;
  ext: string;
  icon: typeof FileText;
}[] = [
  {
    value: "pdf",
    label: "PDF",
    hint: "Print-ready, math formulas rendered",
    endpoint: "/api/export-pdf",
    ext: "pdf",
    icon: FileText,
  },
  {
    value: "docx",
    label: "Word (.docx)",
    hint: "Editable in Word, Google Docs, LibreOffice",
    endpoint: "/api/export-docx",
    ext: "docx",
    icon: FileType2,
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: string;
  paperTitle: string;
  /** The paper's saved page setup — the starting point for each export. */
  savedConfig: PageConfig | null;
};

function fileSafe(title: string): string {
  return title.replace(/[^a-zA-Z0-9]/g, "_") || "paper";
}

export function ExportPaperDialog({
  open,
  onOpenChange,
  paperId,
  paperTitle,
  savedConfig,
}: Props) {
  const [config, setConfig] = useState<PageConfig>(savedConfig ?? DEFAULT_PAGE_CONFIG);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  function handleOpenChange(next: boolean) {
    // Re-seed from the saved config every time the dialog is opened.
    if (next) {
      setConfig(savedConfig ?? DEFAULT_PAGE_CONFIG);
      setIncludeAnswerKey(false);
      setBusy(null);
    }
    onOpenChange(next);
  }

  async function download(format: ExportFormat) {
    const meta = FORMATS.find((f) => f.value === format);
    if (!meta) return;

    setBusy(format);
    try {
      const res = await fetch(meta.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId, includeAnswerKey, pageOverrides: config }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as { error?: string });
        toast.error(err.error || "Export failed. Please try again.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileSafe(paperTitle)}${includeAnswerKey ? "_answer_key" : ""}.${meta.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${meta.label} downloaded.`);
      onOpenChange(false);
    } catch {
      toast.error("Export failed. Please try again.");
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
            Choose a format and adjust the page setup. Changes here apply to this download only —
            save them on the paper to keep them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
            <div>
              <Label className="text-xs">Include answer key</Label>
              <p className="text-[11px] text-muted-foreground">
                {config.answerKeyOnNewPage
                  ? "Answers are collected on their own page."
                  : "Answers print under each question."}
              </p>
            </div>
            <Switch
              checked={includeAnswerKey}
              onCheckedChange={(checked) => setIncludeAnswerKey(Boolean(checked))}
            />
          </div>

          <PageSettingsEditor value={config} onChange={setConfig} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={!!busy}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <Button
                key={f.value}
                onClick={() => void download(f.value)}
                disabled={!!busy}
                title={f.hint}
                className="gap-1.5"
              >
                {busy === f.value ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <f.icon className="h-3.5 w-3.5" />
                )}
                {f.label}
              </Button>
            ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
