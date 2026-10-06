// @vitest-environment jsdom
// ============================================================
//  Taxonomy dropdown labels — the real Select component must
//  show question totals in the options and in the closed
//  trigger, e.g. Physics → "Physics(24)".
// ============================================================

import { afterEach, describe, expect, it } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nodeLabel, subtreeQuestionCount, taxLabel } from "@/lib/taxonomy-label";
import type { TaxonomyNode } from "@/app/(dashboard)/dashboard/questions/actions";

// react-dom/client refuses to render outside an act()-aware environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TREE: TaxonomyNode[] = [
  {
    id: "class-10",
    name: "Std 10",
    children: [
      {
        id: "physics",
        name: "Physics",
        medium: "ENGLISH",
        questionCount: 24,
        children: [
          {
            id: "light",
            name: "Light",
            questionCount: 12,
            children: [{ id: "reflection", name: "Reflection", questionCount: 7, children: [] }],
          },
          { id: "electricity", name: "Electricity", questionCount: 10, children: [] },
        ],
      },
      {
        id: "maths",
        name: "Maths",
        medium: "ENGLISH",
        questionCount: 40,
        children: [{ id: "algebra", name: "Algebra", questionCount: 15, children: [] }],
      },
    ],
  },
];

const CLASS = TREE[0];
const SUBJECTS = CLASS.children;

/** Same markup as the Subject select on the Add-Question form. */
function SubjectSelect({
  value,
  onValueChange,
}: {
  value: string | null;
  onValueChange: (v: string | null) => void;
}) {
  return (
    <Select
      items={SUBJECTS.map((s) => ({ value: s.id, label: taxLabel(s.name, s.questionCount) }))}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger data-testid="subject-trigger">
        <SelectValue placeholder="Select subject" />
      </SelectTrigger>
      <SelectContent>
        {SUBJECTS.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {taxLabel(s.name, s.questionCount)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Same markup as the Class select (class totals are summed). */
function ClassSelect({ value, onValueChange }: { value: string | null; onValueChange: (v: string | null) => void }) {
  const tree = TREE;
  return (
    <Select
      items={tree.map((c) => ({ value: c.id, label: nodeLabel(c) }))}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger data-testid="class-trigger">
        <SelectValue placeholder="Select class" />
      </SelectTrigger>
      <SelectContent>
        {tree.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {nodeLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

function optionTexts(): string[] {
  return [...document.querySelectorAll('[data-slot="select-content"] [data-slot="select-item"]')].map(
    (el) => (el as HTMLElement).textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

function triggerText(testId: string): string {
  const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("taxonomy label helpers", () => {
  it("formats a count suffix", () => {
    expect(taxLabel("Physics", 24)).toBe("Physics(24)");
    expect(taxLabel("Physics", 0)).toBe("Physics(0)");
    expect(taxLabel("Physics")).toBe("Physics");
    expect(taxLabel("Physics", null)).toBe("Physics");
  });

  it("sums a class from its subjects when it has no own count", () => {
    expect(subtreeQuestionCount(CLASS)).toBe(64); // 24 + 40
    expect(nodeLabel(CLASS)).toBe("Std 10(64)");
    expect(nodeLabel(SUBJECTS[0])).toBe("Physics(24)");
  });
});

describe("Select dropdown with question totals", () => {
  it("shows the total on the closed trigger for the selected subject", async () => {
    await render(<SubjectSelect value="physics" onValueChange={() => {}} />);
    expect(triggerText("subject-trigger")).toContain("Physics(24)");
  });

  it("lists subjects with their totals, e.g. Physics(24)", async () => {
    const el = await render(<SubjectSelect value={null} onValueChange={() => {}} />);
    const trigger = el.querySelector('[data-testid="subject-trigger"]')!;
    await click(trigger);

    const options = optionTexts();
    expect(options).toContain("Physics(24)");
    expect(options).toContain("Maths(40)");
    expect(options.some((o) => /^Physics$/.test(o))).toBe(false);
  });

  it("lists classes with the summed total", async () => {
    const el = await render(<ClassSelect value={null} onValueChange={() => {}} />);
    await click(el.querySelector('[data-testid="class-trigger"]')!);

    const options = optionTexts();
    expect(options).toContain("Std 10(64)");
  });
});
