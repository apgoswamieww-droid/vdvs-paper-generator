"use client";

// ============================================================
//  Paper Sheet — presents the paper as a real (A4) page of
//  paper: white sheet at the exact page dimensions and margins
//  from the page config, floating on a neutral backdrop. Lets
//  authors see true print layout (bleed, gutters, overflow)
//  instead of an unconstrained white box.
// ============================================================

import type { ReactNode } from "react";
import {
  BASE_FONT_PT,
  DEFAULT_PAGE_CONFIG,
  normalizePageConfig,
  pageDimensions,
  type PageConfig,
} from "@/lib/paper-page";

export function PaperSheet({
  config,
  children,
}: {
  config: PageConfig;
  children: ReactNode;
}) {
  const cfg = normalizePageConfig(config ?? DEFAULT_PAGE_CONFIG);
  const { widthMm, heightMm } = pageDimensions(cfg);
  const { top, right, bottom, left } = cfg.margins;

  return (
    <div className="max-w-full overflow-x-auto rounded-xl bg-slate-200/60 p-4 dark:bg-slate-800/60">
      <div
        className="mx-auto bg-white text-black shadow-xl shadow-slate-400/40 ring-1 ring-slate-300 dark:shadow-black/50 dark:ring-slate-600"
        style={{
          width: `${widthMm.toFixed(2)}mm`,
          minHeight: `${heightMm.toFixed(2)}mm`,
          padding: `${top}mm ${right}mm ${bottom}mm ${left}mm`,
          boxSizing: "border-box",
          fontSize: `${(BASE_FONT_PT * cfg.fontScale).toFixed(2)}pt`,
          lineHeight: cfg.lineHeight,
        }}
      >
        {children}
      </div>
    </div>
  );
}