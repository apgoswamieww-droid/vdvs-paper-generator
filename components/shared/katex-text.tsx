"use client";

// ============================================================
//  Rich text renderer for the Question Bank.
//
//  Supports:
//   - KaTeX math: $inline$ and $$display$$
//   - Gujarati / any Unicode text (renders as-is)
//
//  Used both for live preview in the question form and for
//  read-only rendering in the question table.
// ============================================================

import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "cn";

export function KaTeXRenderer({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <span className={cn("katex-host", className)}>{renderRichText(text)}</span>;
}

/**
 * Splits text on $...$ / $$...$$ and renders math via KaTeX,
 * leaving everything else (incl. Gujarati) untouched.
 */
export function renderRichText(text: string): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  // $$...$$ (display) first, then $...$ (inline)
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={`t${key++}`}>{text.slice(last, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      nodes.push(renderMath(match[1], true, key++));
    } else if (match[2] !== undefined) {
      nodes.push(renderMath(match[2], false, key++));
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    nodes.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
  }
  return nodes;
}

function renderMath(tex: string, displayMode: boolean, key: number): React.ReactNode {
  let html: string;
  try {
    html = katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    return <code key={key}>{tex}</code>;
  }
  return (
    <span
      key={key}
      className={displayMode ? "block my-2 overflow-x-auto" : "inline-block align-middle"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
