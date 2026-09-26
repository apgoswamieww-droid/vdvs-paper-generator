// ============================================================
//  Paper → Word (.docx)
//
//  Mirrors the PDF engine's structure (header rows, title block,
//  sections, questions, optional answer key) and honors the same
//  PageConfig, so a paper prints the same shape in both formats.
//
//  Known limitations (documented, not accidental):
//    • KaTeX math is kept as its `$…$` source — Word cannot render it.
//    • The watermark is PDF-only (it needs a Word header part).
// ============================================================

import {
  borderlessTable,
  buildDocx,
  buildDocumentXml,
  imageExtension,
  imageRelId,
  imageRun,
  para,
  PAGE_BREAK,
  type DocxImage,
  type DocxTableCell,
} from "@/lib/docx";
import { mmToTwips, pageDimensions, type PageConfig } from "@/lib/paper-page";
import {
  normalizeHeaderConfig,
  resolveHeaderTokens,
  type HeaderCell,
  type HeaderCellsRow,
  type HeaderConfig,
  type HeaderTokenContext,
} from "@/lib/paper-header";
import { parseMatchPairs, parseMcqOptions } from "@/lib/question-options";

export type DocxLogo = DocxImage & { widthPt: number; heightPt: number };

export type DocxPaper = {
  title: string;
  totalMarks: number;
  duration: number | null;
  instructions: string | null;
  headerConfig: unknown;
  createdAt: Date;
  subject: { name: string; classLevel: { name: string } | null } | null;
  school: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    board: string | null;
    academicYear: string | null;
  } | null;
  sections: {
    title: string;
    instructions: string | null;
    totalMarks: number;
    questions: {
      marksOverride: number | null;
      question: {
        questionText: string;
        questionType: string;
        marks: number;
        options: unknown;
        answerKey: string | null;
        explanation: string | null;
      };
    }[];
  }[];
};

export type DocxBuildOptions = {
  includeAnswerKey: boolean;
  pageConfig: PageConfig;
  logo?: DocxLogo | null;
};

const NAVY = "02015C";
const DARK = "1A1A1A";
const GRAY = "555555";
const GREEN = "047857";

/** Word has no Nunito/Rasa — map onto fonts that ship with Word. */
const WORD_FONT: Record<string, string> = {
  Nunito: "Calibri",
  Rasa: "Cambria",
  "Noto Serif Gujarati": "Nirmala UI",
};

function hexToWord(hex: string, fallback = DARK): string {
  const raw = (hex ?? "").replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase();
  }
  return fallback;
}

function dividerPara(style: "single" | "double" | "dashed", color: string): string {
  const val = style === "double" ? "double" : style === "dashed" ? "dashed" : "single";
  const sz = style === "double" ? 12 : 6;
  return (
    `<w:p><w:pPr><w:pBdr>` +
    `<w:bottom w:val="${val}" w:sz="${sz}" w:space="1" w:color="${hexToWord(color, NAVY)}"/>` +
    `</w:pBdr><w:spacing w:after="140"/></w:pPr></w:p>`
  );
}

function sectPrFor(config: PageConfig): string {
  const { widthMm, heightMm } = pageDimensions(config);
  const landscape = config.orientation === "landscape";
  return (
    `<w:sectPr>` +
    `<w:pgSz w:w="${mmToTwips(widthMm)}" w:h="${mmToTwips(heightMm)}"${landscape ? ' w:orient="landscape"' : ""}/>` +
    `<w:pgMar w:top="${mmToTwips(config.margins.top)}" w:right="${mmToTwips(config.margins.right)}"` +
    ` w:bottom="${mmToTwips(config.margins.bottom)}" w:left="${mmToTwips(config.margins.left)}"` +
    ` w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`
  );
}

