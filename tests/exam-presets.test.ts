import { describe, expect, it } from "vitest";
import { EXAM_PRESETS, getExamPreset } from "@/lib/exam-presets";

describe("exam presets", () => {
  it("covers the requested exams", () => {
    expect(EXAM_PRESETS.map((p) => p.id).sort()).toEqual(
      ["cmat", "gujcet", "jee-advanced", "jee-main", "neet"].sort()
    );
    expect(getExamPreset("jee-main")?.name).toBe("JEE Main");
    expect(getExamPreset("nope")).toBeNull();
  });

  it.each(EXAM_PRESETS.map((p) => [p.id, p] as const))(
    "%s — section marks add up to the stated total",
    (_id, preset) => {
      const sectionMarks = preset.sections.reduce(
        (sum, s) => sum + s.count * s.marksEach,
        0
      );
      expect(sectionMarks).toBe(preset.totalMarks);

      // Blueprint rules must agree with the printed sections, so applying a
      // preset in blueprint mode cannot produce a different total.
      const ruleMarks = preset.blueprintRules.reduce(
        (sum, r) => sum + r.count * r.marksEach,
        0
      );
      expect(ruleMarks).toBe(preset.totalMarks);

      expect(preset.sections.length).toBeGreaterThan(0);
      expect(preset.duration).toBeGreaterThan(0);
      expect(preset.instructions.length).toBeGreaterThan(0);
      expect(preset.header.rows.length).toBeGreaterThan(0);
    }
  );

  it.each(EXAM_PRESETS.map((p) => [p.id, p] as const))(
    "%s — every section declares its negative marking consistently",
    (_id, preset) => {
      for (const section of preset.sections) {
        expect(section.negativeMarks).toBeGreaterThanOrEqual(0);
        expect(section.count).toBeGreaterThan(0);
        expect(section.marksEach).toBeGreaterThan(0);
      }
      for (const rule of preset.blueprintRules) {
        expect(rule.negativeMarks).toBeGreaterThanOrEqual(0);
        const easy = rule.difficultyDistribution;
        expect(easy.easy + easy.medium + easy.hard).toBe(100);
      }
    }
  );

  it("matches the published 2026 patterns", () => {
    const jee = getExamPreset("jee-main")!;
    expect(jee.sections.reduce((n, s) => n + s.count, 0)).toBe(75);
    expect(jee.totalMarks).toBe(300);
    expect(jee.duration).toBe(180);

    const neet = getExamPreset("neet")!;
    expect(neet.sections.reduce((n, s) => n + s.count, 0)).toBe(180);
    expect(neet.totalMarks).toBe(720);
    // +4 correct / −1 wrong
    expect(neet.sections.every((s) => s.marksEach === 4 && s.negativeMarks === 1)).toBe(true);

    const gujcet = getExamPreset("gujcet")!;
    expect(gujcet.sections.reduce((n, s) => n + s.count, 0)).toBe(120);
    expect(gujcet.totalMarks).toBe(120);
    expect(gujcet.sections.every((s) => s.negativeMarks === 0.25)).toBe(true);

    const advanced = getExamPreset("jee-advanced")!;
    expect(advanced.sections.reduce((n, s) => n + s.count, 0)).toBe(54);
    expect(advanced.totalMarks).toBe(180);

    const cmat = getExamPreset("cmat")!;
    expect(cmat.sections.reduce((n, s) => n + s.count, 0)).toBe(100);
    expect(cmat.totalMarks).toBe(400);
    // Patterns change year to year — every preset carries a note so the
    // author can confirm it against the current bulletin.
    expect(cmat.note).toBeTruthy();
  });
});
