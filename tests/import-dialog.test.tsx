// @vitest-environment jsdom
// ============================================================
//  Bulk import dialog — upload wiring.
//
//  Regression: the "Read the file" button was gated on `preview`
//  instead of `file`. `preview` starts null and is only ever set by
//  the parse that button triggers, so the button never rendered,
//  parseImportFile was unreachable, and choosing a file silently did
//  nothing. The server-action tests could not catch this because they
//  call parseImportFile directly — only rendering the dialog exercises
//  the wiring.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TaxonomyNode } from "@/app/(dashboard)/dashboard/questions/actions";

// react-dom/client refuses to render outside an act()-aware environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Radix Dialog/Table reach for these; jsdom ships none of them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const parseImportFile = vi.fn();
const commitImport = vi.fn();

vi.mock("@/app/(dashboard)/dashboard/questions/import/actions", () => ({
  parseImportFile: (...args: unknown[]) => parseImportFile(...args),
  commitImport: (...args: unknown[]) => commitImport(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Radix Select is not driven by a native <select>, so jsdom cannot set a
// value. This mock keeps the same value/onValueChange contract over a real
// <select>, which lets the taxonomy be chosen the way a teacher would.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{ value: string; onValueChange: (v: string) => void }>({
    value: "",
    onValueChange: () => {},
  });
  function NativeSelect({ children }: { children?: ReactNode }) {
    const ctx = React.useContext(Ctx);
    return React.createElement(
      "select",
      {
        "data-select": "true",
        value: ctx.value,
        onChange: (e: { target: { value: string } }) => ctx.onValueChange(e.target.value),
      },
      children
    );
  }
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: ReactNode;
    }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value: value ?? "", onValueChange: onValueChange ?? (() => {}) } },
        children
      ),
    SelectTrigger: ({ children }: { children?: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) =>
      React.createElement(NativeSelect, null, children),
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) =>
      React.createElement("option", { value }, children),
  };
});

const { ImportDialog } = await import(
  "@/app/(dashboard)/dashboard/questions/import/import-dialog"
);

const TREE: TaxonomyNode[] = [
  {
    id: "cl1",
    name: "Std 10",
    children: [
      {
        id: "sub1",
        name: "Science",
        children: [
          {
            id: "ch1",
            name: "Light",
            children: [{ id: "top1", name: "Reflection", children: [] }],
          },
        ],
      },
    ],
  },
];

const ROW = {
  index: 1,
  questionText: "Which one is a lens?",
  questionType: "MCQ",
  medium: "ENGLISH",
  marks: 2,
  difficulty: "MEDIUM",
  bloomLevel: "APPLY",
  previousYearTag: null,
  tags: [],
  answerKey: "A",
  explanation: null,
  options: [{ label: "A", text: "Convex", isCorrect: true }],
  matchPairs: [],
};

const roots: Root[] = [];

// Radix Dialog portals into document.body, so queries look there, not at the
// container the root happens to own.
function dialog(): HTMLElement {
  return document.body;
}

async function render(ui: ReactNode): Promise<void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  roots.push(root);
}

/** Picks a file on the upload input, the way the OS file dialog does. */
async function chooseFile(name = "template.docx"): Promise<void> {
  const input = dialog().querySelector<HTMLInputElement>("#import-file");
  if (!input) throw new Error("upload input not rendered");
  const file = new File([new Uint8Array([1, 2, 3])], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Chooses the taxonomy option with `value`, unlocking the upload step. */
async function chooseTaxonomy(): Promise<void> {
  for (const id of ["cl1", "sub1", "ch1"]) {
    const select = Array.from(dialog().querySelectorAll<HTMLSelectElement>("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === id)
    );
    if (!select) throw new Error(`no select offering "${id}"`);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value"
      )?.set;
      setter?.call(select, id);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}

function button(text: string): HTMLButtonElement | null {
  return (
    Array.from(dialog().querySelectorAll("button")).find((b) => b.textContent?.includes(text)) ??
    null
  );
}

beforeEach(() => {
  parseImportFile.mockReset();
  commitImport.mockReset();
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.innerHTML = "";
});

describe("ImportDialog upload wiring", () => {
  it("offers a way to parse the chosen file (regression: button was unreachable)", async () => {
    await render(<ImportDialog open onOpenChange={() => {}} tree={TREE} onImported={() => {}} />);

    // Nothing to parse before a file is chosen.
    expect(button("Read the file")).toBeNull();

    await chooseTaxonomy();
    await chooseFile();

    const read = button("Read the file");
    expect(read).not.toBeNull();
    expect(read?.disabled).toBe(false);
  });

  it("parses on click and shows the preview without writing anything", async () => {
    parseImportFile.mockResolvedValue({
      ok: true,
      fileName: "template.docx",
      contentHash: "abc123",
      rows: [ROW],
      errors: [],
      targetingMismatch: null,
      blankBoxes: 3,
    });

    await render(<ImportDialog open onOpenChange={() => {}} tree={TREE} onImported={() => {}} />);
    await chooseTaxonomy();
    await chooseFile();

    await act(async () => {
      button("Read the file")?.click();
    });

    expect(parseImportFile).toHaveBeenCalledTimes(1);
    const sent = parseImportFile.mock.calls[0][0] as FormData;
    expect(sent.get("file")).toBeInstanceOf(File);
    expect(sent.get("subjectId")).toBe("sub1");
    expect(sent.get("chapterId")).toBe("ch1");
    // The parse step must not touch the database.
    expect(commitImport).not.toHaveBeenCalled();

    expect(dialog().textContent).toContain("1 question(s) read");
    expect(dialog().textContent).toContain("3 blank box(es) skipped");
    expect(dialog().textContent).toContain("Which one is a lens?");
    expect(button("Import")).not.toBeNull();
  });

  it("surfaces a failed parse instead of rendering an empty preview", async () => {
    parseImportFile.mockResolvedValue({ ok: false, error: "That file is not a .docx." });

    await render(<ImportDialog open onOpenChange={() => {}} tree={TREE} onImported={() => {}} />);
    await chooseTaxonomy();
    await chooseFile();

    await act(async () => {
      button("Read the file")?.click();
    });

    expect(dialog().textContent).not.toContain("question(s) read");
    expect(button("Import")).toBeNull();
  });
});
