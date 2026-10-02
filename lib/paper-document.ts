// ============================================================
//  Paper document kinds
//
//  A paper is exported as one of four separate documents:
//    • paper       — the question paper itself (student copy)
//    • answer-key  — a numbered answer list, on its own file
//    • solution    — every question with its model answer + solution
//    • omr         — a bubble answer sheet for mobile/scanner OMR
//                    (PDF only — the layout depends on exact print
//                    geometry, so the Word format is refused)
//
//  The kind travels in the export endpoints' request body as
//  `documentType` and drives both the rendered content and the
//  file name, so the two formats (PDF / Word) stay in lockstep.
// ============================================================

export type PaperDocumentType = "paper" | "answer-key" | "solution" | "omr";

export const PAPER_DOCUMENT_TYPES: readonly PaperDocumentType[] = [
  "paper",
  "answer-key",
  "solution",
  "omr",
] as const;

export function isPaperDocumentType(value: unknown): value is PaperDocumentType {
  return (
    typeof value === "string" &&
    (PAPER_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

export const PAPER_DOCUMENT_LABELS: Record<PaperDocumentType, string> = {
  paper: "Paper",
  "answer-key": "Answer key",
  solution: "Solution",
  omr: "OMR sheet",
};

/** File-name suffix for each document kind (empty for the paper itself). */
export function documentFileSuffix(type: PaperDocumentType): string {
  if (type === "answer-key") return "_answer_key";
  if (type === "solution") return "_solution";
  if (type === "omr") return "_omr";
  return "";
}
