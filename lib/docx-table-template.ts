// ============================================================
//  Bulk question import template — table layout.
//
//  Replaces the old plain-text `Q1. … / Type: … / ---` format.
//  Each question is ONE bordered table, which the parser segments on
//  directly. That removes every guess the old format needed: there is
//  no `Q1.` prefix to miss, no `---` separator for Word's
//  autocorrect to turn into an em-dash, and no `A)` option syntax to
//  misread. Cell position IS the field.
//
//  ── Why the parser cannot use mammoth ──
//  mammoth's extractRawText flattens a table into loose paragraphs —
//  verified: "Option A / Option B / Option C / x = 3 / x = 5 …" with
//  no cell or row boundaries left, so option B cannot be told from
//  the solution. Its convertToHtml keeps the structure but discards
//  OMML equations outright. So the importer reads word/document.xml
//  itself (lib/docx-table-parser.ts).
//
//  ── Template contract ──
//  Two row kinds, alternated:
//    · a LABEL row  — grey shaded, bold, non-repeatable labels
//    · a VALUE row  — plain white cells the teacher types into
//  A cell maps to a field by the label above it, so filling the form
//  needs no syntax knowledge. Any number of label/value pairs may be
//  added by the teacher; unrecognised rows are ignored rather than
//  failing the file.
//
//  Maths: the "Equation (LaTeX)" cell takes `$…$`. A teacher may
//  instead paste a real Word equation (Insert ▸ Equation) into the
//  Question cell — OMML is converted automatically. MathType's default
//  OLE object cannot be read and is reported per row.
// ============================================================

import {
  PAGE_BREAK,
  borderedTable,
  buildDocx,
  buildDocumentXml,
  defaultSectPr,
  para,
  type DocxTableCell,
  type Run,
} from "./docx";

// ------------------------------------------------------------
//  Brand colours, kept consistent with the paper export in lib/paper-docx.
// ------------------------------------------------------------

const DARK = "0A0A23";
const GRAY = "6B7280";
const BRAND = "1E3A8A";
const RULE = "9CA3AF";

// A4 portrait minus the default 20 mm margins on both sides.
const CONTENT_W = 9638;

/**
 * Grid columns for one question block.
 *
 * Must sum to CONTENT_W: with `tblLayout=fixed` Word sizes the table from
 * this grid, and anything wider runs off the right margin. Four columns
 * keeps the metadata rows (Correct / Marks / Difficulty / Medium) readable.
 */
const COLS = [2400, 2400, 2400, 2438];
const SPAN_ALL = COLS.length;

/**
 * A cell starting at grid column `col` (0-based) and covering `span` columns.
 *
 * The column index matters: Word lays a fixed-layout table out from the
 * grid, so a cell's width has to be the width of the columns it covers or
 * the row drifts out of alignment with the borders.
 */
function cellAt(col: number, span: number, paragraphs: string): DocxTableCell {
  const width = COLS.slice(col, col + span).reduce((a, b) => a + b, 0);
  return { widthTwips: width, gridSpan: span, paragraphs, vAlign: "top" };
}

/** Convenience: a cell spanning `span` consecutive columns from the left. */
function cell(span: number, paragraphs: string): DocxTableCell {
  return cellAt(0, span, paragraphs);
}

/**
 * Label cell: bold dark-blue text, centred in the cell.
 *
 * `span` is 1 for a metadata cell sitting in one grid column, or SPAN_ALL
 * for the rows that take the whole question width.
 */
function label(text: string, col = 0, span = 1): DocxTableCell {
  return cellAt(
    col,
    span,
    para([{ text, bold: true, size: 18, color: BRAND }], 40, { align: "center" })
  );
}

