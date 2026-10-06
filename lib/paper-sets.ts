// ============================================================
//  Paper sets (Set A / Set B …)
//
//  A paper can be exported as several sets. Nothing is stored per
//  set — every set is derived from the paper with a deterministic
//  seed (paper id + set index), so the same export always produces
//  the same sets:
//
//    • Set A (index 0) is the paper exactly as authored.
//    • Sets B… are shuffled: the question order inside each section
//      changes and MCQ options are reordered with their labels
//      (A/B/C/D) reassigned, so each set needs its own answer key,
//      solution and OMR sheet.
// ============================================================

import { correctMcqLabels, parseMcqOptions } from "@/lib/question-options";

/** Highest number of sets a paper may be exported as. */
export const MAX_SETS = 8;

/** SET_LABELS[i] labels set number i+1 — "A", "B", … */
export const SET_LABELS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;

/** 0-based set index → printable label ("A" for the first set). */
export function setLabel(index: number): string {
  return SET_LABELS[index] ?? String(index + 1);
}

/** Clamps anything coming from a form/DB column into 1…MAX_SETS. */
export function normalizeSetCount(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_SETS, Math.max(1, Math.round(n)));
}

/** True when the paper is exported as more than one set. */
export function hasMultipleSets(setCount: unknown): boolean {
  return normalizeSetCount(setCount) > 1;
}

// ------------------------------------------------------------
//  Deterministic randomness
// ------------------------------------------------------------

/** FNV-1a string hash → 32-bit integer seed. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, well-distributed PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by a seed — the same items + seed always
 * produce the same order, which is what keeps regenerated sets stable.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------------
//  MCQ option reshuffling
// ------------------------------------------------------------

/**
 * Rewrites an answer key after the option labels moved.
 *
 * Keys are written in several shapes in practice ("B", "(B)", "(B) 12",
 * "12", "Hydrogen"). Only the label-carrying shapes need rewriting — a key
 * that names the option's text is still correct whatever the order, so it is
 * left untouched.
 */
function remapAnswerKey(
  answerKey: string | null,
  oldLabelToNew: Map<string, string>,
  correctBefore: string[]
): string | null {
  if (!answerKey || correctBefore.length === 0) return answerKey;

  const bare = answerKey.replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  const lower = bare.toLowerCase();

  // "B" / "b" — the key is a bare label.
  for (const [oldLabel, newLabel] of oldLabelToNew) {
    if (oldLabel.toLowerCase() === lower) return newLabel;
  }

  // "(B) 12" / "B. 12" — label first, then the option text.
  for (const [oldLabel, newLabel] of oldLabelToNew) {
    const prefix = `${oldLabel.toLowerCase()}.`;
    if (lower.startsWith(prefix) || lower.startsWith(`${oldLabel.toLowerCase()} `)) {
      const rest = bare.slice(oldLabel.length).trim();
      return rest ? `${newLabel} ${rest}` : newLabel;
    }
  }

  return answerKey;
}

export type ReshuffledOptions = {
  options: unknown;
  answerKey: string | null;
};

/**
 * Shuffles one MCQ's choices for a set: the choice objects keep their
 * `isCorrect` flags, the labels are re-assigned from the original label pool
 * (A/B/C/D …) and the answer key is rewritten to follow the label it named.
 */
export function reshuffleMcqOptions(
  rawOptions: unknown,
  answerKey: string | null | undefined,
  seed: string
): ReshuffledOptions {
  const key = answerKey ?? null;
  const choices = parseMcqOptions(rawOptions);
  if (choices.length < 2) return { options: rawOptions, answerKey: key };

  const correctBefore = correctMcqLabels(choices, key);
  const oldLabels = choices.map((c) => c.label);

  // Permutation of the original indexes — the same seed always yields the
  // same permutation, so a regenerated set matches the printed one.
  const order = seededShuffle(
    choices.map((_, i) => i),
    seed
  );
  const shuffled = order.map((i) => ({ ...choices[i] }));

  // Relabel sequentially from the original label pool (A → A at position 0,
  // …): the printed options keep alphabetical labels while their order moves.
  // old label → new label, so the answer key can follow its choice.
  const oldLabelToNew = new Map<string, string>();
  order.forEach((originalIndex, position) => {
    oldLabelToNew.set(oldLabels[originalIndex], oldLabels[position]);
  });
  shuffled.forEach((choice, position) => {
    choice.label = oldLabels[position];
  });

  // Preserve the original options shape (bare array / { kind, choices, layout }).
  let options: unknown;
  if (Array.isArray(rawOptions)) {
    options = shuffled;
  } else if (rawOptions && typeof rawOptions === "object") {
    options = { ...(rawOptions as Record<string, unknown>), choices: shuffled };
  } else {
    options = shuffled;
  }

  return { options, answerKey: remapAnswerKey(key, oldLabelToNew, correctBefore) };
}

// ------------------------------------------------------------
//  Set transform
// ------------------------------------------------------------

type SetQuestion = {
  order: number;
  question: {
    questionType: string;
    options: unknown;
    answerKey: string | null;
  };
};

type SetSection = {
  questions: SetQuestion[];
};

type SetTransformInput<TPaper> = TPaper & {
  sections: (SetSection & Record<string, unknown>)[];
};

/**
 * Returns the paper as it should print for `setIndex`.
 * Index 0 (Set A) is the authored paper; later sets are reshuffled.
 */
export function applySetTransform<TPaper>(
  paper: TPaper,
  setIndex: number,
  seed: string
): TPaper {
  if (setIndex <= 0) return paper;

  const setSeed = `${seed}|set|${setIndex}`;
  const typed = paper as SetTransformInput<TPaper>;

  const sections = typed.sections.map((section, sectionIndex) => ({
    ...section,
    questions: seededShuffle(section.questions, `${setSeed}|q|${sectionIndex}`).map(
      (sq, position) => {
        if (sq.question.questionType !== "MCQ") return sq;
        const reshuffled = reshuffleMcqOptions(
          sq.question.options,
          sq.question.answerKey,
          `${setSeed}|o|${sectionIndex}|${position}`
        );
        return {
          ...sq,
          question: { ...sq.question, ...reshuffled },
        };
      }
    ),
  }));

  return { ...paper, sections } as TPaper;
}
