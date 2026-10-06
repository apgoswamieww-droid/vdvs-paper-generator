// ============================================================
//  Question-search filter sentinels
//  The filter <Select>s use the literal value "all" for their
//  "All …" rows. A stray "all" must never reach listQuestions:
//  it fails questionFilterSchema's enums, which rejects the
//  WHOLE filter object and silently returns zero results.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  filterSelectValue,
  questionFilterSchema,
  stripFilterSentinels,
} from "@/lib/validations";

describe("filterSelectValue", () => {
  it('normalizes the "all" sentinel and empty values to ""', () => {
    expect(filterSelectValue("all")).toBe("");
    expect(filterSelectValue("")).toBe("");
    expect(filterSelectValue(null)).toBe("");
    expect(filterSelectValue(undefined)).toBe("");
  });

  it("keeps real selections", () => {
    expect(filterSelectValue("ENGLISH")).toBe("ENGLISH");
    expect(filterSelectValue("MCQ")).toBe("MCQ");
    expect(filterSelectValue("chapter-123")).toBe("chapter-123");
  });
});

describe("stripFilterSentinels", () => {
  it("drops the sentinel from every constrained filter field", () => {
    const parsed = questionFilterSchema.safeParse(
      stripFilterSentinels({
        page: 1,
        pageSize: 15,
        medium: "all",
        subjectId: "all",
        chapterId: "all",
        questionType: "all",
        difficulty: "all",
      })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.medium).toBeUndefined();
      expect(parsed.data.subjectId).toBeUndefined();
      expect(parsed.data.chapterId).toBeUndefined();
      expect(parsed.data.questionType).toBeUndefined();
      expect(parsed.data.difficulty).toBeUndefined();
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.pageSize).toBe(15);
    }
  });

  it("documents the original failure: one \"all\" rejects the whole schema", () => {
    expect(questionFilterSchema.safeParse({ medium: "all" }).success).toBe(false);
    expect(questionFilterSchema.safeParse({ subjectId: "all" }).success).toBe(true);
  });

  it("keeps the literal word in a free-text search", () => {
    const cleaned = stripFilterSentinels({ search: "all", medium: "ENGLISH" });
    expect(cleaned).toEqual({ search: "all", medium: "ENGLISH" });
    const parsed = questionFilterSchema.safeParse(cleaned);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.search).toBe("all");
  });

  it("passes real filters through untouched", () => {
    const raw = { subjectId: "abc", chapterId: "def", page: 2, pageSize: 15 };
    expect(stripFilterSentinels(raw)).toEqual(raw);
  });

  it("returns non-objects unchanged", () => {
    expect(stripFilterSentinels(null)).toBe(null);
    expect(stripFilterSentinels(undefined)).toBe(undefined);
    expect(stripFilterSentinels("all")).toBe("all");
  });
});