/**
 * Grey hints shown in value cells.
 *
 * ── Why these are the schema's DEFAULTS, and nothing else ──
 * A hint is real text sitting in the cell, so the parser cannot tell it
 * apart from a teacher's answer unless it knows the exact strings. The
 * first version of this template put prose in every box ("Type the
 * question here…", "A", "B"), which meant an unfilled box imported as a
 * question reading "Type the question here…".
 *
 * The rule that makes exact-match stripping safe: **a hint may only
 * carry a value the parser would substitute anyway.** So the hints are
 * drawn from the same defaults the parser applies to a blank cell, and
 * stripping one is a no-op. Fields where a hint could be mistaken for a
 * real answer — Question, the options, Correct, Solution, Equation,
 * Previous Year — are therefore left completely EMPTY. Their label row
 * and the instructions page say what belongs there.
 */
export const DEFAULT_HINTS: Record<string, string> = {
  marks: "1",
  difficulty: "MEDIUM",
  medium: "ENGLISH",
  type: "SHORT_ANSWER",
  bloom: "UNDERSTAND",
};

/** Every hint string, for the parser to strip as "still blank". */
export const HINT_TEXTS: ReadonlySet<string> = new Set(
  Object.values(DEFAULT_HINTS).map((s) => s.trim())
);

/** Value cell: empty, or a grey italic default the parser treats as blank. */
function value(hint?: string, col = 0, span = 1): DocxTableCell {
  return cellAt(
    col,
    span,
    hint ? para([{ text: hint, size: 18, color: GRAY, italic: true }], 40) : para([], 40)
  );
}

// ------------------------------------------------------------
//  Field layout
// ------------------------------------------------------------

/**
 * The rows of a question block, in order.
 *
 * `full` fields take the whole question width; the rest share one of the
 * compact metadata rows.
 *
 * ── Why the question and the options are full-width ──
 * School options are whole sentences ("Photosynthesis converts light energy
 * into chemical energy"), not the one-word choices the old four-across
 * layout was drawn for. Four side by side left ~1.8in boxes that wrapped
 * every option onto three or four lines and pushed the answer past its own
 * cell. Stacked, each option gets the full measure, and the Question line —
 * which is longer still — no longer shares a row with anything.
 *
 * The metadata stays four-across because those values are short enum words
 * (`EASY`, `2`, `GUJARATI`) and grouping them keeps the block short.
 *
 * Field keys map onto the parser's canonical names, so the hint lookup and
 * the label lookup above both stay in one place.
 */
const ROW_PLAN: Array<{ kind: "full" | "cols"; fields: string[] }> = [
  // The question itself. No hint: anything here would read as an answer.
  { kind: "full", fields: ["question"] },
  // Option slots, one per row. Also unhinted — "A" is a real answer.
  { kind: "full", fields: ["optionA"] },
  { kind: "full", fields: ["optionB"] },
  { kind: "full", fields: ["optionC"] },
  { kind: "full", fields: ["optionD"] },
  // Answer key and marking
  { kind: "cols", fields: ["correct", "marks", "difficulty", "medium"] },
  // Pedagogy metadata and the escape-hatch equation cell
  { kind: "cols", fields: ["type", "bloom", "equation", "previousYear"] },
  // Worked solution. Empty for the same reason as the options.
  { kind: "full", fields: ["solution"] },
];

/** Label text per canonical field, in the order the rows appear. */
const FIELD_LABELS: Record<string, string> = {
  question: "Question",
  optionA: "Option A",
  optionB: "Option B",
  optionC: "Option C",
  optionD: "Option D",
  correct: "Correct",
  marks: "Marks",
  difficulty: "Difficulty",
  medium: "Medium",
  type: "Type",
  bloom: "Bloom",
  equation: "Equation (LaTeX)",
  previousYear: "Previous Year",
  solution: "Solution",
};

// ------------------------------------------------------------
//  Block builders
// ------------------------------------------------------------

/** One question block: alternating label and value rows. */
function questionTable(): string {
  const rows: DocxTableCell[][] = [];

  for (const group of ROW_PLAN) {
    const span = group.kind === "full" ? SPAN_ALL : 1;
    // Label row, then the value row beneath it carrying the default hint
    // where one is safe to show (see DEFAULT_HINTS).
    rows.push(group.fields.map((f, i) => label(FIELD_LABELS[f], i, span)));
    rows.push(group.fields.map((f, i) => value(DEFAULT_HINTS[f], i, span)));
  }

  // The explicit grid matters now: the first row is a merged full-width cell,
  // so deriving from it would split the width into equal quarters and leave
  // the metadata cells disagreeing with the borders.
  return borderedTable(CONTENT_W, rows, RULE, { grid: COLS });
}

