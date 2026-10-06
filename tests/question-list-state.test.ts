// ============================================================
//  Question Bank table state ⇄ query string
//  The listing keeps its page/filters/search in React state; editing a
//  question navigates away and back, so the state rides in the URL. The
//  round trip must be lossless, and whatever comes back must still pass
//  questionFilterSchema — a single invalid value makes listQuestions
//  return an empty page.
// ============================================================

import { describe, expect, it } from "vitest";
import { questionFilterSchema } from "@/lib/validations";
import {
  QUESTIONS_LIST_PATH,
  buildListReturnUrl,
  parseListState,
  serializeListState,
  type QuestionsListState,
} from "@/app/(dashboard)/dashboard/questions/list-state";

const asRecord = (query: string): Record<string, string | string[] | undefined> =>
  Object.fromEntries(new URLSearchParams(query));

const STATE: QuestionsListState = {
  filters: {
    page: 3,
    pageSize: 50,
    search: "પ્રકાશ",
    subjectId: "sub-1",
    chapterId: "ch-2",
    topicId: "top-3",
    questionType: "MCQ",
    difficulty: "HARD",
    medium: "GUJARATI",
    bloomLevel: "ANALYZE",
    previousYearTag: "GSEB 2023",
  },
  searchInput: "પ્રકાશ",
  classId: "class-6",
};

describe("serializeListState / parseListState", () => {
  it("round-trips the whole table state", () => {
    const restored = parseListState(asRecord(serializeListState(STATE)));
    expect(restored).toEqual(STATE);
  });

  it("returns null without the list flag — the page stays idle", () => {
    expect(parseListState({})).toBeNull();
    expect(parseListState({ page: "3", search: "x" })).toBeNull();
    expect(parseListState({ list: "0" })).toBeNull();
  });

  it("restores the pagination page the user was on", () => {
    const restored = parseListState(asRecord(serializeListState(STATE)));
    expect(restored?.filters.page).toBe(3);
    expect(restored?.filters.pageSize).toBe(50);
  });

  it("drops values the filter schema would reject", () => {
    const restored = parseListState(
      asRecord(
        "list=1&page=-4&pageSize=999&difficulty=IMPOSSIBLE&questionType=NOT_A_TYPE&medium=Klingon&bloomLevel=NOPE&q=" +
          "x".repeat(400)
      )
    );
    expect(restored).not.toBeNull();
    expect(restored?.filters.page).toBeUndefined();
    expect(restored?.filters.pageSize).toBeUndefined();
    expect(restored?.filters.difficulty).toBeUndefined();
    expect(restored?.filters.questionType).toBeUndefined();
    expect(restored?.filters.medium).toBeUndefined();
    expect(restored?.filters.bloomLevel).toBeUndefined();
    expect(restored?.searchInput).toHaveLength(200);
    expect(questionFilterSchema.safeParse(restored?.filters).success).toBe(true);
  });

  it("produces filters that pass questionFilterSchema", () => {
    const restored = parseListState(asRecord(serializeListState(STATE)));
    const parsed = questionFilterSchema.safeParse(restored?.filters);
    expect(parsed.success).toBe(true);
  });

  it("keeps the idle defaults out of the URL", () => {
    const query = serializeListState({ filters: { page: 1, pageSize: 20 }, searchInput: "", classId: "" });
    expect(query).toBe("list=1");
    const restored = parseListState(asRecord(query));
    expect(restored).toEqual({ filters: {}, searchInput: "", classId: "" });
  });
});

describe("buildListReturnUrl", () => {
  it("carries the state back to the listing", () => {
    const url = buildListReturnUrl(asRecord(serializeListState(STATE)));
    expect(url.startsWith(`${QUESTIONS_LIST_PATH}?`)).toBe(true);
    const restored = parseListState(asRecord(url.split("?")[1] ?? ""));
    expect(restored).toEqual(STATE);
  });

  it("falls back to the bare listing when the edit was opened directly", () => {
    expect(buildListReturnUrl({})).toBe(QUESTIONS_LIST_PATH);
    expect(buildListReturnUrl({ link: "abc" })).toBe(QUESTIONS_LIST_PATH);
  });
});
