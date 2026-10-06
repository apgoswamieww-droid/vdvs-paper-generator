// @vitest-environment jsdom
// ============================================================
//  Create-Paper question-search filters (the real builder).
//
//  Regression: the filter dropdowns' "All …" rows carry the
//  literal value "all". That sentinel used to leak into the
//  filter state, which
//    (a) emptied the Subject dropdown (subjects are filtered
//        by medium, and nothing has medium "all"), and
//    (b) reached listQuestions, where it failed the zod enums
//        and the whole query silently returned zero results —
//        "filters overlapping each other and no question found".
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { listQuestionsMock } = vi.hoisted(() => ({ listQuestionsMock: vi.fn() }));

vi.mock("@/app/(dashboard)/dashboard/questions/actions", () => ({
  listQuestions: listQuestionsMock,
  getQuestionsByIds: vi.fn(async () => []),
  getTranslationMap: vi.fn(async () => ({})),
  findReplacementQuestions: vi.fn(async () => ({
    items: [],
    meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 },
  })),
}));

vi.mock("@/app/(dashboard)/dashboard/papers/actions", () => ({
  createManualPaper: vi.fn(),
  createBlueprintPaper: vi.fn(),
  saveHeaderTemplate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { PaperBuilderClient } from "@/app/(dashboard)/dashboard/papers/new/paper-builder-client";
import type { TaxonomyNode } from "@/app/(dashboard)/dashboard/questions/actions";

const TAXONOMY: TaxonomyNode[] = [
  {
    id: "class-10",
    name: "Std 10",
    children: [
      {
        id: "physics-en",
        name: "Physics",
        medium: "ENGLISH",
        questionCount: 24,
        children: [{ id: "light-en", name: "Light", questionCount: 12, children: [] }],
      },
      {
        id: "physics-gu",
        name: "Physics",
        medium: "GUJARATI",
        questionCount: 18,
        children: [{ id: "light-gu", name: "Light", questionCount: 9, children: [] }],
      },
      {
        id: "maths-en",
        name: "Maths",
        medium: "ENGLISH",
        questionCount: 40,
        children: [],
      },
    ],
  },
];

const PAPER_DEFAULTS = {
  name: "Test School",
  logoUrl: null,
  address: null,
  phone: null,
  board: null,
  academicYear: null,
  defaultInstructions: "",
  watermarkText: "",
  defaultHeader: { rows: [] },
};

const EMPTY_META = { page: 1, pageSize: 15, total: 0, totalPages: 1 };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(node: ReactNode): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  return container;
}

async function renderBuilder(): Promise<HTMLElement> {
  listQuestionsMock.mockReset();
  listQuestionsMock.mockResolvedValue({ items: [], meta: EMPTY_META });
  return render(
    <PaperBuilderClient taxonomy={TAXONOMY} paperDefaults={PAPER_DEFAULTS} templates={[]} />
  );
}

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});

/** Fire the pointer/mouse sequence a select trigger listens for. */
async function click(el: Element) {
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    });
  }
}

function findTrigger(scope: HTMLElement, text: string): HTMLElement {
  // Base UI's SelectIcon appends a literal "▼" glyph to the trigger,
  // so match on containment (as the other select tests do) rather
  // than on exact textContent equality.
  const el = [...scope.querySelectorAll<HTMLElement>('[data-slot="select-trigger"]')].find(
    (t) => (t.textContent ?? "").includes(text)
  );
  if (!el) throw new Error(`No select trigger with text "${text}"`);
  return el;
}

function optionTexts(): string[] {
  return [...document.querySelectorAll('[data-slot="select-content"] [data-slot="select-item"]')].map(
    (el) => (el as HTMLElement).textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

async function chooseOption(labelPart: string) {
  const item = [...document.querySelectorAll('[data-slot="select-content"] [data-slot="select-item"]')].find(
    (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().includes(labelPart)
  );
  if (!item) throw new Error(`No option containing "${labelPart}" (have: ${optionTexts().join(" | ")})`);
  await click(item);
}

function findButton(scope: HTMLElement, text: string): HTMLElement {
  const el = [...scope.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text
  );
  if (!el) throw new Error(`No button with text "${text}"`);
  return el;
}

describe("Create-Paper question search filters", () => {
  it('keeps both mediums\' subjects listed after "All Mediums" is chosen', async () => {
    const el = await renderBuilder();

    // Pick a concrete medium first — the old bug only showed once a
    // medium had been set and then replaced with "All Mediums".
    await click(findTrigger(el, "All Mediums"));
    await chooseOption("English");

    await click(findTrigger(el, "English"));
    await chooseOption("All Mediums");

    await click(findTrigger(el, "All Subjects"));
    const options = optionTexts();
    // Both English and Gujarati Physics must be there, disambiguated
    // by medium — previously this list came back empty.
    expect(options).toContain("Std 10 — Physics(24) · English");
    expect(options).toContain("Std 10 — Physics(18) · Gujarati");
    expect(options).toContain("Std 10 — Maths(40) · English");
    await chooseOption("All Subjects"); // close the popup
  });

  it('sends no "all" sentinel to listQuestions and runs the search', async () => {
    const el = await renderBuilder();

    await click(findTrigger(el, "All Mediums"));
    await chooseOption("English");
    await click(findTrigger(el, "English"));
    await chooseOption("All Mediums");
    await click(findTrigger(el, "All Subjects"));
    await chooseOption("All Subjects");
    await click(findTrigger(el, "All Types"));
    await chooseOption("All Types");
    await click(findTrigger(el, "All Difficulties"));
    await chooseOption("All Difficulties");

    await act(async () => {
      click(findButton(el, "Search"));
    });
    await act(async () => {});

    expect(listQuestionsMock).toHaveBeenCalledTimes(1);
    const filters = listQuestionsMock.mock.calls[0][0] as Record<string, unknown>;
    // Nothing selected → no filter keys at all, and never the "all" literal.
    expect(filters).not.toHaveProperty("medium");
    expect(filters).not.toHaveProperty("subjectId");
    expect(filters).not.toHaveProperty("chapterId");
    expect(filters).not.toHaveProperty("questionType");
    expect(filters).not.toHaveProperty("difficulty");
    expect(JSON.stringify(filters)).not.toContain('"all"');
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(15);
  });

  it("passes real selections through to the query", async () => {
    const el = await renderBuilder();

    await click(findTrigger(el, "All Subjects"));
    await chooseOption("Std 10 — Physics(24) · English");
    await click(findTrigger(el, "All Difficulties"));
    await chooseOption("Easy");

    await act(async () => {
      click(findButton(el, "Search"));
    });
    await act(async () => {});

    expect(listQuestionsMock).toHaveBeenCalledTimes(1);
    const filters = listQuestionsMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filters.subjectId).toBe("physics-en");
    expect(filters.difficulty).toBe("EASY");
    expect(filters.medium).toBeUndefined();
  });
});
