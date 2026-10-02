"use client";

// ============================================================
//  Client-side paper export
//
//  One place that talks to /api/export-pdf and /api/export-docx,
//  so the export dialog and the quick actions on the paper page
//  always send the same request and produce the same file name.
// ============================================================

import { documentFileSuffix, type PaperDocumentType } from "@/lib/paper-document";
import type { PageConfig } from "@/lib/paper-page";

export type ExportFormat = "pdf" | "docx";

export const EXPORT_FORMATS: {
  value: ExportFormat;
  label: string;
  hint: string;
  endpoint: string;
  ext: string;
}[] = [
  {
    value: "pdf",
    label: "PDF",
    hint: "Print-ready, math formulas rendered",
    endpoint: "/api/export-pdf",
    ext: "pdf",
  },
  {
    value: "docx",
    label: "Word (.docx)",
    hint: "Editable in Word, Google Docs, LibreOffice",
    endpoint: "/api/export-docx",
    ext: "docx",
  },
];

export function fileSafe(title: string): string {
  return title.replace(/[^a-zA-Z0-9]/g, "_") || "paper";
}

/** e.g. "Unit_Test_answer_key.pdf" / "Unit_Test_solution.docx" */
export function exportFileName(
  paperTitle: string,
  documentType: PaperDocumentType,
  format: ExportFormat,
  includeAnswerKey = false
): string {
  const ext = format === "pdf" ? "pdf" : "docx";
  const suffix = documentFileSuffix(documentType) || (includeAnswerKey ? "_answer_key" : "");
  return `${fileSafe(paperTitle)}${suffix}.${ext}`;
}

/**
 * Requests the document and hands the bytes to the browser as a download.
 * Throws with a user-facing message when the server refuses the export.
 */
export async function downloadPaperExport(options: {
  paperId: string;
  paperTitle: string;
  documentType: PaperDocumentType;
  format: ExportFormat;
  includeAnswerKey?: boolean;
  pageOverrides?: PageConfig;
}): Promise<void> {
  const {
    paperId,
    paperTitle,
    documentType,
    format,
    includeAnswerKey = false,
    pageOverrides,
  } = options;

  const meta = EXPORT_FORMATS.find((f) => f.value === format);
  if (!meta) throw new Error("Unsupported export format.");

  const res = await fetch(meta.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paperId, documentType, includeAnswerKey, pageOverrides }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Export failed. Please try again.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(paperTitle, documentType, format, includeAnswerKey);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
