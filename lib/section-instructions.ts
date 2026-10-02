// ============================================================
//  Section instructions shown on the paper
//
//  The blueprint generator used to stamp a computed marks summary
//  ("50 × 1 marks = 50 marks") into every auto-created section's
//  `instructions` column. That line duplicated the header and the
//  per-section marks shown next to the title, so it is no longer
//  written — but older rows still carry it. Every renderer goes
//  through `displaySectionInstructions`, which hides that legacy
//  line while leaving anything a teacher typed untouched.
// ============================================================

/** Matches only the exact machine-generated form "N × N marks = N marks". */
const GENERATED_MARKS_LINE =
  /^\s*\d+(?:\.\d+)?\s*\u00d7\s*\d+(?:\.\d+)?\s*marks\s*=\s*\d+(?:\.\d+)?\s*marks\s*$/i;

/** Section instructions to display, or null when there is nothing worth showing. */
export function displaySectionInstructions(
  raw: string | null | undefined
): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  return GENERATED_MARKS_LINE.test(text) ? null : text;
}