export function buildPaperDocx(paper: DocxPaper, options: DocxBuildOptions): Uint8Array {
  const { pageConfig, includeAnswerKey } = options;
  const fs = pageConfig.fontScale;
  const lh = pageConfig.lineHeight;
  const size = (pt: number) => Math.max(14, Math.round(pt * 2 * fs));

  const out: string[] = [];
  const answerKeyOut: string[] = [];
  const images: DocxImage[] = [];

  // Only embed the image when the header actually renders a logo —
  // otherwise the package would carry an unused media part.
  const headerConfig = normalizeHeaderConfig(paper.headerConfig);
  const hasLogoRow = headerConfig.rows.some(
    (row) => row.type === "cells" && row.cells.some((c) => c.content.type === "logo")
  );

  let logoRelId: string | null = null;
  if (options.logo && hasLogoRow) {
    images.push({
      fileName: `logo.${imageExtension(options.logo.contentType)}`,
      data: options.logo.data,
      contentType: options.logo.contentType,
    });
    // The document itself is rId1, so the first embedded image is rId2.
    logoRelId = imageRelId(0);
  }

  // ── School header ──
  // Width available to the header table, in twips.
  const contentWidthTwips = mmToTwips(
    pageDimensions(pageConfig).widthMm - pageConfig.margins.left - pageConfig.margins.right
  );

  out.push(
    ...headerParagraphs(
      headerConfig,
      paper,
      options.logo ?? null,
      logoRelId,
      fs,
      lh,
      contentWidthTwips
    )
  );

  // ── Title block ──
  out.push(
    para([{ text: paper.title, bold: true, size: size(15), color: NAVY }], 60, {
      align: "center",
      lineSpacing: lh,
    })
  );

  const meta = [
    paper.subject?.name,
    paper.subject?.classLevel?.name,
    paper.totalMarks ? `Total Marks: ${paper.totalMarks}` : null,
    paper.duration ? `Duration: ${paper.duration} min` : null,
  ]
    .filter(Boolean)
    .join("   •   ");

  if (meta) {
    out.push(
      para([{ text: meta, size: size(9.5), color: GRAY }], 160, {
        align: "center",
        lineSpacing: lh,
      })
    );
  }

  // ── Instructions ──
  if (paper.instructions) {
    out.push(para([{ text: "Instructions", bold: true, size: size(10), color: DARK }], 40, { lineSpacing: lh }));
    for (const lineOfText of paper.instructions.split("\n")) {
      if (!lineOfText.trim()) continue;
      out.push(para([{ text: lineOfText, size: size(10) }], 30, { indent: 200, lineSpacing: lh }));
    }
    out.push(para([{ text: "" }], 120));
  }

  // ── Sections ──
  for (const section of paper.sections) {
    out.push(
      para([{ text: section.title, bold: true, size: size(12), color: NAVY }], 40, { lineSpacing: lh })
    );
    out.push(dividerPara("single", "#02015c"));

    if (section.instructions) {
      out.push(
        para([{ text: section.instructions, italic: true, size: size(9.5), color: GRAY }], 100, {
          lineSpacing: lh,
        })
      );
    }

    section.questions.forEach((sq, i) => {
      const q = sq.question;
      const marks = sq.marksOverride ?? q.marks;

      out.push(
        para(
          [
            { text: `${i + 1}.  `, bold: true, size: size(11) },
            { text: q.questionText, size: size(11) },
            { text: `   [${marks}m]`, size: size(9), color: GRAY },
          ],
          40,
          { lineSpacing: lh }
        )
      );

      // MCQ choices
      const choices = parseMcqOptions(q.options);
      if (q.questionType === "MCQ" && choices.length > 0) {
        for (const opt of choices) {
          out.push(
            para([{ text: `(${opt.label})  ${opt.text}`, size: size(10.5) }], 20, {
              indent: 340,
              lineSpacing: lh,
            })
          );
        }
      }

      // Match-the-following pairs
      const pairs = parseMatchPairs(q.options);
      if (q.questionType === "MATCH_THE_FOLLOWING" && pairs.length > 0) {
        pairs.forEach((p, pi) => {
          out.push(
            para([{ text: `${pi + 1})  ${p.left}   —   ${p.right}`, size: size(10.5) }], 20, {
              indent: 340,
              lineSpacing: lh,
            })
          );
        });
      }

      // Numeric questions need room to write the value.
      if (q.questionType === "NUMERIC") {
        out.push(
          para([{ text: "Answer:  ____________________", size: size(10.5) }], 60, {
            indent: 340,
            lineSpacing: lh,
          })
        );
      }

      // Answer key — inline or collected for a separate page
      if (includeAnswerKey && (q.answerKey || q.explanation)) {
        const parts: string[] = [];
        if (q.answerKey) parts.push(para([{ text: `Answer: ${q.answerKey}`, size: size(10), color: GREEN }], 30, { indent: 340, lineSpacing: lh }));
        if (q.explanation) parts.push(para([{ text: `Explanation: ${q.explanation}`, size: size(9.5), color: GRAY }], 30, { indent: 340, lineSpacing: lh }));

        if (pageConfig.answerKeyOnNewPage) {
          answerKeyOut.push(...parts);
        } else {
          out.push(...parts);
        }
      }

      out.push(para([{ text: "" }], 60));
    });
  }

  // ── Answer key on its own page ──
  if (includeAnswerKey && pageConfig.answerKeyOnNewPage && answerKeyOut.length > 0) {
    out.push(PAGE_BREAK);
    out.push(para([{ text: "Answer Key", bold: true, size: size(14), color: NAVY }], 60, { align: "center", lineSpacing: lh }));
    out.push(dividerPara("double", "#02015c"));
    out.push(...answerKeyOut);
  }

  const documentXml = buildDocumentXml(out.join(""), sectPrFor(pageConfig));
  return buildDocx(documentXml, images);
}