/** A heading paragraph that introduces a question block. */
function blockHeading(index: number): string {
  return para(
    [
      { text: "Question ", bold: true, size: 24, color: DARK },
      { text: String(index), bold: true, size: 24, color: BRAND },
    ],
    60
  );
}

/**
 * Separator between blocks. A shaded one-cell table rather than a
 * `---` text run: Word's autocorrect rewrites three hyphens into an
 * em-dash, which is why the old format's delimiter could silently
 * stop matching. The parser does not depend on this — segmentation is
 * by table — it exists so the teacher can see where one question ends.
 */
function blockSeparator(): string {
  return borderedTable(
    CONTENT_W,
    [[cell(SPAN_ALL, para([], 0))]],
    undefined,
    { grid: COLS }
  );
}

// ------------------------------------------------------------
//  Metadata block
// ------------------------------------------------------------

export const META_START = "SPGT-META-START";
export const META_END = "SPGT-META-END";

/** Taxonomy the template was generated for. */
export type TemplateTargets = {
  schoolId: string;
  classLevelId: string;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
};

/**
 * Human-readable labels shown above the machine block, so a teacher can
 * see where their questions are going and spot a stale template.
 */
export type TemplateLabels = {
  school: string;
  classLevel: string;
  subject: string;
  chapter: string;
  topic: string | null;
};

/** Bumped whenever the template layout changes in a way the parser must know. */
export const TEMPLATE_VERSION = 2;

/**
 * Renders the machine-readable metadata block.
 *
 * Plain `KEY=VALUE` lines between two sentinel paragraphs. Parsed by
 * lib/docx-table-parser.ts and used to re-target the upload, so a
 * teacher who changes the targeting in the UI but uploads an older file
 * is caught rather than silently writing questions to the wrong chapter.
 */
function metaBlock(targets: TemplateTargets, labels: TemplateLabels): string {
  const rows: Array<[string, string]> = [
    ["templateVersion", String(TEMPLATE_VERSION)],
    ["schoolId", targets.schoolId],
    ["classLevelId", targets.classLevelId],
    ["subjectId", targets.subjectId],
    ["chapterId", targets.chapterId],
    ["topicId", targets.topicId ?? ""],
  ];

  const out: string[] = [
    para([{ text: "TARGETING", bold: true, size: 20, color: GRAY }], 40),
  ];
  for (const [label, value] of [
    ["School", labels.school],
    ["Class", labels.classLevel],
    ["Subject", labels.subject],
    ["Chapter", labels.chapter],
    ["Topic", labels.topic ?? "— (chapter only)"],
  ] as Array<[string, string]>) {
    out.push(para([{ text: `${label}: `, size: 18, color: GRAY }, { text: value, size: 18, color: DARK }], 20));
  }

  out.push(para([], 60));
  out.push(para([{ text: META_START, size: 14, color: "9CA3AF" }], 20));
  for (const [key, val] of rows) {
    out.push(para([{ text: `${key}=${val}`, size: 14, color: "9CA3AF" }], 0));
  }
  out.push(para([{ text: META_END, size: 14, color: "9CA3AF" }], 120));

  return out.join("");
}

// ------------------------------------------------------------
//  Instructions page
// ------------------------------------------------------------

/**
 * Gujarati-capable UI font. Word substitutes automatically when it is absent,
 * but naming it keeps WPS Office / LibreOffice from rendering tofu boxes —
 * both are common in the schools this template is written for.
 */
const GUJARATI_FONT = "Nirmala UI";

/**
 * The instructions page, in English then Gujarati.
 *
 * Both languages are always emitted: a template is downloaded once and then
 * filled in by whoever prepares the questions, which is rarely the same
 * person who set the medium to GUJARATI. The page is skipped by the importer,
 * so the extra copy costs nothing but a few lines.
 */
