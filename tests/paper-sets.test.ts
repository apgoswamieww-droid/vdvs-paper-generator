import { describe, expect, it } from "vitest";
import {
  MAX_SETS,
  applySetTransform,
  normalizeSetCount,
  reshuffleMcqOptions,
  seededShuffle,
  setLabel,
} from "@/lib/paper-sets";
import { correctMcqLabels, parseMcqOptions } from "@/lib/question-options";

// ------------------------------------------------------------
//  Fixtures
// ------------------------------------------------------------

type Choice = { label: string; text: string; isCorrect?: boolean };

function mcq(choices: Choice[]) {
  return { kind: "mcq", choices };
}

const ORIGINAL_CHOICES: Choice[] = [
  { label: "A", text: "Hydrogen", isCorrect: false },
  { label: "B", text: "Oxygen", isCorrect: true },
  { label: "C", text: "Nitrogen", isCorrect: false },
  { label: "D", text: "Helium", isCorrect: false },
];

/** The texts the key points at, whatever the labels are. */
function correctTexts(options: unknown, key: string | null): string[] {
  const choices = parseMcqOptions(options);
  const labels = new Set(correctMcqLabels(choices, key));
  return choices.filter((c) => labels.has(c.label)).map((c) => c.text).sort();
}

function makePaper() {
  const texts = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"];
  return {
    id: "paper-1",
    sections: [
      {
        title: "Section A",
        questions: texts.map((t, i) => ({
          order: i,
          question:
            i % 2 === 0
              ? {
                  questionText: t,
                  questionType: "MCQ",
                  options: mcq(ORIGINAL_CHOICES.map((c) => ({ ...c }))),
                  answerKey: "B",
                }
              : {
                  questionText: t,
                  questionType: "SHORT_ANSWER",
                  options: null,
                  answerKey: t,
                },
        })),
      },
      {
        title: "Section B",
        questions: ["Q7", "Q8"].map((t, i) => ({
          order: i,
          question: {
            questionText: t,
            questionType: "MCQ",
            options: mcq(ORIGINAL_CHOICES.map((c) => ({ ...c }))),
            answerKey: "B",
          },
        })),
      },
    ],
  };
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------

describe("setLabel / normalizeSetCount", () => {
  it("labels sets alphabetically", () => {
    expect(setLabel(0)).toBe("A");
    expect(setLabel(1)).toBe("B");
    expect(setLabel(7)).toBe("H");
  });

  it("clamps anything into 1…MAX_SETS", () => {
    expect(normalizeSetCount(undefined)).toBe(1);
    expect(normalizeSetCount(0)).toBe(1);
    expect(normalizeSetCount(-3)).toBe(1);
    expect(normalizeSetCount("4")).toBe(4);
    expect(normalizeSetCount(99)).toBe(MAX_SETS);
    expect(normalizeSetCount("abc")).toBe(1);
  });
});

describe("seededShuffle", () => {
  it("is deterministic for the same seed and keeps every item", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const a = seededShuffle(items, "seed-1");
    const b = seededShuffle(items, "seed-1");
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });

  it("produces a different order for a different seed", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const a = seededShuffle(items, "seed-1");
    const b = seededShuffle(items, "seed-2");
    expect(a).not.toEqual(b);
  });
});

describe("reshuffleMcqOptions", () => {
  it("keeps the choices, their flags and the label pool", () => {
    const raw = mcq(ORIGINAL_CHOICES.map((c) => ({ ...c })));
    const { options } = reshuffleMcqOptions(raw, "B", "set-1");

    const after = parseMcqOptions(options);
    expect(after).toHaveLength(4);
    expect(after.map((c) => c.text).sort()).toEqual(
      ORIGINAL_CHOICES.map((c) => c.text).sort()
    );
    // Labels are re-assigned from the original pool, in order.
    expect(after.map((c) => c.label)).toEqual(["A", "B", "C", "D"]);
    // Exactly one correct choice, still the same text.
    expect(after.filter((c) => c.isCorrect).map((c) => c.text)).toEqual(["Oxygen"]);
    // The layout metadata survives.
    expect((options as { kind?: string }).kind).toBe("mcq");
  });

  it("rewrites a label answer key to follow its choice", () => {
    const raw = mcq(ORIGINAL_CHOICES.map((c) => ({ ...c })));
    const before = correctTexts(raw, "B");

    // Try a handful of seeds: in every case the key must point at the same text.
    for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const { options, answerKey } = reshuffleMcqOptions(raw, "B", seed);
      expect(correctTexts(options, answerKey)).toEqual(before);
      // The stored key is a bare label (A–D), never stale.
      expect(["A", "B", "C", "D"]).toContain(answerKey);
    }
  });

  it("leaves a text-based key alone (order independent)", () => {
    const raw = mcq(ORIGINAL_CHOICES.map((c) => ({ ...c, isCorrect: false })));
    const { options, answerKey } = reshuffleMcqOptions(raw, "Oxygen", "seed");
    expect(answerKey).toBe("Oxygen");
    expect(correctTexts(options, answerKey)).toEqual(["Oxygen"]);
  });

  it("does nothing when there is nothing to shuffle", () => {
    expect(reshuffleMcqOptions(null, "A", "s")).toEqual({
      options: null,
      answerKey: "A",
    });
    const single = mcq([{ label: "A", text: "Only", isCorrect: true }]);
    expect(reshuffleMcqOptions(single, "A", "s").options).toBe(single);
  });
});

describe("applySetTransform", () => {
  it("returns Set A exactly as authored", () => {
    const paper = makePaper();
    expect(applySetTransform(paper, 0, paper.id)).toBe(paper);
  });

  it("reshuffles question order for later sets but keeps the same questions", () => {
    const paper = makePaper();
    const transformed = applySetTransform(paper, 1, paper.id);

    const before = paper.sections.map((s) => s.questions.map((q) => q.question.questionText));
    const after = transformed.sections.map((s) => s.questions.map((q) => q.question.questionText));
    expect(after).toHaveLength(before.length);
    // Same members, possibly another order.
    after.forEach((list, i) => expect([...list].sort()).toEqual([...before[i]].sort()));
    // At least one set among 1…4 reorders the six-question section.
    const reordered = [1, 2, 3, 4].some((i) => {
      const t = applySetTransform(paper, i, paper.id);
      return (
        JSON.stringify(t.sections[0].questions.map((q) => q.question.questionText)) !==
        JSON.stringify(before[0])
      );
    });
    expect(reordered).toBe(true);
  });

  it("gives every set its own answer key while pointing at the same answer", () => {
    const paper = makePaper();
    const original = paper.sections[0].questions[0].question;
    const originalTexts = correctTexts(original.options, original.answerKey);

    for (const i of [1, 2, 3]) {
      const t = applySetTransform(paper, i, paper.id);
      const q = t.sections[0].questions.find(
        (sq) => sq.question.questionType === "MCQ"
      )!.question;
      expect(correctTexts(q.options, q.answerKey)).toEqual(originalTexts);
    }
  });

  it("never mutates the source paper", () => {
    const paper = makePaper();
    const snapshot = JSON.stringify(paper);
    applySetTransform(paper, 3, paper.id);
    expect(JSON.stringify(paper)).toBe(snapshot);
  });
});
