// ============================================================
//  Question option helpers
//
//  `options` is a JSON column whose shape depends on the question
//  type: MCQ stores { kind: "mcq", choices: [...] }, matching stores
//  { kind: "match", pairs: [...] }. Older rows may hold a bare array.
//
//  Also home to the "can this MCQ become a numeric question?" rule.
// ============================================================

export type McqChoice = { label: string; text: string; isCorrect?: boolean };
export type MatchPair = { left: string; right: string };

/** Reads MCQ choices from any of the shapes written over time. */
export function parseMcqOptions(raw: unknown): McqChoice[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as McqChoice[];
  if (typeof raw !== "object") return [];
  const obj = raw as { kind?: string; choices?: unknown };
  if (obj.kind === "mcq" && Array.isArray(obj.choices)) return obj.choices as McqChoice[];
  return [];
}

/** Per-question option layout override. "auto" keeps the 30/80 heuristic. */
export type McqLayoutMode = "auto" | "one-row" | "grid2" | "stacked";

/** Display labels for the option-layout selector (Create/Edit + AI generator). */
export const OPTION_LAYOUT_LABELS: Record<McqLayoutMode, string> = {
  auto: "Auto (by option length)",
  "one-row": "One row",
  grid2: "Two rows (2 × 2)",
  stacked: "One column (stacked)",
};

export const OPTION_LAYOUT_ORDER: McqLayoutMode[] = ["auto", "one-row", "grid2", "stacked"];

/**
 * Reads the per-question layout override stored alongside MCQ choices
 * ({ kind: "mcq", choices, layout }). Legacy rows without a layout key
 * (or stored as a bare array) fall back to "auto".
 */
export function parseMcqLayout(raw: unknown): McqLayoutMode {
  if (!raw || typeof raw !== "object") return "auto";
  const obj = raw as { kind?: string; choices?: unknown; layout?: unknown };
  const mode = obj.layout;
  return mode === "one-row" || mode === "grid2" || mode === "stacked" ? mode : "auto";
}

/** Reads match-the-following pairs. */
export function parseMatchPairs(raw: unknown): MatchPair[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MatchPair[];
  if (typeof raw !== "object") return [];
  const obj = raw as { kind?: string; pairs?: unknown };
  if (obj.kind === "match" && Array.isArray(obj.pairs)) return obj.pairs as MatchPair[];
  return [];
}

// ------------------------------------------------------------
//  Which options are correct?
// ------------------------------------------------------------