// ============================================================
//  School header (structured rows)
// ============================================================

function headerParagraphs(
  config: HeaderConfig,
  paper: DocxPaper,
  logo: DocxLogo | null,
  logoRelId: string | null,
  fontScale: number,
  lineHeight: number,
  contentWidthTwips: number
): string[] {
  const out: string[] = [];
  const ctx: HeaderTokenContext = {
    examName: paper.title,
    date: paper.createdAt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    className: paper.subject?.classLevel?.name ?? "",
    subject: paper.subject?.name ?? "",
    totalMarks: String(paper.totalMarks ?? ""),
    duration: paper.duration ? `${paper.duration} minutes` : "",
    academicYear: paper.school?.academicYear ?? "",
    board: paper.school?.board ?? "",
    schoolName: paper.school?.name ?? "",
    schoolAddress: paper.school?.address ?? "",
    schoolPhone: paper.school?.phone ?? "",
  };

  const rows = config.rows;
  if (rows.length > 0) {
    for (const row of rows) {
      if (row.type === "divider") {
        out.push(dividerPara(row.style, row.color));
        continue;
      }

      // Side-by-side cells → a borderless Word table (one row, N columns).
      const gapTwips = row.cells.length > 1 ? Math.round(row.gap * 15) * (row.cells.length - 1) : 0;
      const available = Math.max(600, contentWidthTwips - gapTwips);
      const widths = columnWidthsTwips(row, available, ctx, fontScale, logo);

      const cells: DocxTableCell[] = row.cells.map((cell, ci) => ({
        widthTwips: widths[ci],
        vAlign: row.vAlign,
        paragraphs: cellParagraphs(cell, ctx, logo, logoRelId, fontScale, lineHeight),
      }));

      out.push(borderlessTable(available, cells));
      // Word needs a paragraph between consecutive tables (and at the end).
      out.push(para([{ text: "" }], 20));
    }
    return out;
  }

  // Fallback — same cascade as the PDF engine.
  const fallback = paper.school?.name;
  if (fallback) {
    out.push(para([{ text: fallback, bold: true, size: 32, color: NAVY }], 60, { align: "center", lineSpacing: lineHeight }));
  }
  return out;
}

/** Narrowest a header column may get, in twips (~6pt). */
const MIN_COL_TWIPS = 120;

