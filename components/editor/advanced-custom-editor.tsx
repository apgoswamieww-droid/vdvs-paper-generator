"use client";

// ============================================================
//  AdvancedCustomEditor — MathType-like contentEditable editor.
//
//  - Types plain text (English / Gujarati / any Unicode) directly.
//  - Math is inserted from the Σ palette as live KaTeX "chips"
//    (serialized back to $...$ — same format the app already
//    renders with KaTeXRenderer).
//  - Paste or upload an image to OCR English/Gujarati text.
//  - Virtual Gujarati keyboard + transliteration helper.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "cn";
import { Braces, Keyboard, PenLine, ScanText, X } from "lucide-react";
import { MathPalette } from "./math-palette";
import { GujaratiKeyboard } from "./gujarati-keyboard";
import { OCRDialog } from "./ocr-dialog";
import { getMathMLFromClip, mathmlToLatex } from "./mathml";

// ------------------------------------------------------------
//  DOM ⇄ text helpers (module scope, no React re-renders)
// ------------------------------------------------------------

const MATH_RE = /\$([^$\n]+?)\$/g;

type Segment = { type: "text" | "math"; value: string };

function splitSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "math", value: m[1] });
    last = MATH_RE.lastIndex;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function createChip(tex: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "math-chip";
  span.setAttribute("contenteditable", "false");
  span.dataset.math = tex;
  try {
    span.innerHTML = katex.renderToString(tex.trim(), {
      displayMode: false,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    span.textContent = tex;
  }
  return span;
}

function appendText(root: HTMLElement, text: string) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) root.appendChild(document.createElement("br"));
    root.appendChild(document.createTextNode(line));
  });
}

function hydrate(root: HTMLElement, value: string) {
  root.textContent = "";
  for (const seg of splitSegments(value)) {
    if (seg.type === "math") root.appendChild(createChip(seg.value));
    else appendText(root, seg.value);
  }
}

function serializeContent(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains("math-chip")) {
      parts.push(`$${node.dataset.math ?? ""}$`);
      return;
    }
    if (node.tagName === "BR") {
      parts.push("\n");
      return;
    }
    if (node.tagName === "DIV" || node.tagName === "P") {
      node.childNodes.forEach(walk);
      parts.push("\n");
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return parts
    .join("")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[\t\xa0 ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function saveRange(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  return root.contains(r.commonAncestorContainer) ? r.cloneRange() : null;
}

function restoreRange(root: HTMLElement, range: Range | null) {
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  if (range && root.contains(range.commonAncestorContainer)) sel.addRange(range);
  root.focus();
}

function insertNodeAtCaret(node: Node, root: HTMLElement) {
  const sel = window.getSelection();
  let range =
    sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer)
      ? sel.getRangeAt(0).cloneRange()
      : null;
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  root.focus();
}

function insertLineBreakAtCaret(root: HTMLElement) {
  insertNodeAtCaret(document.createElement("br"), root);
}

function focusAfter(node: Node, root: HTMLElement) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
  root.focus();
}

// ------------------------------------------------------------
//  Component
// ------------------------------------------------------------

type PaletteState = { open: boolean; mode: "insert" | "update"; tex: string };

