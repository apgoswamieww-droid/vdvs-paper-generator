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