/**
 * Rough natural width of a cell's content, in twips. Word cannot measure text
 * for us, so a logo falls back to its aspect ratio and text to its longest
 * rendered line at the configured size.
 */
function estimatedNaturalWidthTwips(
  cell: HeaderCell,
  ctx: HeaderTokenContext,
  fontScale: number,
  logo: DocxLogo | null
): number {
  if (cell.content.type === "logo") {
    const heightPt = cell.content.height * 0.75;
    const ratio = logo && logo.heightPt > 0 ? logo.widthPt / logo.heightPt : 1;
    return Math.round(heightPt * ratio * 20);
  }

  const longest = resolveHeaderTokens(cell.content.text, ctx)
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 0);
  // Assume ~0.5em per character and 20 twips to the point.
  return Math.round(longest * cell.content.fontSize * 0.5 * 20 * fontScale);
}

/**
 * Resolves the CSS flex model into absolute twips, mirroring headerCellFlex:
 * "auto" cells keep their natural width and the leftover space is shared by the
 * flexing cells (a number is a weight, "fill" counts as 1).
 */
export function columnWidthsTwips(
  row: HeaderCellsRow,
  availableTwips: number,
  ctx: HeaderTokenContext,
  fontScale: number,
  logo: DocxLogo | null
): number[] {
  const weights = row.cells.map((c) => (c.width === "auto" ? 0 : c.width === "fill" ? 1 : c.width));
  const natural = row.cells.map((c) =>
    c.width === "auto" ? Math.max(MIN_COL_TWIPS, estimatedNaturalWidthTwips(c, ctx, fontScale, logo)) : 0
  );

  let raw: number[];

  if (weights.every((w) => w === 0)) {
    // Everything hugs its content, so scale the estimates to fill the row.
    const total = natural.reduce((sum, n) => sum + n, 0);
    raw = total > 0 ? natural : natural.map(() => 1);
  } else {
    // Auto cells claim at most 60% of the row, so they can never starve it.
    const ceiling = Math.round(availableTwips * 0.6);
    const autoWidths = natural.map((n) => Math.min(n, ceiling));
    const used = autoWidths.reduce((sum, n) => sum + n, 0);
    const remaining = Math.max(MIN_COL_TWIPS, availableTwips - used);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

    raw = row.cells.map((_, i) =>
      weights[i] === 0 ? autoWidths[i] : (remaining * weights[i]) / totalWeight
    );
  }

  // Normalise so the column grid adds up to the table width Word is given.
  const rawTotal = raw.reduce((sum, n) => sum + n, 0) || 1;
  return raw.map((n) => Math.max(MIN_COL_TWIPS, Math.round((availableTwips * n) / rawTotal)));
}

/** Paragraphs for one header cell: a logo image or one-or-more text lines. */
function cellParagraphs(
  cell: HeaderCell,
  ctx: HeaderTokenContext,
  logo: DocxLogo | null,
  logoRelId: string | null,
  fontScale: number,
  lineHeight: number
): string {
  if (cell.content.type === "logo") {
    if (!logo || !logoRelId) return "";
    return imageRun(logoRelId, logo.widthPt, logo.heightPt, cell.align);
  }

  const text = resolveHeaderTokens(cell.content.text, ctx);
  return text
    .split("\n")
    .map((line) =>
      para(
        [
          {
            text: line,
            bold: cell.content.type === "text" ? cell.content.bold : false,
            italic: cell.content.type === "text" ? cell.content.italic : false,
            color: hexToWord(cell.content.type === "text" ? cell.content.color : DARK),
            size:
              cell.content.type === "text"
                ? Math.max(14, Math.round(cell.content.fontSize * 2 * fontScale))
                : 22,
            font:
              cell.content.type === "text"
                ? (WORD_FONT[cell.content.fontFamily] ?? WORD_FONT.Nunito)
                : undefined,
          },
        ],
        20,
        { align: cell.align, lineSpacing: lineHeight }
      )
    )
    .join("");
}
