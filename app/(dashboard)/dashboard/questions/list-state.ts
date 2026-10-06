// ============================================================
//  Question Bank table state ⇄ query string
//
//  The listing starts at an idle prompt and keeps its page / filters /
//  search in React state, so opening the edit page (a route change) would
//  otherwise throw all of it away. The state rides along in the edit URL
//  instead:
//
//    pencil click  →  /dashboard/questions/:id?<state>
//    Update/Cancel →  /dashboard/questions?<state>   (same page, same page №)
//
//  With no state in the URL the listing stays idle, exactly as before.
// ============================================================

import {
  BLOOM_LEVELS,
  DIFFICULTIES,
  MEDIUMS,
  QUESTION_TYPES,
  type QuestionFilterInput,
} from "@/lib/validations";

export const QUESTIONS_LIST_PATH = "/dashboard/questions";

export type QuestionsListState = {
  filters: Partial<QuestionFilterInput>;
  /** Search box value — kept apart from filters.search (debounced). */
  searchInput: string;
  /** Class node driving the cascade — UI-only, never a list filter. */
  classId: string;
};

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Marks the URL as "table open" — without it the page stays idle. */
const LIST_FLAG = "list";

const ID_FILTER_KEYS = ["subjectId", "chapterId", "topicId"] as const;

/** Filter → allowed values (anything else is dropped, not rejected). */
const ENUM_FILTERS = {
  questionType: QUESTION_TYPES,
  difficulty: DIFFICULTIES,
  medium: MEDIUMS,
  bloomLevel: BLOOM_LEVELS,
} as const;

const ENUM_KEYS = Object.keys(ENUM_FILTERS) as (keyof typeof ENUM_FILTERS)[];

/** Serialize the current table state as a query string ("list=1&page=3…"). */
export function serializeListState(state: QuestionsListState): string {
  const sp = new URLSearchParams();
  sp.set(LIST_FLAG, "1");
  if (state.classId) sp.set("classId", state.classId);
  if (state.searchInput) sp.set("q", state.searchInput);

  const f = state.filters as Record<string, unknown>;
  for (const key of ID_FILTER_KEYS) {
    const value = f[key];
    if (typeof value === "string" && value) sp.set(key, value);
  }
  for (const key of ENUM_KEYS) {
    const value = f[key];
    if (typeof value === "string" && value) sp.set(key, value);
  }
  if (typeof f.previousYearTag === "string" && f.previousYearTag) {
    sp.set("previousYearTag", f.previousYearTag);
  }
  if (typeof f.page === "number" && f.page > 1) sp.set("page", String(f.page));
  if (typeof f.pageSize === "number" && f.pageSize !== 20) {
    sp.set("pageSize", String(f.pageSize));
  }
  return sp.toString();
}

/**
 * Rebuild the table state from a URL. Returns `null` unless the URL carries
 * the list flag — hand-edited / stale values are dropped rather than allowed
 * to fail the filter schema (which would silently return an empty page).
 */
export function parseListState(sp: SearchParamsRecord): QuestionsListState | null {
  const read = (key: string): string => {
    const raw = sp[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" ? value : "";
  };

  if (read(LIST_FLAG) !== "1") return null;

  const search = read("q").trim().slice(0, 200);
  const filters: Record<string, string | number> = {};
  if (search) filters.search = search;

  for (const key of ID_FILTER_KEYS) {
    const value = read(key).trim();
    if (value) filters[key] = value;
  }
  for (const key of ENUM_KEYS) {
    const value = read(key);
    if ((ENUM_FILTERS[key] as readonly string[]).includes(value)) filters[key] = value;
  }

  const previousYearTag = read("previousYearTag").trim().slice(0, 60);
  if (previousYearTag) filters.previousYearTag = previousYearTag;

  const page = toInt(read("page"), 1, 1);
  if (page !== 1) filters.page = page;
  const pageSize = toInt(read("pageSize"), 20, 5, 100);
  if (pageSize !== 20) filters.pageSize = pageSize;

  return {
    filters: filters as Partial<QuestionFilterInput>,
    searchInput: search,
    classId: read("classId").trim(),
  };
}

/** Where the edit form must send the user back to keep the listing intact. */
export function buildListReturnUrl(sp: SearchParamsRecord): string {
  const state = parseListState(sp);
  if (!state) return QUESTIONS_LIST_PATH;
  const query = serializeListState(state);
  return query ? `${QUESTIONS_LIST_PATH}?${query}` : QUESTIONS_LIST_PATH;
}

function toInt(raw: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}
