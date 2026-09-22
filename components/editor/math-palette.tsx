"use client";

// ============================================================
//  MathPalette — MathType-like formula builder dialog.
//  - Category tabs of LaTeX templates
//  - Live KaTeX preview while building the expression
//  - Applied via onApply(tex) → inserted at the caret in $...$
// ============================================================

import { useMemo, useState } from "react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MATH_CATEGORIES } from "./math-presets";
import katex from "katex";

function renderKaTeX(tex: string, displayMode = false): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    return tex;
  }
}

function initialCategoryId(tex: string): string {
  return (
    MATH_CATEGORIES.find((c) => c.presets.some((p) => p.tex === tex))?.id ??
    MATH_CATEGORIES[0].id
  );
}

export function MathPalette({
  open,
  onOpenChange,
  onApply,
  mode,
  initialTex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tex: string) => void;
  mode: "insert" | "update";
  initialTex: string;
}) {
  // The parent remounts this dialog (via a changing `key`) every time it
  // opens, so state seeded from props here is always fresh on open.
  const [active, setActive] = useState(initialCategoryId(initialTex));
  const [tex, setTex] = useState(initialTex);

  const activeCategory = useMemo(
    () => MATH_CATEGORIES.find((c) => c.id === active) ?? MATH_CATEGORIES[0],
    [active]
  );

  const previewHtml = renderKaTeX(tex);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Math editor</DialogTitle>
          <DialogDescription>
            {mode === "update"
              ? "Edit the formula below — it replaces the selected math."
              : "Pick a template, tweak it, then insert into the question."}
          </DialogDescription>
        </DialogHeader>

        {/* Live preview */}
        <div className="min-h-14 overflow-x-auto rounded-lg border border-indigo-500/30 bg-zinc-950 px-3 py-2.5 text-zinc-100">
          <div
            className="katex-anchor"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1">
          {MATH_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                active === c.id
                  ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Preset grid */}
        <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {activeCategory.presets.map((p) => (
            <button
              key={p.tex}
              type="button"
              onClick={() => setTex(p.tex)}
              className={cn(
                "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
                tex === p.tex
                  ? "border-indigo-400/50 bg-indigo-500/10"
                  : "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900"
              )}
            >
              <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-zinc-300 group-hover:text-zinc-100">
                {p.label}
              </span>
              <span
                className="shrink-0 overflow-hidden text-xs text-indigo-300"
                dangerouslySetInnerHTML={{ __html: renderKaTeX(p.tex) }}
              />
            </button>
          ))}
        </div>

        {/* Raw LaTeX input */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            LaTeX <span className="text-zinc-600">(you can edit it directly)</span>
          </label>
          <input
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            spellCheck={false}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-sm text-zinc-200 outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const clean = tex.trim();
              if (!clean) return;
              onApply(clean);
            }}
          >
            {mode === "update" ? "Update math" : "Insert math"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}