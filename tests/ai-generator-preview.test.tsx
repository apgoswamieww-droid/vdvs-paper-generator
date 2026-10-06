// @vitest-environment jsdom
// ============================================================
//  AI generator — review-card preview & option layout
//  Every generated card must show a paper-like preview (KaTeX math +
//  options laid out per the selected mode) and expose the "Option
//  layout" selector without opening the inline editor.
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AiGeneratorClient } from "@/app/(dashboard)/dashboard/admin/ai-generator/ai-generator-client";
import type { TaxonomyNode } from "@/app/(dashboard)/dashboard/admin/ai-generator/page";

// The client imports the server action module (prisma) only for saving —
// never exercised here.
vi.mock("@/app/(dashboard)/dashboard/admin/ai-generator/actions", () => ({
  saveGeneratedQuestions: vi.fn(),
}));

// react-dom/client refuses to render outside an act()-aware environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAXONOMY: TaxonomyNode[] = [
  {
    id: "class-10",
    name: "Std 10",
    subjects: [
      {
        id: "physics",
        name: "Physics",
        questionCount: 5,
        chapters: [{ id: "light", name: "Light", questionCount: 5, topics: [] }],
      },
    ],
  },
];

const GATEWAY = {
  gateway: { online: true, displayUrl: "http://localhost:20128", model: "auto", detail: "" },
};

const GENERATED = {
  ok: true,
  context: {
    classLevelId: "class-10",
    subjectId: "physics",
    chapterId: "light",
    topicId: null,
    medium: "ENGLISH",
    questionType: "MCQ",
    previousYear: false,
    examYear: null,
    sourceContext: "Std 10 · Physics · Light",
    school: { id: "school-1", name: "Demo", board: "GSEB", academicYear: null },
  },
  questions: [
    {
      questionText: "Light travels at $3 \\times 10^8$ m/s in vacuum.",
      options: {
        kind: "mcq",
        choices: [
          { label: "A", text: "True", isCorrect: true },
          { label: "B", text: "False", isCorrect: false },
          { label: "C", text: "True", isCorrect: false },
          { label: "D", text: "False", isCorrect: false },
        ],
      },
      answerKey: "A",
      explanation: "",
      tags: ["light"],
      difficulty: "EASY",
      bloom: "REMEMBER",
    },
  ],
};

/** Minimal stand-in for Response — the client only reads ok/json. */
const asResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/ai/status")) return asResponse(GATEWAY);
    if (url.includes("/api/ai/generate-questions")) return asResponse(GENERATED);
    return { ok: false, status: 404, json: async () => ({}) };
  })
);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(node: ReactNode): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  await act(async () => {}); // resolve the mount-time gateway probe
  return container;
}

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

/** Fire the pointer/mouse sequence a select trigger listens for. */
async function click(el: Element) {
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    });
  }
}

async function clickButton(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  await act(async () => {}); // flush the async generate() continuation
}

function triggers(): HTMLElement[] {
  return [...document.querySelectorAll('[data-slot="select-trigger"]')] as HTMLElement[];
}

function triggerWithText(text: string): HTMLElement {
  const el = triggers().find((t) => (t.textContent ?? "").includes(text));
  if (!el) throw new Error(`No select trigger containing "${text}"`);
  return el;
}

/** Opens a select and picks the option whose label matches exactly. */
async function chooseOption(optionLabel: string) {
  const items = [...document.querySelectorAll('[data-slot="select-content"] [data-slot="select-item"]')];
  const target = items.find(
    (i) => (i.textContent ?? "").replace(/\s+/g, " ").trim() === optionLabel
  );
  if (!target) throw new Error(`No option "${optionLabel}" in the open select`);
  await click(target);
}

function previewGridStyle(container: HTMLElement): string {
  const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement | null;
  if (!grid) throw new Error("Preview option grid not rendered");
  return grid.getAttribute("style") ?? "";
}

/** Standard → Subject → Chapter → Generate, then wait for the review card. */
async function generateOneQuestion(): Promise<HTMLElement> {
  const el = await render(
    <AiGeneratorClient
      taxonomy={TAXONOMY}
      teachers={[{ id: "t1", name: "Priya Sharma" }]}
      school={{ name: "Demo High School", board: "GSEB", academicYear: null }}
      isAudit={false}
      auditSchoolId={null}
    />
  );

  await click(triggerWithText("Select standard"));
  await chooseOption("Std 10(5)");
  await click(triggerWithText("Select subject"));
  await chooseOption("Physics(5)");
  await click(triggerWithText("Select chapter"));
  await chooseOption("Light(5)");

  const generate = [...el.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("Generate")
  );
  if (!generate) throw new Error("Generate button not found");
  await clickButton(generate);
  return el;
}

describe("AI generator review card", () => {
  it("renders a KaTeX preview of the question and its options", async () => {
    const el = await generateOneQuestion();

    expect(el.textContent).toContain("Preview");
    // $3 \times 10^8$ came back as rendered math, not raw TeX.
    expect(el.querySelector(".katex")).toBeTruthy();
    expect(el.textContent).not.toContain("$3 \\times 10^8$");
    // The correct option is called out in the preview.
    expect(el.textContent).toContain("(A)");
    expect(el.textContent).toContain("✓");
  });

  it("defaults to the auto layout (4 short options → one row)", async () => {
    const el = await generateOneQuestion();
    expect(previewGridStyle(el)).toContain("repeat(4");
    expect(triggerWithText("Auto (by option length)")).toBeTruthy();
  });

  it("offers the option layout without opening the editor and re-flows the preview", async () => {
    const el = await generateOneQuestion();

    // No card is being edited yet — the selector is on the card itself.
    expect(el.textContent).not.toContain("Close editor");
    expect(triggerWithText("Auto (by option length)")).toBeTruthy();

    await click(triggerWithText("Auto (by option length)"));
    await chooseOption("One column (stacked)");

    expect(previewGridStyle(el)).toContain("repeat(1");
    expect(triggerWithText("One column (stacked)")).toBeTruthy();
  });

  it("keeps the chosen layout when the card is reopened in the editor", async () => {
    const el = await generateOneQuestion();

    await click(triggerWithText("Auto (by option length)"));
    await chooseOption("Two rows (2 × 2)");
    expect(previewGridStyle(el)).toContain("repeat(2");

    const edit = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Review / edit")
    );
    if (!edit) throw new Error("Review / edit button not found");
    await clickButton(edit);

    expect(el.textContent).toContain("Close editor");
    expect(el.textContent).toContain("Question text");
    expect(previewGridStyle(el)).toContain("repeat(2");
  });
});