export function AdvancedCustomEditor({
  value,
  onChange,
  placeholder = "Type the question in English or ગુજરાતી… use Σ for math, or paste an image to OCR it.",
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Smaller height/padding — used for MCQ option rows. */
  compact?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef(value);
  const savedRangeRef = useRef<Range | null>(null);
  const selectedChipRef = useRef<HTMLElement | null>(null);

  const [chipSelected, setChipSelected] = useState(false);
  const [palette, setPalette] = useState<PaletteState>({
    open: false,
    mode: "insert",
    tex: "\\frac{a}{b}",
  });
  const [paletteRevision, setPaletteRevision] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrRevision, setOcrRevision] = useState(0);
  const [ocrSeed, setOcrSeed] = useState<string | null>(null);

  const openMathPalette = (mode: "insert" | "update", tex: string) => {
    setPaletteRevision((r) => r + 1);
    setPalette({ open: true, mode, tex });
  };

  const openOcr = (seed?: string) => {
    stashRange();
    setOcrSeed(seed ?? null);
    setOcrRevision((r) => r + 1);
    setOcrOpen(true);
  };

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const text = serializeContent(root);
    if (text !== lastEmittedRef.current) {
      lastEmittedRef.current = text;
      onChange(text);
    }
  }, [onChange]);

  const clearSelection = useCallback(() => {
    if (selectedChipRef.current) {
      selectedChipRef.current.classList.remove("math-chip-selected");
      selectedChipRef.current = null;
    }
    setChipSelected(false);
  }, []);

  // hydrate once on mount
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    hydrate(root, value);
    lastEmittedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-hydrate only when the value changes from OUTSIDE this component
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (value === lastEmittedRef.current) return;
    const current = serializeContent(root);
    if (value === current) {
      lastEmittedRef.current = value;
      return;
    }
    hydrate(root, value);
    lastEmittedRef.current = value;
    clearSelection();
  }, [value, clearSelection]);

  // ---------- editor events ----------

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      insertLineBreakAtCaret(rootRef.current!);
      emit();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clip = e.clipboardData;
    if (!clip) return;

    // Screenshot on the clipboard → hand it to the OCR dialog
    const imgItem = Array.from(clip.items ?? []).find((it) =>
      it.type.startsWith("image/")
    );
    const file = imgItem?.getAsFile();
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        openOcr(typeof reader.result === "string" ? reader.result : undefined);
      };
      reader.readAsDataURL(file);
      return;
    }

    // MathML on the clipboard (copied from MathType / Word / web) →
    // convert to LaTeX and insert as an editable math chip
    const mml = getMathMLFromClip(clip);
    if (mml) {
      const latex = mathmlToLatex(mml);
      if (latex) {
        insertNodeAtCaret(createChip(latex), rootRef.current!);
        emit();
        return;
      }
    }

    // Plain text paste (applies to both English and Gujarati typing)
    const text = clip.getData("text/plain");
    if (text) {
      insertNodeAtCaret(document.createTextNode(text), rootRef.current!);
      emit();
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const chip = target.closest<HTMLElement>(".math-chip");
    clearSelection();
    if (chip) {
      selectedChipRef.current = chip;
      chip.classList.add("math-chip-selected");
      setChipSelected(true);
    }
  };

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const chip = target.closest<HTMLElement>(".math-chip");
    if (chip) {
      e.preventDefault();
      selectedChipRef.current = chip;
      chip.classList.add("math-chip-selected");
      setChipSelected(true);
      openMathPalette("update", chip.dataset.math ?? "");
    }
  };

  // ---------- toolbar actions ----------

  const stashRange = () => {
    const root = rootRef.current;
    if (!root) return;
    savedRangeRef.current = saveRange(root);
  };

  const openPalette = () => {
    const chip = selectedChipRef.current;
    if (chip && chip.isConnected) {
      openMathPalette("update", chip.dataset.math ?? "");
    } else {
      stashRange();
      openMathPalette("insert", "\\frac{a}{b}");
    }
  };

  const applyMath = (tex: string) => {
    const root = rootRef.current;
    if (!root) return;
    const chip = selectedChipRef.current;
    if (palette.mode === "update" && chip && chip.isConnected) {
      chip.dataset.math = tex;
      try {
        chip.innerHTML = katex.renderToString(tex.trim(), {
          displayMode: false,
          throwOnError: false,
          strict: false,
          output: "html",
        });
      } catch {
        chip.textContent = tex;
      }
      chip.classList.add("math-chip-selected");
      focusAfter(chip, root);
    } else {
      clearSelection();
      restoreRange(root, savedRangeRef.current);
      insertNodeAtCaret(createChip(tex), root);
    }
    emit();
    setPalette((p) => ({ ...p, open: false }));
  };

  const deleteChip = () => {
    const root = rootRef.current;
    const chip = selectedChipRef.current;
    if (!root || !chip || !chip.isConnected) return;
    const after = chip.nextSibling ?? chip.previousSibling;
    chip.remove();
    clearSelection();
    if (after instanceof Node) focusAfter(after, root);
    emit();
  };

  const insertText = (text: string) => {
    const root = rootRef.current;
    if (!root) return;
    restoreRange(root, savedRangeRef.current);
    insertNodeAtCaret(document.createTextNode(text), root);
    emit();
  };

  const closeDialogs = () => {
    setPalette((p) => ({ ...p, open: false }));
    setKeyboardOpen(false);
    setOcrOpen(false);
    const root = rootRef.current;
    if (root) restoreRange(root, savedRangeRef.current);
    clearSelection();
  };

  // ---------- render ----------

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-zinc-950 transition-shadow",
        "border-zinc-800 focus-within:ring-2 focus-within:ring-indigo-500/40"
      )}
    >
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-950 px-2 py-1.5">
        <ToolbarButton
          title="Insert math (Σ) — click or select a formula, live KaTeX preview"
          onClick={openPalette}
          disabled={disabled}
          active={palette.open}
        >
          <Braces className="size-3.5" />
          <span className="ml-1 hidden text-xs sm:inline">Math</span>
        </ToolbarButton>
        <ToolbarButton
          title="Insert text from an image (OCR — English + Gujarati)"
          onClick={() => openOcr()}
          disabled={disabled}
          active={ocrOpen}
        >
          <ScanText className="size-3.5" />
          <span className="ml-1 hidden text-xs sm:inline">OCR</span>
        </ToolbarButton>
        <ToolbarButton
          title="Gujarati keyboard & transliteration"
          onClick={() => {
            stashRange();
            setKeyboardOpen(true);
          }}
          disabled={disabled}
          active={keyboardOpen}
        >
          <Keyboard className="size-3.5" />
          <span className="ml-1 hidden text-xs sm:inline">ગુજરાતી</span>
        </ToolbarButton>

        {chipSelected && (
          <>
            <span className="mx-1 h-4 w-px bg-zinc-700" />
            <ToolbarButton
              title="Edit selected math"
              onClick={() =>
                openMathPalette(
                  "update",
                  selectedChipRef.current?.dataset.math ?? ""
                )
              }
              disabled={disabled}
            >
              <PenLine className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Remove selected math"
              onClick={deleteChip}
              danger
              disabled={disabled}
            >
              <X className="size-3.5" />
            </ToolbarButton>
          </>
        )}

        <span className="ml-auto hidden select-none text-[11px] text-zinc-600 md:inline">
          math is stored as $...$ (KaTeX)
        </span>
      </div>

      {/* editable surface */}
      <div
        ref={rootRef}
        data-placeholder={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline="true"
        onInput={emit}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDrop={(e) => e.preventDefault()}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onBlur={() => {
          emit();
          clearSelection();
        }}
        className={cn(
          "math-editor cursor-text text-sm leading-7 text-zinc-100 outline-none",
          compact ? "min-h-16 px-2.5 py-1.5 leading-6" : "min-h-28 px-3 py-2"
        )}
      />

      {/* dialogs */}
      <MathPalette
        key={`palette:${paletteRevision}`}
        open={palette.open}
        onOpenChange={(o) => {
          if (!o) closeDialogs();
          else setPalette((p) => ({ ...p, open: true }));
        }}
        onApply={applyMath}
        mode={palette.mode}
        initialTex={palette.tex}
      />
      <GujaratiKeyboard
        open={keyboardOpen}
        onOpenChange={(o) => (!o ? closeDialogs() : setKeyboardOpen(true))}
        onInsert={insertText}
      />
      <OCRDialog
        key={`ocr:${ocrRevision}`}
        open={ocrOpen}
        onOpenChange={(o) => (!o ? closeDialogs() : setOcrOpen(true))}
        onInsert={insertText}
        initialImage={ocrSeed}
      />
    </div>
  );
}

// ------------------------------------------------------------
//  Small toolbar button (plain <button>, keeps editor chrome light)
// ------------------------------------------------------------

function ToolbarButton({
  title,
  onClick,
  disabled,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
        active
          ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200"
          : danger
            ? "border-zinc-800 text-zinc-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
      )}
    >
      {children}
    </button>
  );
}