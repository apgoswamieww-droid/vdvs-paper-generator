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
  borderedTable,
  buildDocx,
  buildDocumentXml,
  imageExtension,
  imageRelId,
  imageRun,
  para,
  PAGE_BREAK,
  type DocxImage,
  type DocxTableCell,
  type Run,
} from "@/lib/docx";
import { mmToTwips, pageDimensions, type PageConfig } from "@/lib/paper-page";
import {
  headerMetaGridCells,
  isCanvasHeader,
  normalizeCanvasLayout,
  normalizeHeaderConfig,
  resolveHeaderTokens,
  type HeaderCanvasLayout,
  type HeaderCell,
  type HeaderCellsRow,
  type HeaderConfig,
  type HeaderMetaGridRow,
  type HeaderTokenContext,
} from "@/lib/paper-header";
import { correctMcqLabels, parseMatchPairs, parseMcqOptions } from "@/lib/question-options";
import { displaySectionInstructions } from "@/lib/section-instructions";
import { type PaperDocumentType } from "@/lib/paper-document";

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
  /**
   * Which document to render. "paper" (the default) is the question paper;
   * "answer-key" and "solution" are standalone documents that carry only the
   * header plus the answers/solutions — never the paper body.
   */
  documentType?: PaperDocumentType;
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
  const { pageConfig, includeAnswerKey, documentType = "paper" } = options;
  const fs = pageConfig.fontScale;
  const lh = pageConfig.lineHeight;
  const size = (pt: number) => Math.max(14, Math.round(pt * 2 * fs));

  const out: string[] = [];
  const answerKeyOut: string[] = [];
  const images: DocxImage[] = [];

  // Only embed the image when the header actually renders a logo —
  // otherwise the package would carry an unused media part.
  const canvasHeader = isCanvasHeader(paper.headerConfig);
  const canvasLayout = canvasHeader
    ? normalizeCanvasLayout((paper.headerConfig as { canvas?: unknown }).canvas)
    : null;
  const headerConfig = normalizeHeaderConfig(paper.headerConfig);
  const hasLogo = canvasLayout
    ? canvasLayout.blocks.some((b) => b.kind === "branding")
    : headerConfig.rows.some(
        (row) => row.type === "cells" && row.cells.some((c) => c.content.type === "logo")
      );

  let logoRelId: string | null = null;
  if (options.logo && hasLogo) {
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
      contentWidthTwips,
      canvasLayout
    )
  );

  // ── Standalone documents (answer key / solution) ──
  // Exported as their own Word files: the header above is kept, the paper body
  // is not.
  if (documentType !== "paper") {
    out.push(...standaloneBody(paper, documentType, size, lh, contentWidthTwips));
    const documentXml = buildDocumentXml(out.join(""), sectPrFor(pageConfig));
    return buildDocx(documentXml, images);
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
  // Continuous numbering across sections — must match the PDF, the previews
  // and the OMR sheet.
  let questionNumber = 0;

  for (const section of paper.sections) {
    out.push(
      para([{ text: section.title, bold: true, size: size(12), color: NAVY }], 40, { lineSpacing: lh })
    );
    out.push(dividerPara("single", "#02015c"));

    const instructions = displaySectionInstructions(section.instructions);
    if (instructions) {
      out.push(
        para([{ text: instructions, italic: true, size: size(9.5), color: GRAY }], 100, {
          lineSpacing: lh,
        })
      );
    }

    const numbers: number[] = [];
    section.questions.forEach((sq) => {
      const q = sq.question;
      questionNumber += 1;
      numbers.push(questionNumber);

      out.push(
        para(
          [
            { text: `${questionNumber}.  `, bold: true, size: size(11) },
            { text: q.questionText, size: size(11) },
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

      // Answer key — inline under the question. When the answers go on their
      // own page they are collected per section after the questions instead, so
      // they can be grouped and numbered exactly like the printed paper.
      if (includeAnswerKey && !pageConfig.answerKeyOnNewPage) {
        if (q.answerKey) {
          out.push(para([{ text: `Answer: ${q.answerKey}`, size: size(10), color: GREEN }], 30, { indent: 340, lineSpacing: lh }));
        }
        if (q.explanation) {
          out.push(para([{ text: `Explanation: ${q.explanation}`, size: size(9.5), color: GRAY }], 30, { indent: 340, lineSpacing: lh }));
        }
      }

      out.push(para([{ text: "" }], 60));
    });

    // Answer key on its own page — mirror the PDF: one block per section, with
    // each answer carrying the question's continuous number (the same number
    // the paper prints beside the question).
    if (includeAnswerKey && pageConfig.answerKeyOnNewPage) {
      const sectionAnswers: string[] = [];
      section.questions.forEach((sq, i) => {
        const q = sq.question;
        if (!q.answerKey && !q.explanation) return;

        const runs: Run[] = [{ text: `${numbers[i]}.  `, bold: true, size: size(10), color: DARK }];
        if (q.answerKey) runs.push({ text: `Answer: ${q.answerKey}`, size: size(10), color: GREEN });
        sectionAnswers.push(para(runs, 30, { indent: 340, lineSpacing: lh }));

        if (q.explanation) {
          sectionAnswers.push(
            para([{ text: `Explanation: ${q.explanation}`, size: size(9.5), color: GRAY }], 40, {
              indent: 520,
              lineSpacing: lh,
            })
          );
        }
      });

      if (sectionAnswers.length > 0) {
        answerKeyOut.push(
          para([{ text: section.title, bold: true, size: size(11), color: NAVY }], 30, { lineSpacing: lh }),
          dividerPara("single", "#02015c"),
          ...sectionAnswers
        );
      }
    }
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
//  Standalone documents — answer key & solution
//
//  The Word mirror of the PDF engine's standalone bodies. Both are
//  full documents on their own (header + document title), with the
//  questions numbered per section exactly like the paper.
// ============================================================

function standaloneBody(
  paper: DocxPaper,
  documentType: PaperDocumentType,
  size: (pt: number) => number,
  lh: number,
  contentWidthTwips: number
): string[] {
  const isSolution = documentType === "solution";
  const out: string[] = [];

  out.push(
    para(
      [
        {
          text: isSolution ? "Solution" : "Answer Key",
          bold: true,
          size: size(16),
          color: NAVY,
        },
      ],
      30,
      { align: "center", lineSpacing: lh }
    )
  );
  out.push(
    para([{ text: paper.title, size: size(10), color: GRAY }], 60, {
      align: "center",
      lineSpacing: lh,
    })
  );
  out.push(dividerPara("double", "#02015c"));

  let hasContent = false;

  /** Word mirror of the PDF answer-key list: bordered "1 - A" rows. */
  const answerListTable = (
    rows: { number: number; answer: string }[],
    sz: (pt: number) => number,
    widthTwips: number
  ): string => {
    const cellWidth = Math.max(600, Math.floor(widthTwips));
    return borderedTable(
      widthTwips,
      rows.map((row) => [
        {
          widthTwips: cellWidth,
          vAlign: "center" as const,
          paragraphs: para(
            [
              { text: `${row.number} -  `, bold: true, size: sz(10.5), color: DARK },
              { text: row.answer, size: sz(10.5), color: GREEN },
            ],
            0,
            { lineSpacing: lh }
          ),
        },
      ]),
      "94a3b8"
    );
  };

  // Continuous numbering across sections — matches the paper, the PDF and the
  // OMR sheet.
  let questionNumber = 0;

  for (const section of paper.sections) {
    const body: string[] = [];
    const listRows: { number: number; answer: string }[] = [];

    section.questions.forEach((sq) => {
      const q = sq.question;
      questionNumber += 1;

      if (isSolution) {
        // Question + its choices first, then the model answer and workings.
        body.push(
          para(
            [
              { text: `${questionNumber}.  `, bold: true, size: size(11), color: DARK },
              { text: q.questionText, size: size(11) },
            ],
            30,
            { lineSpacing: lh }
          )
        );

        const choices = parseMcqOptions(q.options);
        if (q.questionType === "MCQ" && choices.length > 0) {
          // Word has no background shading in this writer, so the correct
          // option is called out with a tick + green bold text instead.
          const correct = new Set(correctMcqLabels(choices, q.answerKey));
          for (const opt of choices) {
            const isCorrect = correct.has(opt.label);
            const runs: Run[] = isCorrect
              ? [
                  { text: "\u2713  ", bold: true, size: size(10.5), color: GREEN },
                  { text: `(${opt.label})  ${opt.text}`, bold: true, size: size(10.5), color: GREEN },
                ]
              : [{ text: `(${opt.label})  ${opt.text}`, size: size(10.5) }];
            body.push(para(runs, 20, { indent: isCorrect ? 200 : 340, lineSpacing: lh }));
          }
        }

        body.push(
          q.answerKey
            ? para([{ text: `Answer: ${q.answerKey}`, size: size(10.5), color: GREEN }], 30, {
                indent: 340,
                lineSpacing: lh,
              })
            : para(
                [{ text: "Answer: Not provided", size: size(10.5), color: GRAY }],
                30,
                { indent: 340, lineSpacing: lh }
              )
        );

        body.push(
          q.explanation
            ? para([{ text: `Solution: ${q.explanation}`, size: size(10), color: GRAY }], 60, {
                indent: 340,
                lineSpacing: lh,
              })
            : para([{ text: "" }], 60)
        );

        hasContent = true;
        return;
      }

      // Answer key — answers only, no explanations (they live in the solution).
      if (!q.answerKey) return;
      hasContent = true;
      listRows.push({ number: questionNumber, answer: q.answerKey });
    });

    if (body.length > 0 || listRows.length > 0) {
      out.push(
        para([{ text: section.title, bold: true, size: size(12), color: NAVY }], 30, {
          lineSpacing: lh,
        })
      );
      out.push(dividerPara("single", "#02015c"));
      out.push(...body);
      if (listRows.length > 0) out.push(answerListTable(listRows, size, contentWidthTwips));
    }
  }

  if (!hasContent) {
    out.push(
      para(
        [
          {
            text: isSolution
              ? "This paper has no questions yet."
              : "No answers have been added to this paper yet.",
            italic: true,
            size: size(10),
            color: GRAY,
          },
        ],
        60,
        { align: "center", lineSpacing: lh }
      )
    );
  }

  return out;
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
  contentWidthTwips: number,
  canvasLayout: HeaderCanvasLayout | null = null
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

  // Canvas (v2) — Word can't do absolute positioning, so blocks are stacked
  // in stored order (logo → name → meta bar). Documented approximation.
  if (canvasLayout) {
    for (const block of canvasLayout.blocks) {
      if (!block.visible) continue;

      if (block.kind === "branding") {
        if (logo && logoRelId) {
          out.push(imageRun(logoRelId, logo.widthPt, logo.heightPt, block.align));
          out.push(para([{ text: "" }], 20));
        }
        if (block.showContact) {
          const contact = resolveHeaderTokens("{{schoolAddress}}  •  {{schoolPhone}}", ctx).trim();
          if (contact) {
            out.push(
              para([{ text: contact, size: 18, color: GRAY, font: WORD_FONT.Nunito }], 20, {
                align: block.align,
                lineSpacing: lineHeight,
              })
            );
          }
        }
        continue;
      }

      if (block.kind === "identity") {
        const name = resolveHeaderTokens(block.nameText, ctx).trim();
        if (name) {
          out.push(
            para(
              [
                {
                  text: name,
                  bold: true,
                  size: Math.max(14, Math.round(block.fontSize * 2 * fontScale)),
                  color: hexToWord(block.color, NAVY),
                  font: WORD_FONT.Rasa,
                },
              ],
              40,
              { align: block.align, lineSpacing: lineHeight }
            )
          );
        }
        const address = resolveHeaderTokens(block.addressText, ctx).trim();
        if (address) {
          out.push(
            para([{ text: address, size: 18, color: GRAY, font: WORD_FONT.Nunito }], 20, {
              align: block.align,
              lineSpacing: lineHeight,
            })
          );
        }
        continue;
      }

      // metaGrid block → same bordered table as a row
      const row: HeaderMetaGridRow = {
        id: block.id,
        type: "metaGrid",
        section: block.section,
        showSection: block.showSection,
        showClass: block.showClass,
        showDate: block.showDate,
        showDuration: block.showDuration,
        showTotalMarks: block.showTotalMarks,
        showSubject: block.showSubject,
        color: block.color,
      };
      out.push(metaGridPara(row, ctx, lineHeight, contentWidthTwips));
    }
    return out;
  }

  const rows = config.rows;
  if (rows.length > 0) {
    for (const row of rows) {
      if (row.type === "divider") {
        out.push(dividerPara(row.style, row.color));
        continue;
      }

      if (row.type === "metaGrid") {
        out.push(metaGridPara(row, ctx, lineHeight, contentWidthTwips));
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
 * The boxed meta grid (Section / Class / Date / Time / Marks) as a single-row
 * Word table whose borders use the grid's color — the DOCX mirror of the PDF
 * engine's bordered grid and of HeaderRenderer.
 */
function metaGridPara(
  row: HeaderMetaGridRow,
  ctx: HeaderTokenContext,
  lineHeight: number,
  contentWidthTwips: number
): string {
  const cells = headerMetaGridCells(row, ctx);
  if (cells.length === 0) return "";

  const width = Math.max(600, contentWidthTwips);
  const color = hexToWord(row.color, NAVY);
  const cellWidth = Math.round(width / cells.length);

  const docxCells: DocxTableCell[] = cells.map((c) => ({
    widthTwips: cellWidth,
    vAlign: "center",
    paragraphs:
      para(
        [
          {
            text: c.label.toUpperCase(),
            bold: true,
            size: 14,
            color,
            font: WORD_FONT.Nunito,
          },
        ],
        20,
        { align: "center", lineSpacing: lineHeight }
      ) +
      para(
        [
          {
            text: c.value,
            bold: true,
            size: 20,
            color: DARK,
            font: WORD_FONT.Nunito,
          },
        ],
        20,
        { align: "center", lineSpacing: lineHeight }
      ),
  }));

  const table = borderlessTable(width, docxCells, color);
  return `${table}${para([{ text: "" }], 20)}`;
}

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