/** Loose text comparison form: drops math delimiters, brackets and case. */
function normalizeAnswerText(value: unknown): string {
  return String(value ?? "")
    .replace(/\$/g, "")
    .replace(/\\[()\[\]]/g, "")
    .replace(/[()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Labels of the MCQ choices that are the correct answer(s).
 *
 * `isCorrect` (set by the question editor) is the primary signal. Rows imported
 * from a document often have no flag, so we also match the answer key against a
 * choice's label ("B"), its text, or the label + text form ("(B) 12") — the key
 * is written as any of those in practice.
 *
 * Used to highlight the correct option in the exported solution document.
 * Returns an empty array when nothing matches, so callers can simply check.
 */
export function correctMcqLabels(
  choices: McqChoice[],
  answerKey: string | null | undefined
): string[] {
  const flagged = choices.filter((c) => c.isCorrect);
  if (flagged.length > 0) return flagged.map((c) => c.label);

  const key = normalizeAnswerText(answerKey);
  if (!key) return [];

  return choices
    .filter((choice) => {
      const label = normalizeAnswerText(choice.label);
      const text = normalizeAnswerText(choice.text);
      if (!label) return false;
      if (key === label) return true;
      if (text && key === text) return true;
      // "(B) 12" — the key restates the option, letter first.
      return key === normalizeAnswerText(`${choice.label} ${choice.text}`);
    })
    .map((c) => c.label);
}

// ------------------------------------------------------------
//  Numeric answers
// ------------------------------------------------------------

const LATEX_WRAPPERS = [
  /\\text\{([^{}]*)\}/g,
  /\\mathrm\{([^{}]*)\}/g,
  /\\mathbf\{([^{}]*)\}/g,
  /\\operatorname\{([^{}]*)\}/g,
];

/**
 * Best-effort conversion of a human-written answer into a number.
 * Handles `$…$` KaTeX delimiters, thousands separators, a trailing `%`,
 * `\text{}`-style wrappers and simple `\frac{a}{b}` fractions.
 * Returns null when the text isn't a plain numeric value.
 */
export function parseNumericAnswer(raw: string | null | undefined): number | null {
  if (!raw) return null;

  let s = String(raw).trim();
  if (!s) return null;

  // Simple fractions — the common case for math answer keys.
  const frac = /\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/.exec(s);
  if (frac) {
    const num = Number(frac[1].trim());
    const den = Number(frac[2].trim());
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
    return null;
  }

  for (const re of LATEX_WRAPPERS) s = s.replace(re, "$1");

  s = s
    .replace(/\$/g, "")
    .replace(/\\,|\\;|\\!/g, "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();

  // Reject anything still containing letters (e.g. "5 cm", "x = 5", "25 km").
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type NumericConversion = {
  /** The numeric value extracted from the correct option. */
  value: number;
  /** The original correct-option text, preserved as the answer key. */
  text: string;
  /** Label of the option that was correct (e.g. "B"). */
  label: string;
  /** The choices that would be dropped by the conversion. */
  droppedChoices: McqChoice[];
};

/**
 * Decides whether an MCQ can be turned into a numeric-answer question:
 * it must have exactly one correct choice, and that choice must be a
 * plain numeric value (so the student can type it instead of picking).
 */
export function detectNumericConversion(raw: unknown): NumericConversion | null {
  const choices = parseMcqOptions(raw);
  if (choices.length === 0) return null;

  const correct = choices.filter((c) => c.isCorrect);
  if (correct.length !== 1) return null;

  const value = parseNumericAnswer(correct[0].text);
  if (value === null) return null;

  return {
    value,
    text: correct[0].text,
    label: correct[0].label,
    droppedChoices: choices.filter((c) => !c.isCorrect),
  };
}

export function isNumericConvertible(raw: unknown): boolean {
  return detectNumericConversion(raw) !== null;
}

// ------------------------------------------------------------
//  Display labels
// ------------------------------------------------------------

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  SHORT_ANSWER: "Short Answer",
  LONG_ANSWER: "Long Answer",
  TRUE_FALSE: "True/False",
  FILL_IN_THE_BLANK: "Fill in the Blanks",
  MATCH_THE_FOLLOWING: "Match the Following",
  CASE_STUDY: "Case Study",
  NUMERIC: "Numeric",
};

export function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type;
}

/** Types that are answered by picking from printed options. */
export function hasPrintedOptions(type: string): boolean {
  return type === "MCQ";
}

// ------------------------------------------------------------
//  Adaptive option layout
// ------------------------------------------------------------

export type McqOptionsLayout = 1 | 2 | 4;

const MODE_TO_COLUMNS: Record<Exclude<McqLayoutMode, "auto">, McqOptionsLayout> = {
  "one-row": 4,
  grid2: 2,
  stacked: 1,
};

/**
 * Decides how many grid columns an MCQ's options should use.
 *
 * When `mode` is an explicit override it wins; entries map to:
 * one-row -> 4 columns, grid2 -> 2 columns, stacked -> 1 column.
 *
 * With "auto" it falls back to the length heuristic on the longest option:
 *
 *   - longest option <= 30 chars  -> one row (up to 4 columns)
 *   - longest option <= 80 chars  -> 2x2 grid
 *   - otherwise                   -> single stacked column
 *
 * The result is clamped to the number of options so questions with
 * fewer than 4 choices never leave empty cells. Thresholds are shared
 * by the PDF export and the on-screen previews so both agree.
 */
export function mcqOptionsLayout(
  optionTexts: string[],
  mode: McqLayoutMode = "auto"
): McqOptionsLayout {
  const freeText = optionTexts.map((t) => String(t ?? "").trim());
  if (freeText.length === 0) return 1;

  let cols: McqOptionsLayout;
  if (mode !== "auto") {
    cols = MODE_TO_COLUMNS[mode];
  } else {
    const maxLen = Math.max(...freeText.map((t) => t.length));
    if (maxLen <= 30) cols = 4;
    else if (maxLen <= 80) cols = 2;
    else cols = 1;
  }
  return Math.min(cols, freeText.length) as McqOptionsLayout;
}