function instructionsPage(): string {
  const out: string[] = [];
  const line = (text: string, o: Partial<Run> = {}, after = 100) =>
    out.push(para([{ text, ...o }], after));
  const bullet = (text: string, csFont?: string) =>
    out.push(
      para(
        [
          { text: "•  ", color: BRAND, size: 20 },
          { text, size: 20, color: DARK, ...(csFont ? { csFont } : {}) },
        ],
        50
      )
    );
  const guLine = (text: string, o: Partial<Run> = {}, after = 100) =>
    line(text, { csFont: GUJARATI_FONT, ...o }, after);
  const guBullet = (text: string) => bullet(text, GUJARATI_FONT);

  // ------------------------------------------------------------
  //  English
  // ------------------------------------------------------------

  line("How to fill this template", { bold: true, size: 32, color: DARK }, 80);
  line(
    "Each question is a box. Type over the grey hints and leave anything you don't need blank.",
    { color: GRAY },
    160
  );

  line("The grey labels are fixed", { bold: true, size: 24, color: BRAND }, 60);
  bullet("Write the question in the Question box. Leave the Option boxes empty for non-MCQ types.");
  bullet("Correct: just the option letter for MCQ, or the answer text for other types.");
  bullet("Marks accepts decimals — 1, 2, 1.5.");
  bullet("Difficulty: EASY, MEDIUM or HARD.   Medium: ENGLISH or GUJARATI.");
  bullet(
    "Type: MCQ, SHORT_ANSWER, LONG_ANSWER, TRUE_FALSE, FILL_IN_THE_BLANK, MATCH_THE_FOLLOWING, CASE_STUDY, NUMERIC"
  );
  bullet("Bloom: REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE.");

  line("Maths", { bold: true, size: 24, color: BRAND }, 60);
  bullet("Write maths as LaTeX between dollar signs, e.g. $\\frac{3}{4}$ or $x^2 + 1$.");
  bullet("Or use Word's Insert ▸ Equation — it is converted automatically.");
  bullet(
    "MathType objects (the default MathType output) cannot be read. If you use MathType, switch it to \"Convert to Office Math\" in its preferences, or paste the equation as LaTeX text instead."
  );

  line("Gujarati", { bold: true, size: 24, color: BRAND }, 60);
  bullet("Type Gujarati normally in any input method. Keep the cell's Medium set to GUJARATI.");
  bullet(
    "ઉદાહરણ: $\\sqrt{144}$ ની કિંમત શું છે? — Gujarati maths is preserved exactly as typed."
  );

  line("Before you upload", { bold: true, size: 24, color: BRAND }, 60);
  bullet("Save as .docx (Word 2007 or later) — not .doc, and not PDF.");
  bullet("Leave this instructions page in the file; it is skipped automatically.");
  bullet("You can add or remove question boxes — only boxes with a Question are imported.");

  // ------------------------------------------------------------
  //  Gujarati — the same instructions, for the teacher who reads Gujarati.
  // ------------------------------------------------------------

  out.push(PAGE_BREAK);

  guLine("આ ટેમ્પ્લેટ કેવી રીતે ભરવું", { bold: true, size: 32, color: DARK }, 80);
  guLine(
    "દરેક પ્રશ્ન એક બોક્સ છે. રાખેલા કડા લખાણ ઉપર ટાઇપ કરો, અને જરૂર ન હોય તેવું ખાલી રાખી દો.",
    { color: GRAY },
    160
  );

  guLine("કડા લેબલ સ્થિર છે", { bold: true, size: 24, color: BRAND }, 60);
  guBullet("પ્રશ્ન 'Question' બોક્સમાં લખો. MCQ સિવાયના પ્રકારો માટે Option બોક્સ ખાલી રાખો.");
  guBullet("Correct: MCQ માટે ફક્ત વિકલ્પનો અક્ષર, અન્ય પ્રકારો માટે જવાબનો લખાણ.");
  guBullet("Marks માં દાશાંશ પણ લખી શકો — 1, 2, 1.5.");
  guBullet("Difficulty: EASY, MEDIUM અથવા HARD.   Medium: ENGLISH અથવા GUJARATI.");
  guBullet(
    "Type: MCQ, SHORT_ANSWER, LONG_ANSWER, TRUE_FALSE, FILL_IN_THE_BLANK, MATCH_THE_FOLLOWING, CASE_STUDY, NUMERIC"
  );
  guBullet("Bloom: REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE.");

  guLine("ગણિત", { bold: true, size: 24, color: BRAND }, 60);
  guBullet("ગણિત LaTeX માં ડૉલર ચિહ્નની વચ્ચે લખો, દા.ત. $\\frac{3}{4}$ અથવા $x^2 + 1$.");
  guBullet("અથવા Word ના Insert ▸ Equation વાપરો — તે આપોઆપ રૂપાંતર થઈ જશે.");
  guBullet(
    "MathType ઓબ્જેક્ટ (MathType નો ડિફોલ્ટ આઉટપુટ) વાંચી શકાતા નથી. જો તમે MathType વાપરો, તો તેની સેટિંગ્સમાં \"Convert to Office Math\" પસંદ કરો, અથવા સમીકરણને LaTeX લખાણ તરીકે પેસ્ટ કરો."
  );

  guLine("ગુજરાતી", { bold: true, size: 24, color: BRAND }, 60);
  guBullet("ગુજરાતી કોઈપણ ઇનપુટ મેથડથી સામાન્ય રીતે લખો. સેલનો Medium GUJARATI જ રાખો.");
  guBullet(
    "ઉદાહરણ: $\\sqrt{144}$ ની કિંમત શું છે? — ગુજરાતી ગણિત જેમ લખાય તેમ જ સચવાય છે."
  );

  guLine("અપલોડ કરતાં પહેલાં", { bold: true, size: 24, color: BRAND }, 60);
  guBullet(".docx તરીકે સેવ કરો (Word 2007 અથવા પછીનું) — .doc કે PDF નહીં.");
  guBullet("આ સૂચના પાને ફાઇલમાં જ રાખો; તે આપોઆપ અવગણ થાય છે.");
  guBullet("તમે પ્રશ્ન બોક્સ ઉમેરી કે કાઢી શકો — ફક્ત Question ભરેલા બોક્સ જ આયાત થાય છે.");

  return out.join("");
}

