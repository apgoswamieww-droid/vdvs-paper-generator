import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import katex from "katex";

// ============================================================
//  POST /api/export-pdf
//  Body: { paperId: string, includeAnswerKey?: boolean }
//
//  Renders a styled HTML paper layout into a pixel-perfect,
//  print-ready PDF using Puppeteer (puppeteer-core).
//  Supports Gujarati Unicode fonts and KaTeX math formulas.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // ── Auth: require session + tenant scoping ──
    const session = await requireSession();
    const body = await request.json();
    const { paperId, includeAnswerKey = false } = body;

    if (!paperId) {
      return NextResponse.json({ error: "paperId is required" }, { status: 400 });
    }

    // Fetch the paper — scoped to the authenticated user's school
    const paper = await prisma.paper.findFirst({
      where: { id: paperId, schoolId: session.schoolId },
      include: {
        subject: { select: { name: true } },
        school: { select: { name: true, logoUrl: true } },
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

    // Build the HTML
    const html = buildPaperHTML(paper, includeAnswerKey);

    // Generate PDF with Puppeteer
    const pdfBuffer = await generatePDF(html);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${paper.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
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

function buildPaperHTML(
  paper: {
    title: string;
    totalMarks: number;
    passingMarks: number | null;
    duration: number | null;
    instructions: string | null;
    schoolHeader: string | null;
    watermarkText: string | null;
    subject: { name: string } | null;
    school: { name: string; logoUrl: string | null } | null;
    sections: {
      title: string;
      instructions: string | null;
      totalMarks: number;
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
  },
  includeAnswerKey: boolean
): string {
  const mathCSS = getKaTeXCSS();
  const mathFonts = getMathFonts();

  let sectionsHTML = "";

  for (const section of paper.sections) {
    let questionsHTML = "";

    for (let i = 0; i < section.questions.length; i++) {
      const sq = section.questions[i];
      const marks = sq.marksOverride ?? sq.question.marks;
      const q = sq.question;
      const qText = renderKaTeX(q.questionText);
      const isMCQ = q.questionType === "MCQ";
      const options = isMCQ && Array.isArray(q.options) ? (q.options as { label: string; text: string }[]) : [];

      let optionsHTML = "";
      if (isMCQ && options.length > 0) {
        optionsHTML = `
          <div class="mcq-options">
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
      if (includeAnswerKey && q.answerKey) {
        answerHTML = `
          <div class="answer-key">
            <strong>Answer:</strong> ${renderKaTeX(q.answerKey)}
          </div>
        `;
      }

      let explanationHTML = "";
      if (includeAnswerKey && q.explanation) {
        explanationHTML = `
          <div class="explanation">
            <strong>Explanation:</strong> ${renderKaTeX(q.explanation)}
          </div>
        `;
      }

      questionsHTML += `
        <div class="question">
          <div class="question-header">
            <span class="question-number">${i + 1}.</span>
            <span class="question-text">${qText}</span>
            <span class="question-marks">[${marks}m]</span>
          </div>
          ${optionsHTML}
          ${answerHTML}
          ${explanationHTML}
        </div>
      `;
    }

    sectionsHTML += `
      <div class="section">
        <div class="section-header">
          <h3>${escapeHTML(section.title)}</h3>
          <span class="section-marks">(${section.totalMarks} marks)</span>
        </div>
        ${section.instructions ? `<p class="section-instructions">${escapeHTML(section.instructions)}</p>` : ""}
        <div class="section-questions">
          ${questionsHTML}
        </div>
      </div>
    `;
  }

  const title = escapeHTML(paper.title);
  const subject = paper.subject ? escapeHTML(paper.subject.name) : "";
  const header = paper.schoolHeader ? escapeHTML(paper.schoolHeader) : escapeHTML(paper.school?.name || "");
  const instructions = paper.instructions ? escapeHTML(paper.instructions) : "";
  const watermark = paper.watermarkText || "";

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
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
    }

    .page {
      padding: 40px 50px;
      max-width: 210mm;
      margin: 0 auto;
      position: relative;
    }

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

    .paper-meta {
      text-align: center;
      font-size: 10pt;
      color: #555;
      margin-bottom: 12px;
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

    /* Sections */
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .section-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1.5px solid #edc602;
      padding-bottom: 4px;
      margin-bottom: 12px;
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

    /* Questions */
    .question {
      margin-bottom: 14px;
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

    .question-marks {
      font-size: 9pt;
      color: #666;
      flex-shrink: 0;
      font-style: italic;
    }

    /* MCQ Options */
    .mcq-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 20px;
      margin-left: 28px;
      margin-top: 4px;
      font-size: 10.5pt;
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
      .page {
        padding: 20px 30px;
      }
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
    ${header ? `<div class="school-header">${header}</div><hr class="divider">` : ""}

    <!-- Title -->
    <div class="paper-title">
      <h1>${title}</h1>
    </div>
    <div class="paper-meta">
      ${subject ? `${subject} — ` : ""}Total Marks: ${paper.totalMarks}${paper.duration ? ` | Duration: ${paper.duration} min` : ""}${paper.passingMarks ? ` | Passing: ${paper.passingMarks}` : ""}
    </div>

    <!-- Instructions -->
    ${instructions ? `
      <div class="instructions-box">
        <div class="label">Instructions:</div>
        <div>${instructions}</div>
      </div>
    ` : ""}

    <!-- Sections & Questions -->
    ${sectionsHTML}

    <!-- Footer -->
    <div class="page-footer">
      <span>${title}</span>
      <span>Generated by PaperGen</span>
    </div>
  </div>
</body>
</html>`;
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

async function generatePDF(html: string): Promise<Buffer> {
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

    // Wait for KaTeX to render
    await page.waitForFunction(() => {
      const katexElements = document.querySelectorAll(".katex");
      return katexElements.length > 0 || document.querySelector(".question") !== null;
    }, { timeout: 10000 }).catch(() => {
      // Continue even if KaTeX doesn't render (fallback to plain text)
    });

    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "12mm",
        bottom: "15mm",
        left: "12mm",
      },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width: 100%; font-size: 8pt; color: #999; padding: 0 50px; display: flex; justify-content: space-between;">
          <span></span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
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
  // Inline minimal KaTeX CSS for PDF rendering
  return `
    .katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif;line-height:1.2;text-indent:0;text-rendering:auto;display:inline;font-style:normal}
    .katex-display{display:block;text-align:center;white-space:nowrap;margin:.62em 0}
    .katex-display>.katex{font-size:1.15em}
    .katex .base{position:relative}
    .katex .strut{display:inline-block}
    .katex .textbf{font-weight:bold}
    .katex .textit{font-style:italic}
    .katex .textrm{font-family:KaTeX_Main}
    .katex .mathbf{font-family:KaTeX_Main;font-weight:bold}
    .katex .mathit{font-family:KaTeX_Main;font-style:italic}
    .katex .mord,.katex .mbin,.katex .mrel,.katex .mopen,.katex .mclose,.katex .mpunct,.katex .minner{position:relative}
    .katex .mop{font-family:KaTeX_Main}
    .katex .amsrm{font-family:KaTeX_AMS}
    .katex .frak{font-family:KaTeX_Fraktur}
    .katex .mathcal{font-family:KaTeX_Caligraphic}
    .katex .mathfrak{font-family:KaTeX_Fraktur}
    .katex .mathbb{font-family:KaTeX_AMS}
    .katex .mathscr{font-family:KaTeX_Caligraphic}
    .katex .mathcal,.katex .mathscr{font-style:normal}
    .katex .mathfrak{font-style:normal}
    .katex .mopen .delimsizingcentering{position:relative;top:.15em}
    .katex .sizing,.katex .reset-size{font-size:1em}
    .katex .size-1{font-size:.75em}
    .katex .size-2{font-size:.7em}
    .katex .size-3{font-size:.55em}
    .katex .size-4{font-size:.5em}
    .katex .size-5{font-size:.38em}
    .katex .size-6{font-size:.28em}
    .katex .sqrt{display:inline-flex;align-items:baseline;justify-content:center}
    .katex .sqrt-sign{position:relative}
    .katex .sqrt-sign .vinculum{position:absolute;bottom:0;border-bottom:1px solid currentColor}
    .katex .fraction{display:inline-block;text-align:center;vertical-align:middle;padding:0 .2em}
    .katex .numerator{display:block;text-align:center;padding-bottom:.1em}
    .katex .denominator{display:block;text-align:center;border-top:1px solid currentColor;padding-top:.1em}
    .katex .nulldelimiter{display:inline-block;width:.25em}
  `;
}

function getMathFonts(): string {
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=Noto+Serif+Gujarati:wght@100..900&family=Nunito:ital,wght@0,200..1000;1,200..1000&family=Rasa:ital,wght@0,300..700;1,300..700&display=swap" rel="stylesheet">
  `;
}
