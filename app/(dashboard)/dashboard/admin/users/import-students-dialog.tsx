"use client";

// ============================================================
//  Bulk Import Students dialog — school admin
//
//  Upload the .xlsx template filled with students, get per-row
//  validation errors inline, and a summary when done.
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  Mail,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importStudentsFromExcel, type StudentImportResult } from "./import-students";

/** Builds a CSV the admin can keep/share; BOM keeps Excel happy with UTF-8. */
function credentialsCsv(
  rows: { name: string; email: string; password: string; row: number }[],
  schoolName: string
): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    `# ${schoolName} — imported student credentials (keep private)`,
    "Row,Name,Email,Password",
    ...rows.map((c) => `${c.row},${esc(c.name)},${esc(c.email)},${esc(c.password)}`),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

function CredentialRow({ c }: { c: { name: string; email: string; password: string; row: number } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant="outline" className="shrink-0 text-[10px]">
        Row {c.row}
      </Badge>
      <span className="min-w-0 flex-1 truncate">
        {c.name} · <span className="font-mono">{c.password}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy password for ${c.name}`}
        onClick={() => {
          void navigator.clipboard.writeText(c.password);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function ImportStudentsDialog({
  open,
  onOpenChange,
  schoolName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolName: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  function downloadCredentialsCsv() {
    if (!result?.generatedCredentials.length) return;
    const csv = credentialsCsv(result.generatedCredentials, schoolName);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imported-student-credentials.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function reset() {
    setFile(null);
    setResult(null);
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch("/api/student-import-template");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded — fill it in and upload it here.");
    } catch {
      toast.error("Could not download the template. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setSubmitting(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await importStudentsFromExcel(formData);
      setResult(result);
      if (result.success && result.failed === 0) {
        toast.success(`Imported ${result.imported} student${result.imported === 1 ? "" : "s"}.`);
        reset();
        router.refresh();
      } else if (result.success) {
        toast.warning(`Imported ${result.imported}, ${result.failed} row(s) failed — see below.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Import failed.");
      }
    } catch {
      toast.error("Import failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          onOpenChange(o);
          if (!o) reset();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Students (.xlsx)</DialogTitle>
          <DialogDescription>
            Upload an Excel file of students to add to {schoolName}. Only student accounts are
            created — passwords are set per row.
          </DialogDescription>
        </DialogHeader>

        {/* Template download */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-medium">Need the format?</p>
            <p className="text-xs text-muted-foreground">
              The template has the right columns, examples, and a class dropdown.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="shrink-0 gap-1.5"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Template
          </Button>
        </div>

        {/* File picker */}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-6 text-center transition-colors hover:border-primary/50">
          <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
          {file ? (
            <span className="text-sm font-medium">{file.name}</span>
          ) : (
            <>
              <span className="text-sm font-medium">Click to choose an .xlsx file</span>
              <span className="text-xs text-muted-foreground">Max 2 MB · up to 500 students</span>
            </>
          )}
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        {/* Result report */}
        {result && (
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                {result.imported} imported
              </Badge>
              {result.failed > 0 && (
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
                  {result.failed} failed
                </Badge>
              )}
              {result.emailsSent > 0 && (
                <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400">
                  <Mail className="mr-1 h-3 w-3" />
                  {result.emailsSent} emailed
                </Badge>
              )}
              <span className="text-muted-foreground">of {result.total} rows</span>
            </div>

            {result.generatedCredentials.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-amber-300">
                    Auto-generated passwords — shown once, copy them now
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 gap-1 text-[11px]"
                      onClick={() => {
                        const text = result.generatedCredentials
                          .map((c) => `${c.name}\t${c.email}\t${c.password}`)
                          .join("\n");
                        void navigator.clipboard.writeText(text);
                        setCopiedAll(true);
                        setTimeout(() => setCopiedAll(false), 1500);
                      }}
                    >
                      {copiedAll ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Copy all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 gap-1 text-[11px]"
                      onClick={downloadCredentialsCsv}
                    >
                      <Download className="h-3 w-3" />
                      CSV
                    </Button>
                  </div>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {result.generatedCredentials.map((c) => (
                    <CredentialRow key={c.row} c={c} />
                  ))}
                </div>
                {result.emailsSent === 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Email is not configured — copy the passwords and share them manually.
                  </p>
                )}
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Students must set their own password at first login before they can use the dashboard.
                </p>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Row {e.row}
                    </Badge>
                    <span className="text-rose-400">{e.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={submitting}
          >
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
          <Button type="button" onClick={handleImport} disabled={!file || submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="mr-1 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
