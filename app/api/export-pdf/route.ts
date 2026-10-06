import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  buildHeaderContext,
  headerConfigToHTML,
  normalizeHeaderConfig,
  type HeaderConfig,
} from "@/lib/paper-header";
import {
  isLandscape,
  normalizePageConfig,
  pageSetupCss,
  pdfFormat,
  type PageConfig,
} from "@/lib/paper-page";
import {
  correctMcqLabels,
  mcqOptionsLayout,
  parseMcqLayout,
  parseMcqOptions,
} from "@/lib/question-options";
import {
  documentFileSuffix,
  isPaperDocumentType,
  type PaperDocumentType,
} from "@/lib/paper-document";
import { displaySectionInstructions } from "@/lib/section-instructions";
import {
  applySetTransform,
  normalizeSetCount,
  setLabel,
} from "@/lib/paper-sets";
import katex from "katex";

// ============================================================
//  POST /api/export-pdf
//  Body: { paperId: string, documentType?: "paper" | "answer-key" | "solution" | "omr",
//          includeAnswerKey?: boolean, pageOverrides?: PageConfig,
//          setCount?: number }
//
//  Renders a styled HTML layout — the paper, or its separate answer key /
//  solution / OMR sheet — into a pixel-perfect, print-ready PDF using Puppeteer
//  (puppeteer-core). Supports Gujarati Unicode fonts and KaTeX math.
//
//  Multiple sets: when the paper (or the request) asks for more than one set,
//  each set is the same paper reshuffled from a per-set seed — question order
//  inside sections and MCQ option order both move — so every set carries its
//  own answer key, solution and OMR sheet inside the one document.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // ── Auth: require session + tenant scoping ──
    const session = await requireSession();
    const body = await request.json();
    const {
      paperId,
      includeAnswerKey = false,
      pageOverrides,
      documentType: rawDocumentType,
      setCount: rawSetCount,
    } = body;
    const documentType: PaperDocumentType = isPaperDocumentType(rawDocumentType)
      ? rawDocumentType
      : "paper";

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 });
    }

    // Fetch the paper — scoped to the authenticated user's school
    const paper = await prisma.paper.findFirst({
      where: { id: paperId, schoolId: session.schoolId },
      select: {
        id: true,
        title: true,
        setCount: true,
        totalMarks: true,
        passingMarks: true,
        duration: true,
        instructions: true,
        schoolHeader: true,
        watermarkText: true,
        pageConfig: true,
        createdAt: true,
        headerTemplate: { select: { config: true } },
        subject: {
          select: {
            name: true,
            classLevel: { select: { name: true } },
          },
        },
        school: {
          select: {
            name: true,
            logoUrl: true,
            address: true,
            phone: true,
            board: true,
            academicYear: true,
            headerConfig: true,
          },
        },
        sections: {
          orderBy: { order: "asc" },
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: {
                question: {
                  select: {
                    id: true,
                    questionText: true,
                    questionType: true,
                    difficulty: true,
                    marks: true,
                    options: true,
                    answerKey: true,
                    explanation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }

    // Page setup: the paper's saved config, optionally overridden for this export.
    const pageConfig = normalizePageConfig(pageOverrides ?? paper.pageConfig);

    // Sets: the request may override the paper's own set count (e.g. export
    // a single set while the paper is configured for four).
    const setCount = normalizeSetCount(rawSetCount ?? paper.setCount);

    // Build the HTML for the requested document kind
    const html = buildExportHTML(paper, includeAnswerKey, pageConfig, documentType, setCount);

    // Generate PDF with Puppeteer
    const pdfBuffer = await generatePDF(html, pageConfig, documentType);

    const baseName = paper.title.replace(/[^a-zA-Z0-9]/g, "_") || "paper";
    const setsSuffix = setCount > 1 ? "_all_sets" : "";

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${baseName}${documentFileSuffix(documentType)}${setsSuffix}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF. Please try again." },
      { status: 500 }
    );
  }
}

// ============================================================
//  HTML Builder
// ============================================================

/** The paper shape every document kind renders from (see the POST select). */
type PaperForExport = {
  id: string;
  title: string;
  setCount: number;
  totalMarks: number;
  passingMarks: number | null;
  duration: number | null;
  instructions: string | null;
  schoolHeader: string | null;
  watermarkText: string | null;
  pageConfig: unknown;
  createdAt: Date;
  /** Selected heading template (wins over the school default header). */
  headerTemplate: { config: unknown } | null;
  subject: { name: string; classLevel: { name: string } | null } | null;
  school: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    board: string | null;
    academicYear: string | null;
    headerConfig: unknown;
  } | null;
  sections: {
    title: string;
    instructions: string | null;
    totalMarks: number;
    negativeMarks: number | null;
    questions: {
      order: number;
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

/**
 * Entry point for every export: renders one document per set and stitches the
 * set pages into a single file (the head/CSS come from the first set).
 *
 * Each per-set document is a complete HTML page, so we keep the first
 * document's <head> (the styles are identical) and concatenate only its
 * `<div class="page">` blocks — page breaks, footers and the per-set heading
 * stay intact.
 */
function buildExportHTML(
  paper: PaperForExport,
  includeAnswerKey: boolean,
  pageConfig: PageConfig,
  documentType: PaperDocumentType,
  setCount: number
): string {
  const sets = normalizeSetCount(setCount);
  if (sets <= 1) {
    return buildPaperHTML(paper, includeAnswerKey, pageConfig, documentType, null);
  }

  const documents: string[] = [];
  for (let i = 0; i < sets; i++) {
    const setPaper = applySetTransform(paper, i, paper.id);
    documents.push(
      buildPaperHTML(setPaper, includeAnswerKey, pageConfig, documentType, setLabel(i))
    );
  }

  const first = documents[0];
  const headEnd = first.search(/<body[\s>]/i);
  if (headEnd < 0) return first;

  const head = first.slice(0, first.indexOf(">", headEnd) + 1);
  const fragments = documents.map((doc) => pageFragment(doc));
  // Everything in the first body before its page div (the watermark) is kept.
  const prefix = first
    .slice(first.indexOf(">", headEnd) + 1)
    .split('<div class="page">')[0];

  return `${head}${prefix}${fragments.join(
    '\n  <div class="set-break"></div>\n'
  )}\n</body>\n</html>`;
}

/** The `<div class="page">…</div>` block of a rendered set document. */
function pageFragment(doc: string): string {
  const body = doc.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? doc;
  const start = body.indexOf('<div class="page">');
  if (start < 0) return "";
  const tail = body.slice(start);
  const end = tail.lastIndexOf("</div>");
  return end < 0 ? tail : tail.slice(0, end + "</div>".length);
}

function buildPaperHTML(
  paper: PaperForExport,
  includeAnswerKey: boolean,
  pageConfig: PageConfig,
  documentType: PaperDocumentType = "paper",
  setBadge: string | null = null
): string {
  const mathCSS = getKaTeXCSS();
  const mathFonts = getMathFonts();

  let sectionsHTML = "";

  // Answers collected for a trailing answer-key page.
  const answerKeyBlocks: string[] = [];

  // Continuous numbering across sections — the paper, answer key, solution and
  // OMR sheet must all label the same question with the same number (the
  // online exam view already runs flat over every section).
  let questionNumber = 0;

  for (const section of paper.sections) {
    let questionsHTML = "";
    const sectionNumbers: number[] = [];

    for (let i = 0; i < section.questions.length; i++) {
      const sq = section.questions[i];
      const q = sq.question;
      questionNumber += 1;
      sectionNumbers.push(questionNumber);
      const qText = renderKaTeX(q.questionText);
      const isMCQ = q.questionType === "MCQ";
      const isNumeric = q.questionType === "NUMERIC";
      const options = isMCQ ? parseMcqOptions(q.options) : [];

      let optionsHTML = "";
      if (isMCQ && options.length > 0) {
        const layout = mcqOptionsLayout(
          options.map((opt) => opt.text),
          parseMcqLayout(q.options)
        );
        optionsHTML = `
          <div class="mcq-options opts-${layout}">
            ${options.map((opt) => `
              <div class="mcq-option">
                <span class="option-label">(${opt.label})</span>
                <span class="option-text">${renderKaTeX(opt.text)}</span>
              </div>
            `).join("")}
          </div>
        `;
      }

      let answerHTML = "";
      if (includeAnswerKey && !pageConfig.answerKeyOnNewPage && q.answerKey) {
        answerHTML = `
          <div class="answer-key">
            <strong>Answer:</strong> ${renderKaTeX(q.answerKey)}
          </div>
        `;
      }

      let explanationHTML = "";
      if (includeAnswerKey && !pageConfig.answerKeyOnNewPage && q.explanation) {
        explanationHTML = `
          <div class="explanation">
            <strong>Explanation:</strong> ${renderKaTeX(q.explanation)}
          </div>
        `;
      }

      questionsHTML += `
        <div class="question">
          <div class="question-header">
            <span class="question-number">${questionNumber}.</span>
            <span class="question-text">${qText}</span>
          </div>
          ${optionsHTML}
          ${isNumeric ? `<div class="numeric-answer">Answer: ____________________</div>` : ""}
          ${answerHTML}
          ${explanationHTML}
        </div>
      `;
    }

    // Separate answer-key page — collected here, appended after all sections.
    if (includeAnswerKey && pageConfig.answerKeyOnNewPage) {
      const sectionAnswers = section.questions
        .map((sq, i) => {
          const q = sq.question;
          if (!q.answerKey && !q.explanation) return "";
          return `
            <div class="ak-item">
              <span class="question-number">${sectionNumbers[i]}.</span>
              <div class="ak-body">
                ${q.answerKey ? `<div class="answer-key"><strong>Answer:</strong> ${renderKaTeX(q.answerKey)}</div>` : ""}
                ${q.explanation ? `<div class="explanation"><strong>Explanation:</strong> ${renderKaTeX(q.explanation)}</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      if (sectionAnswers) {
        answerKeyBlocks.push(`
          <div class="section">
            <div class="section-header"><h3>${escapeHTML(section.title)}</h3></div>
            ${sectionAnswers}
          </div>
        `);
      }
    }

    sectionsHTML += `
      <div class="section">
        <div class="section-header">
          <h3>${escapeHTML(section.title)}</h3>
          <span class="section-marks">(${section.totalMarks} marks${
            section.negativeMarks ? ` · −${section.negativeMarks} per wrong` : ""
          })</span>
        </div>
        ${displaySectionInstructions(section.instructions) ? `<p class="section-instructions">${escapeHTML(displaySectionInstructions(section.instructions) ?? "")}</p>` : ""}
        <div class="section-questions">
          ${questionsHTML}
        </div>
      </div>
    `;
  }

  const title = escapeHTML(paper.title);
  const instructions = paper.instructions ? escapeHTML(paper.instructions) : "";
  // The OMR sheet is scanned — a watermark behind the bubbles corrupts
  // thresholding, so it never prints on this document type.
  const watermark = documentType === "omr" ? "" : paper.watermarkText || "";

  // Header: the school's reusable header design (canvas or rows) is the single
  // source of truth for every paper. Fall back to the legacy schoolHeader text,
  // then to the plain school name. The canvas/rows builders include their own
  // wrapper, so the body renders `header` verbatim.
  const ctx = buildHeaderContext({
    paperTitle: paper.title,
    date: paper.createdAt,
    className: paper.subject?.classLevel?.name ?? "",
    subjectName: paper.subject?.name ?? "",
    totalMarks: paper.totalMarks,
    duration: paper.duration,
    school: {
      name: paper.school?.name ?? "",
      logoUrl: paper.school?.logoUrl ?? null,
      address: paper.school?.address ?? null,
      phone: paper.school?.phone ?? null,
      board: paper.school?.board ?? null,
      academicYear: paper.school?.academicYear ?? null,
    },
  });

  // The OMR sheet renders its own compact header (school · title · sheet)
  // inside buildOmrBody — the full canvas/rows header plus Meta grid would
  // push the bubble grid off the sheet.
  let header = "";
  if (documentType !== "omr") {
    // The paper's chosen heading template wins; the school's default header
    // (canvas or rows) remains the fallback for papers with no template.
    const candidates: unknown[] = [
      paper.headerTemplate?.config,
      paper.school?.headerConfig,
    ].filter((c): c is unknown => Boolean(c));

    for (const candidate of candidates) {
      if (
        candidate &&
        typeof candidate === "object" &&
        (candidate as { canvas?: unknown }).canvas
      ) {
        header = headerConfigToHTML(candidate as HeaderConfig, ctx, paper.school?.logoUrl ?? null);
        break;
      }
      const rowsConfig = normalizeHeaderConfig(candidate);
      if (rowsConfig.rows.length > 0) {
        header = `<div class="paper-header">${headerConfigToHTML(rowsConfig, ctx, paper.school?.logoUrl ?? null)}</div>`;
        break;
      }
    }
    if (!header) {
      header = `<div class="school-header">${
        paper.schoolHeader ? escapeHTML(paper.schoolHeader) : escapeHTML(paper.school?.name || "")
      }</div><hr class="divider">`;
    }
  }

  // Multi-set exports label every page with its set, so papers handed to
  // different groups can never be mixed up.
  const setBadgeHTML = setBadge
    ? `<div class="set-badge"><span>SET ${escapeHTML(setBadge)}</span></div>`
    : "";

  // ── Which document are we rendering? ──
  // The answer key and the solution are exported as their own files, so they
  // replace the paper body entirely — only the header, page setup and footer
  // are shared with the paper.
  const documentLabel =
    documentType === "paper"
      ? ""
      : documentType === "answer-key"
        ? "Answer Key"
        : documentType === "solution"
          ? "Solution"
          : "OMR sheet";

  const paperBodyHTML = `
    <!-- Instructions -->
    ${instructions ? `
      <div class="instructions-box">
        <div class="label">Instructions:</div>
        <div>${instructions}</div>
      </div>
    ` : ""}

    <!-- Sections & Questions -->
    ${pageConfig.columns === 2 ? `<div class="question-columns">${sectionsHTML}</div>` : sectionsHTML}

    <!-- Answer key (own page) -->
    ${answerKeyBlocks.length > 0 ? `
      <section class="answer-key-page">
        <div class="paper-title"><h1>Answer Key</h1></div>
        ${answerKeyBlocks.join("")}
      </section>
    ` : ""}
  `;

  const contentHTML =
    documentType === "answer-key"
      ? buildAnswerKeyBody(paper)
      : documentType === "solution"
        ? buildSolutionBody(paper)
        : documentType === "omr"
          ? buildOmrBody(paper, includeAnswerKey)
          : paperBodyHTML;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${mathFonts}
  <style>
    ${mathCSS}

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Nunito', 'Noto Sans', 'Noto Serif Gujarati', Arial, sans-serif;
      color: #1a1a1a;
      background: white;
    }

    /* Page geometry comes from the paper's PageConfig (lib/paper-page.ts).
       Page margins themselves are applied by Puppeteer's margin option. */
    ${pageSetupCss(pageConfig)}

    ${documentType === "omr" ? OMR_CSS : ""}

    /* Watermark */
    ${watermark ? `
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80pt;
      font-weight: bold;
      color: rgba(0, 0, 0, 0.04);
      pointer-events: none;
      white-space: nowrap;
      z-index: 0;
    }
    ` : ""}

    /* School Header */
    .school-header {
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
      color: #333;
      white-space: pre-line;
      margin-bottom: 12px;
    }

    .paper-header {
      margin: 0 0 12px;
      page-break-inside: avoid;
    }

    .divider {
      border: none;
      border-top: 2px solid #02015c;
      margin: 12px 0;
    }

    .divider-thin {
      border: none;
      border-top: 1px solid #edc602;
      margin: 8px 0;
    }

    /* Title Section */
    .paper-title {
      text-align: center;
      margin: 16px 0 8px;
    }

    .paper-title h1 {
      font-family: 'Rasa', serif;
      font-size: 16pt;
      font-weight: bold;
      color: #02015c;
      margin-bottom: 4px;
    }

    /* Multi-set exports — a boxed set label at the top of every set page */
    .set-badge {
      text-align: center;
      margin: 0 0 10px;
    }

    .set-badge span {
      display: inline-block;
      font-family: 'Rasa', serif;
      font-size: 12pt;
      font-weight: bold;
      letter-spacing: 0.12em;
      color: #02015c;
      border: 1.5px solid #02015c;
      border-radius: 4px;
      padding: 2px 18px;
    }

    /* Forced page break between sets */
    .set-break {
      height: 0;
      break-after: page;
      page-break-after: always;
    }

    /* Instructions */
    .instructions-box {
      border: 1px solid #ccc;
      background: #f9f9f9;
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 10pt;
      margin-bottom: 20px;
    }

    .instructions-box .label {
      font-weight: bold;
      margin-bottom: 4px;
    }

    /* Sections — must be allowed to break: an over-length section must not
       disable the per-question break avoidance inside it (Chromium would
       otherwise split a question's options onto the next page). */
    .section {
      margin-bottom: 20px;
    }

    .section-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1.5px solid #edc602;
      padding-bottom: 4px;
      margin-bottom: 12px;
      break-after: avoid;
      page-break-after: avoid;
    }

    .section-header h3 {
      font-family: 'Rasa', serif;
      font-size: 12pt;
      font-weight: bold;
      color: #02015c;
    }

    .section-marks {
      font-size: 9pt;
      color: #555;
    }

    .section-instructions {
      font-size: 9pt;
      font-style: italic;
      color: #555;
      margin-bottom: 8px;
    }

    .section-questions {
      padding-left: 0;
    }

    /* Questions — each question (text + options + answer line) is one atomic
       block: if it cannot fit with its options, the whole question moves to
       the next page/column rather than splitting mid-question. */
    .question {
      margin-bottom: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .question-header {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .question-number {
      font-weight: bold;
      font-size: 11pt;
      flex-shrink: 0;
      min-width: 20px;
    }

    .question-text {
      flex: 1;
      font-size: 11pt;
      line-height: 1.5;
    }

    /* MCQ Options — grid columns are content-driven:
       opts-4 = short options on one row, opts-2 = 2×2 grid,
       opts-1 = long options stacked in a single column. */
    .mcq-options {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px 20px;
      margin-left: 28px;
      margin-top: 4px;
      font-size: 10.5pt;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .mcq-options.opts-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mcq-options.opts-4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    /* A leftover odd option (e.g. the 3rd choice in a 2×2 grid) spans the row. */
    .mcq-options.opts-2 .mcq-option:nth-child(odd):last-child {
      grid-column: 1 / -1;
    }

    /* Two-column question layout — questions flow into a balanced two-column
       layout per printed page; only the questions area is split, the title,
       header, instructions and answer-key pages stay full width. */
    .question-columns {
      column-count: 2;
      column-gap: 8mm;
      column-rule: 1px solid #1a1a1a;
      column-fill: balance;
    }

    .question-columns .section {
      margin-bottom: 16px;
    }

    .question-columns .question {
      margin-bottom: 12px;
    }

    /* In a narrow column keep the gaps and indent tighter so adaptive grids
       still read cleanly. */
    .question-columns .mcq-options {
      gap: 3px 10px;
      margin-left: 20px;
    }

    .mcq-option {
      display: flex;
      gap: 4px;
      align-items: baseline;
    }

    .option-label {
      font-weight: 600;
      flex-shrink: 0;
    }

    .option-text {
      flex: 1;
    }

    /* Solution document — the correct choice is called out in place, so the
       reader can see which option the answer refers to without scanning. */
    .mcq-option.correct {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 3px;
      padding: 0 6px;
      color: #166534;
      font-weight: 600;
    }

    .mcq-option.correct .option-tick {
      color: #166534;
      font-weight: bold;
      flex-shrink: 0;
    }

    /* Answer Key */
    .answer-key {
      margin-top: 4px;
      margin-left: 28px;
      font-size: 10pt;
      color: #166534;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 3px;
      padding: 3px 8px;
    }

    .explanation {
      margin-top: 2px;
      margin-left: 28px;
      font-size: 9pt;
      color: #555;
      background: #f8f8f8;
      border-radius: 3px;
      padding: 3px 8px;
    }

    /* Numeric answer rule */
    .numeric-answer {
      margin-left: 28px;
      margin-top: 6px;
      font-size: 10.5pt;
      color: #333;
    }

    /* Answer key on its own page — the forced break lives on the (non-empty)
       page wrapper. Chromium drops a break-before on an empty spacer element,
       which is why the answers used to trail onto the last question page. */
    .answer-key-page {
      break-before: page;
      page-break-before: always;
    }

    .ak-item {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .ak-body {
      flex: 1;
    }

    /* Standalone answer key — compact "1 - A" grid for short keys (5 per
       row), one bordered row per question otherwise. The container skips
       its bottom border so the last row's cell borders form the edge. */
    .ak-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      border: 1px solid #94a3b8;
      border-bottom: none;
      border-radius: 3px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .ak-cell {
      display: flex;
      gap: 4px;
      align-items: baseline;
      padding: 5px 8px;
      font-size: 10.5pt;
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #94a3b8;
    }

    .ak-cell:nth-child(5n) {
      border-right: none;
    }

    .ak-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }

    .ak-row {
      display: flex;
      gap: 6px;
      align-items: baseline;
      font-size: 10.5pt;
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      background: #f8fafc;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .ak-num {
      font-weight: 600;
      color: #0f172a;
      flex-shrink: 0;
    }

    /* Standalone documents (answer key / solution) — a caption under the
       document title, plus a placeholder when there is nothing to show. */
    .doc-subtitle {
      font-size: 10pt;
      color: #555;
      margin-top: 2px;
    }

    .doc-empty {
      text-align: center;
      font-size: 10pt;
      color: #777;
      padding: 24px 0;
    }

    /* KaTeX rendering */
    .katex-display {
      margin: 8px 0;
      overflow-x: auto;
    }

    .katex {
      font-size: 1em;
    }

    /* Footer */
    .page-footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 8pt;
      color: #999;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  ${watermark ? `<div class="watermark">${escapeHTML(watermark)}</div>` : ""}

  <div class="page">
    <!-- School Header -->
    ${header}

    ${setBadgeHTML}

    ${contentHTML}

    <!-- Footer -->
    <div class="page-footer">
      <span>${title}${documentLabel ? ` — ${documentLabel}` : ""}${
        setBadge ? ` — Set ${setBadge}` : ""
      }</span>
      <span>Generated by PaperGen</span>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
//  Standalone documents — answer key & solution
//
//  Both are exported on their own (never bundled with the paper) and
//  share the paper's stylesheet, so the section headings and the
//  answer/solution blocks look identical to the in-paper key.
//  Questions keep the same per-section numbering as the paper.
// ============================================================

/**
 * The body of the standalone answer-key PDF. Sections whose answers are all
 * short (typical MCQ keys) render as a compact "1 - A   2 - B" grid, five
 * per row; longer answers fall back to one row per question.
 * Explanations are not part of the answer key — they belong to the solution.
 */
function buildAnswerKeyBody(paper: PaperForExport): string {
  const blocks: string[] = [];
  const isShort = (value: string) =>
    value.trim().length > 0 && value.trim().length <= 12 && !value.includes("\n");

  // Continuous numbering across sections, matching the paper body.
  let questionNumber = 0;

  for (const section of paper.sections) {
    const answered = section.questions
      .map((sq) => ({ number: ++questionNumber, answer: sq.question.answerKey }))
      .filter((e): e is { number: number; answer: string } => Boolean(e.answer));

    if (answered.length === 0) continue;

    // Compact "1 - A" grid when every key in the section is short.
    const body = answered.every((e) => isShort(e.answer))
      ? `<div class="ak-grid">${answered
          .map(
            (e) =>
              `<div class="ak-cell"><span class="ak-num">${e.number} -</span> ${renderKaTeX(e.answer)}</div>`
          )
          .join("")}</div>`
      : `<div class="ak-list">${answered
          .map(
            (e) =>
              `<div class="ak-row"><span class="ak-num">${e.number} -</span> ${renderKaTeX(e.answer)}</div>`
          )
          .join("")}</div>`;

    blocks.push(`
        <div class="section">
          <div class="section-header"><h3>${escapeHTML(section.title)}</h3></div>
          ${body}
        </div>
      `);
  }

  return `
    <div class="paper-title">
      <h1>Answer Key</h1>
      <div class="doc-subtitle">${escapeHTML(paper.title)}</div>
    </div>
    ${
      blocks.length > 0
        ? blocks.join("")
        : `<p class="doc-empty">No answers have been added to this paper yet.</p>`
    }
  `;
}

/**
 * The body of the standalone solution PDF: every question with its model
 * answer and the worked explanation, grouped by section.
 */
function buildSolutionBody(paper: PaperForExport): string {
  const blocks: string[] = [];
  let questionCount = 0;

  for (const section of paper.sections) {
    let questionsHTML = "";

    for (let i = 0; i < section.questions.length; i++) {
      const sq = section.questions[i];
      const q = sq.question;
      questionCount += 1;

      const isMCQ = q.questionType === "MCQ";
      const options = isMCQ ? parseMcqOptions(q.options) : [];

      let optionsHTML = "";
      if (isMCQ && options.length > 0) {
        const layout = mcqOptionsLayout(
          options.map((opt) => opt.text),
          parseMcqLayout(q.options)
        );
        // The correct choice is highlighted (and ticked, so it survives a
        // black-and-white print) instead of only being named in the answer.
        const correct = new Set(correctMcqLabels(options, q.answerKey));
        optionsHTML = `
          <div class="mcq-options opts-${layout}">
            ${options.map((opt) => `
              <div class="mcq-option${correct.has(opt.label) ? " correct" : ""}">
                <span class="option-label">(${opt.label})</span>
                ${correct.has(opt.label) ? `<span class="option-tick">✓</span>` : ""}
                <span class="option-text">${renderKaTeX(opt.text)}</span>
              </div>
            `).join("")}
          </div>
        `;
      }

      const answerHTML = q.answerKey
        ? `<div class="answer-key"><strong>Answer:</strong> ${renderKaTeX(q.answerKey)}</div>`
        : `<div class="answer-key"><strong>Answer:</strong> Not provided</div>`;

      questionsHTML += `
        <div class="question">
          <div class="question-header">
            <span class="question-number">${questionCount}.</span>
            <span class="question-text">${renderKaTeX(q.questionText)}</span>
          </div>
          ${optionsHTML}
          ${answerHTML}
          ${q.explanation ? `<div class="explanation"><strong>Solution:</strong> ${renderKaTeX(q.explanation)}</div>` : ""}
        </div>
      `;
    }

    blocks.push(`
      <div class="section">
        <div class="section-header">
          <h3>${escapeHTML(section.title)}</h3>
          <span class="section-marks">(${section.totalMarks} marks)</span>
        </div>
        <div class="section-questions">
          ${questionsHTML}
        </div>
      </div>
    `);
  }

  return `
    <div class="paper-title">
      <h1>Solution</h1>
      <div class="doc-subtitle">${escapeHTML(paper.title)}</div>
    </div>
    ${
      questionCount > 0
        ? blocks.join("")
        : `<p class="doc-empty">This paper has no questions yet.</p>`
    }
  `;
}

// ============================================================
//  OMR Answer Sheet
// ============================================================

/**
 * Bubble-sheet geometry, tuned for mobile-camera and flatbed scanning:
 * pure black-on-white, fixed-width cells so every option column sits at the
 * same x across rows, solid corner registration marks for perspective
 * correction, and no gray fills anywhere (scanners threshold mid-gray badly).
 * The sheet deliberately ignores the paper's columns/fontScale/lineHeight —
 * its layout is fixed so the geometry never drifts.
 */
const OMR_CSS = `
    .omr-sheet { position: relative; color: #000; }

    .omr-head { text-align: center; border-bottom: 0.5mm solid #000; padding-bottom: 1.6mm; }
    .omr-school { font-size: 9pt; font-weight: 700; letter-spacing: 0.3pt; }
    .omr-title { font-family: 'Rasa', serif; font-size: 15pt; font-weight: bold; margin-top: 0.6mm; }
    .omr-sub { font-size: 8pt; margin-top: 0.8mm; }
    .omr-sub .omr-master { font-weight: 700; }

    .omr-fields { display: flex; flex-direction: column; gap: 2mm; margin-top: 2mm; }
    .omr-field { display: flex; align-items: flex-end; gap: 1.6mm; }
    .omr-field-pair { display: flex; gap: 5mm; }
    .omr-field-pair .omr-field { flex: 1 1 0; }
    .omr-field-label { font-size: 7.5pt; font-weight: 700; white-space: nowrap; padding-bottom: 0.6mm; }
    .omr-box { flex: 1; height: 6mm; border: 0.4mm solid #000; border-radius: 1.6mm; }

    .omr-id-block { display: flex; gap: 7mm; }
    .omr-digit-grid { flex: 1 1 0; min-width: 0; }
    .omr-grid-title { font-size: 7.5pt; font-weight: 700; margin-bottom: 0.8mm; }
    .omr-digit-head, .omr-digit-row { display: flex; align-items: center; }
    .omr-digit-head { margin-bottom: 0.6mm; }
    .omr-digit-row { margin-bottom: 1mm; }
    .omr-pos {
      width: 5mm;
      flex-shrink: 0;
      text-align: right;
      padding-right: 1.6mm;
      font-size: 7pt;
      font-weight: 700;
    }
    .omr-digit-cell {
      width: 6.4mm;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .omr-digit { font-size: 7pt; font-weight: 700; }

    .omr-rules {
      margin-top: 2mm;
      border: 0.4mm solid #000;
      padding: 1.6mm 2.2mm;
      font-size: 7.5pt;
      line-height: 1.4;
    }

    .omr-groups { margin-top: 2.5mm; }
    .omr-groups.cols-2 { column-count: 2; column-gap: 7mm; }

    .omr-group { break-inside: auto; }
    .omr-group-head {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 0.4mm solid #000;
      padding-bottom: 0.8mm;
      margin: 2.2mm 0 1mm;
      break-after: avoid;
      page-break-after: avoid;
    }
    .omr-group:first-child .omr-group-head { margin-top: 0; }

    .omr-row {
      display: flex;
      align-items: center;
      padding: 1.1mm 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .omr-num {
      width: 10mm;
      padding-right: 2mm;
      text-align: right;
      font-size: 9.5pt;
      font-weight: 700;
      flex-shrink: 0;
    }
    .omr-cells { display: flex; }
    .omr-opt {
      width: 10.5mm;
      display: flex;
      align-items: center;
      gap: 1.3mm;
    }
    .omr-letter {
      font-size: 7pt;
      font-weight: 700;
      width: 2.6mm;
      text-align: center;
      flex-shrink: 0;
    }
    .omr-bubble {
      width: 4.4mm;
      height: 4.4mm;
      border: 0.55mm solid #000;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .omr-bubble.filled { background: #000; }
    .omr-writein {
      flex: 1;
      min-height: 5.6mm;
      border: 0.4mm solid #000;
      border-radius: 0.8mm;
      font-size: 7pt;
      padding: 0.7mm 1.6mm;
      line-height: 1.3;
    }

    .omr-empty { text-align: center; padding: 20mm 0; font-size: 10pt; color: #555; }

    /* The sheet grew a taller identity block; pull the flow footer back
       onto the last content page and keep it clear of the bottom marks. */
    .page-footer { margin-top: 16px; padding-top: 8px; }
`;

/**
 * A digit-wise identity grid for Roll No. / Class: a `rows x 10` block of
 * bubbles with 0-9 as column headers and 1..rows as position labels down the
 * left (row 1 = first digit of the number as printed). The student fills
 * exactly one circle per row; unused rows stay blank. Bubbles reuse the same
 * 4.4mm `.omr-bubble` as the question rows so a scanner thresholds them
 * identically. Never filled — even on the master copy (identity fields are
 * filled by the student).
 */
function omrDigitGrid(title: string, rows: number): string {
  const head = `<span class="omr-pos"></span>${Array.from(
    { length: 10 },
    (_, d) => `<span class="omr-digit-cell omr-digit">${d}</span>`
  ).join("")}`;
  const body = Array.from(
    { length: rows },
    (_, r) =>
      `<div class="omr-digit-row"><span class="omr-pos">${r + 1}</span>${Array.from(
        { length: 10 },
        () => `<span class="omr-digit-cell"><span class="omr-bubble"></span></span>`
      ).join("")}</div>`
  ).join("");
  return `<div class="omr-digit-grid"><div class="omr-grid-title">${escapeHTML(
    title
  )}</div><div class="omr-digit-head">${head}</div>${body}</div>`;
}

/**
 * The OMR answer sheet body: compact header, student fields, filling rules
 * and one bubble row per question — grouped by section, numbered continuously
 * across sections exactly like the paper, answer key and solution.
 *
 * MCQ rows carry one bubble per actual choice (2–6, labels A–F); TRUE/FALSE
 * carries T/F; every other type gets a write-in box. With `markAnswers` the
 * correct bubbles print solid black (a scoring master copy).
 */
function buildOmrBody(paper: PaperForExport, markAnswers: boolean): string {
  const totalQuestions = paper.sections.reduce((n, s) => n + s.questions.length, 0);
  if (totalQuestions === 0) {
    return `<p class="omr-empty">This paper has no questions yet.</p>`;
  }

  const subParts: string[] = [];
  if (paper.subject?.classLevel?.name) subParts.push(escapeHTML(paper.subject.classLevel.name));
  if (paper.subject?.name) subParts.push(escapeHTML(paper.subject.name));
  subParts.push("OMR Answer Sheet");
  if (paper.duration) subParts.push(`${paper.duration} min`);
  subParts.push(`${paper.totalMarks} marks`);
  if (markAnswers) subParts.push(`<span class="omr-master">MASTER COPY — answers filled</span>`);

  const headHTML = `
    <div class="omr-head">
      <div class="omr-school">${escapeHTML(paper.school?.name ?? "")}</div>
      <div class="omr-title">${escapeHTML(paper.title)}</div>
      <div class="omr-sub">${subParts.join(" &middot; ")}</div>
    </div>

    <div class="omr-fields">
      <div class="omr-field"><span class="omr-field-label">Name</span><span class="omr-box"></span></div>
      <div class="omr-field-pair">
        <div class="omr-field"><span class="omr-field-label">Date</span><span class="omr-box"></span></div>
        <div class="omr-field"><span class="omr-field-label">Signature</span><span class="omr-box"></span></div>
      </div>
      <div class="omr-id-block">
        ${omrDigitGrid("Roll No.", 3)}
        ${omrDigitGrid("Class", 2)}
      </div>
    </div>

    <div class="omr-rules">
      Fill each circle <strong>completely</strong> with a dark pen or pencil &mdash; no ticks or crosses.
      Roll No. and Class: fill one digit per row from the top, exactly as printed &mdash; leave unused positions blank.
      One response per question, using the question numbers printed on the paper.
      Keep the sheet flat and clean; do not staple, fold or write over the bubbles.
    </div>`;

  let questionNumber = 0;
  const groups: string[] = [];

  for (const section of paper.sections) {
    if (section.questions.length === 0) continue;

    const rows = section.questions.map((sq) => {
      questionNumber += 1;
      const q = sq.question;
      let cellsHTML = "";

      if (q.questionType === "MCQ") {
        const choices = parseMcqOptions(q.options);
        if (choices.length > 0) {
          const correct = markAnswers ? new Set(correctMcqLabels(choices, q.answerKey)) : null;
          cellsHTML = `<div class="omr-cells">${choices
            .map(
              (c) => `
              <span class="omr-opt">
                <span class="omr-letter">${escapeHTML(c.label)}</span>
                <span class="omr-bubble${correct?.has(c.label) ? " filled" : ""}"></span>
              </span>`
            )
            .join("")}</div>`;
        }
      } else if (q.questionType === "TRUE_FALSE") {
        const key = (q.answerKey ?? "").trim().toLowerCase();
        const tFilled = markAnswers && key.startsWith("t");
        const fFilled = markAnswers && key.startsWith("f");
        cellsHTML = `<div class="omr-cells">${["T", "F"]
          .map(
            (label) => `
              <span class="omr-opt">
                <span class="omr-letter">${label}</span>
                <span class="omr-bubble${(label === "T" ? tFilled : fFilled) ? " filled" : ""}"></span>
              </span>`
          )
          .join("")}</div>`;
      }

      if (!cellsHTML) {
        // Write-in box for short/numeric/match/long-answer questions.
        const answerText = markAnswers && q.answerKey ? escapeHTML(q.answerKey) : "";
        cellsHTML = `<div class="omr-writein">${answerText}</div>`;
      }

      return `
        <div class="omr-row">
          <span class="omr-num">${questionNumber}</span>
          ${cellsHTML}
        </div>`;
    });

    groups.push(`
      <div class="omr-group">
        <div class="omr-group-head">${escapeHTML(section.title)} &middot; ${section.totalMarks} marks</div>
        ${rows.join("")}
      </div>`);
  }

  const colsClass = totalQuestions > 24 ? " cols-2" : "";

  return `
    <div class="omr-sheet">
      ${headHTML}
      <div class="omr-groups${colsClass}">
        ${groups.join("")}
      </div>
    </div>`;
}

// ============================================================
//  KaTeX Server-Side Rendering
// ============================================================

function renderKaTeX(text: string): string {
  if (!text) return "";

  // $$...$$ (display math) first, then $...$ (inline math)
  return text.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_match, display, inline) => {
    const tex = (display || inline || "").trim();
    try {
      return katex.renderToString(tex, {
        displayMode: !!display,
        throwOnError: false,
        strict: false,
        output: "html",
      });
    } catch {
      return `<code>${escapeHTML(tex)}</code>`;
    }
  });
}

// ============================================================
//  PDF Generation with Puppeteer
// ============================================================

async function generatePDF(
  html: string,
  pageConfig: PageConfig,
  documentType: PaperDocumentType = "paper"
): Promise<Buffer> {
  // Dynamic import to avoid bundling issues
  const puppeteer = await import("puppeteer-core");

  // Try common Chrome/Chromium paths
  const executablePaths = [
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];

  let browser = null;

  for (const path of executablePaths) {
    try {
      browser = await puppeteer.default.launch({
        executablePath: path,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
        ],
      });
      break;
    } catch {
      continue;
    }
  }

  if (!browser) {
    throw new Error(
      "No Chrome/Chromium installation found. Please install Google Chrome or set the PUPPETEER_EXECUTABLE_PATH environment variable."
    );
  }

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the Google fonts (Rasa / Nunito / Noto) to actually load, so the
    // header and body don't print in a fallback face with shifted metrics.
    await page
      .evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready)
      .catch(() => undefined);

    // Wait for every image (e.g. the school logo) to load or fail before the
    // snapshot — otherwise the header may print without its logo.
    await page
      .evaluate(
        () =>
          new Promise<void>((resolve) => {
            const images = Array.from(document.images);
            if (images.length === 0) {
              resolve();
              return;
            }
            let pending = images.length;
            const done = () => {
              pending -= 1;
              if (pending === 0) resolve();
            };
            for (const img of images) {
              if (img.complete) done();
              else {
                img.addEventListener("load", done);
                img.addEventListener("error", done);
              }
            }
          })
      )
      .catch(() => undefined);

    // Wait for KaTeX to render
    await page.waitForFunction(() => {
      const katexElements = document.querySelectorAll(".katex");
      return katexElements.length > 0 || document.querySelector(".question") !== null;
    }, { timeout: 10000 }).catch(() => {
      // Continue even if KaTeX doesn't render (fallback to plain text)
    });

    // OMR registration marks: four solid squares in the page MARGIN, one set
    // per page, for scanner perspective correction. They must NOT be body
    // markup — Chromium clips body `position: fixed` to the content box, so a
    // negative offset both vanishes and makes Chromium append a blank page.
    // Header/footer templates are the per-page margin mechanism: they repeat
    // on every page, SVG shapes render there (CSS backgrounds don't), and
    // Chromium insets them ~5.3 mm (top) / ~5.5 mm (bottom) from the page edge
    // regardless of CSS. Marks are sized to leave a ~2 mm gap to the content
    // box, so OMR print margins are floored at 12 mm top/bottom.
    const isOmr = documentType === "omr";
    const margins = { ...pageConfig.margins };
    if (isOmr) {
      margins.top = Math.max(margins.top, 12);
      margins.bottom = Math.max(margins.bottom, 12);
    }
    const markSize = (marginMm: number) => Math.round(Math.min(7, Math.max(4, marginMm - 7.5)) * 10) / 10;
    const cornerMarks = (size: number, edge: "top" | "bottom") =>
      `<svg viewBox="0 0 10 10" preserveAspectRatio="none" style="position:absolute;${edge}:0;left:0;width:${size}mm;height:${size}mm;"><rect width="10" height="10" fill="#000"/></svg>` +
      `<svg viewBox="0 0 10 10" preserveAspectRatio="none" style="position:absolute;${edge}:0;right:0;width:${size}mm;height:${size}mm;"><rect width="10" height="10" fill="#000"/></svg>`;

    const footerTemplate = isOmr
      ? `<div style="position:relative;width:100%;font-size:8pt;color:#999;padding:0 ${Math.max(margins.right, 8)}mm 0 ${Math.max(margins.left, 8)}mm;display:flex;justify-content:space-between;">` +
        cornerMarks(markSize(margins.bottom), "bottom") +
        `<span></span>` +
        (pageConfig.showPageNumbers
          ? `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>`
          : "") +
        `</div>`
      : `
        <div style="width: 100%; font-size: 8pt; color: #999; padding: 0 ${pageConfig.margins.left}mm; display: flex; justify-content: space-between;">
          <span></span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `;

    const pdfData = await page.pdf({
      format: pdfFormat(pageConfig.size),
      landscape: isLandscape(pageConfig),
      printBackground: true,
      margin: {
        top: `${margins.top}mm`,
        right: `${margins.right}mm`,
        bottom: `${margins.bottom}mm`,
        left: `${margins.left}mm`,
      },
      displayHeaderFooter: isOmr || pageConfig.showPageNumbers,
      headerTemplate: isOmr
        ? `<div style="position:relative;width:100%;font-size:0;">${cornerMarks(markSize(margins.top), "top")}</div>`
        : `<div></div>`,
      footerTemplate,
    });

    return Buffer.from(pdfData);
  } finally {
    await browser.close();
  }
}

// ============================================================
//  Helpers
// ============================================================

function escapeHTML(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getKaTeXCSS(): string {
  // Inline the REAL KaTeX stylesheet (the same one the browser preview loads
  // via katex/dist/katex.min.css). The earlier hand-rolled subset was missing
  // the structural rules (vlist / fraction / supsub / sizing) KaTeX's HTML
  // output depends on, which is why math collapsed into vertical, overlapping
  // text in the PDF while the preview stayed correct. Font files are embedded
  // as data URIs so the headless page resolves them exactly like the browser.
  try {
    const dist = path.join(process.cwd(), "node_modules", "katex", "dist");
    let css = readFileSync(path.join(dist, "katex.min.css"), "utf8");
    css = css.replace(/url\(fonts\/([^)]+)\)/g, (_match, file: string) => {
      const data = readFileSync(path.join(dist, "fonts", file));
      const mime = file.endsWith(".woff2")
        ? "font/woff2"
        : file.endsWith(".woff")
          ? "font/woff"
          : "font/ttf";
      return `url(data:${mime};base64,${data.toString("base64")})`;
    });
    return css;
  } catch {
    // Fall back to the real polished rules only — rendering is acceptable, but
    // without KaTeX fonts glyph metrics may be slightly off.
    return `.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif;line-height:1.2;text-rendering:auto;font-style:normal}.katex-display{display:block;text-align:center;white-space:nowrap;margin:.62em 0}.katex-display>.katex{font-size:1.15em}`;
  }
}

function getMathFonts(): string {
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Noto+Serif+Gujarati:wght@100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Rasa:ital,wght@0,300..700;1,300..700&display=swap" rel="stylesheet">
  `;
}
