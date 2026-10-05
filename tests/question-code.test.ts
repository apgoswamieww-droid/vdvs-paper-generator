import { afterEach, describe, expect, it, vi } from "vitest";
import { randomQuestionCode } from "@/lib/question-code";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("randomQuestionCode", () => {
  it("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 1_000; i++) {
      expect(randomQuestionCode()).toMatch(/^\d{6}$/);
    }
  });

  it("stays within the 100000..999999 range", () => {
    for (let i = 0; i < 1_000; i++) {
      const code = Number.parseInt(randomQuestionCode(), 10);
      expect(code).toBeGreaterThanOrEqual(100000);
      expect(code).toBeLessThanOrEqual(999999);
    }
  });

  it("maps the random source exactly: 0 → 100000", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomQuestionCode()).toBe("100000");
  });

  it("maps the random source exactly: mid → 550000", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(randomQuestionCode()).toBe("550000");
  });

  it("reaches the upper bound 999999 without rolling over to 7 digits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999999);
    expect(randomQuestionCode()).toBe("999999");
  });

  it("produces varied codes across calls (no repeated value burst)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomQuestionCode()));
    // 200 draws over a 900k space essentially never collide —
    // require strong variety without being brittle on ties.
    expect(seen.size).toBeGreaterThan(190);
  });
});