// ------------------------------------------------------------
//  Public API
// ------------------------------------------------------------

/**
 * Builds the bulk-import template as a valid .docx.
 *
 * @param targets taxonomy the questions should be filed under
 * @param labels  human-readable names for the targeting header
 * @param count   how many blank question boxes to emit
 */
export function buildQuestionTemplateDocx(
  targets: TemplateTargets,
  labels: TemplateLabels,
  count = 10
): Uint8Array {
  const out: string[] = [];

  // Cover
  out.push(para([{ text: "SchoolPaperGen — Bulk Question Template", bold: true, size: 32, color: DARK }], 60));
  out.push(
    para(
      [{ text: "Fill in the boxes below, then upload this file at Questions → Bulk Import.", color: GRAY }],
      60
    )
  );
  out.push(
    para(
      [{ text: "Keep this file — it records which chapter the questions belong to.", color: GRAY }],
      200
    )
  );
  out.push(metaBlock(targets, labels));

  // Instructions
  out.push(PAGE_BREAK);
  out.push(instructionsPage());

  // Question boxes
  out.push(PAGE_BREAK);
  out.push(para([{ text: "QUESTIONS", bold: true, size: 26, color: DARK }], 120));

  const total = Math.max(1, Math.floor(count));
  for (let i = 1; i <= total; i++) {
    if (i > 1) out.push(blockSeparator());
    out.push(blockHeading(i));
    out.push(questionTable());
    out.push(para([], 120));
  }

  return buildDocx(buildDocumentXml(out.join(""), defaultSectPr()));
}

/** Download filename carrying the class and subject, for teachers' folders. */
export function templateFileName(classLevel: string, subject: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "class";
  return `${slug(classLevel)}-${slug(subject)}-questions.docx`;
}