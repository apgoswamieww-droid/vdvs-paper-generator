// ============================================================
//  Bulk question .docx parser — table layout.
//
//  Reads a filled-in template produced by lib/docx-table-template.ts
//  and turns each question table into a structured draft.
//
//  ── Why this does not use mammoth ──
//  Verified against a template table, mammoth gives:
//
//    extractRawText → "Option A\n\nOption B\n\nOption C\n\nx = 3\n\nx = 5…"
//                      every cell boundary gone, so Option B cannot be
//                      distinguished from the solution.
//    convertToHtml  → structure kept, but "An unrecognised element was
//                      ignored: {…officeDocument/math}oMathPara" —
//                      equations dropped entirely.
//
//  So the OOXML is read directly (lib/zip-read.ts + lib/xml-parse.ts),
//  which gives exact cell coordinates AND the OMML the equation needs.
//
//  ── Parsing model ──
//  A question table is a sequence of rows alternating LABEL and VALUE.
//  A row is a LABEL row when every non-empty cell matches a known field
//  name; the row after it supplies the values, cell-by-cell. That rule
//  is deliberately shape-based rather than position-based so it survives
//  a teacher adding, removing or reordering rows.
//
//  It also handles the two things Word does to forms on its own:
//    · <w:tblHeader/> — Word repeats header rows at every page break, so
//      a long question legitimately contains several label rows
//    · <w:gridSpan/>  — full-width fields like Question span all columns
//
//  ── Segmentation ──
//  One table per question. The old format needed a `---` delimiter, which
//  Word's autocorrect rewrites into an em-dash; tables need no delimiter
//  at all. Separator tables (a single empty full-width cell) are skipped.
// ============================================================

import { readZipText } from "./zip-read";
import { childNamed, childrenNamed, descendants, parseXml, textOf, type XmlNode } from "./xml-parse";
import { ommlToLatex, toInlineMath } from "./omml-to-latex";
import { META_END, META_START, TEMPLATE_VERSION, HINT_TEXTS } from "./docx-table-template";

// ------------------------------------------------------------
//  Public types
// ------------------------------------------------------------

/** One question as read out of a table. Mirrors the old parser's draft. */
export type ParsedQuestionDraft = {
  /** 1-based position among question tables. */
  index: number;
  questionText: string;
  questionType: string;
  difficulty: string;
  medium: string;
  marks: number;
  bloomLevel: string;
  previousYearTag: string | null;
  tags: string[];
  options: { label: string; text: string; isCorrect: boolean }[];
  matchPairs: { left: string; right: string }[];
  answerKey: string | null;
  explanation: string | null;
};

export type ParsedQuestionError = {
  index: number;
  preview: string;
  /** Machine-readable code so the UI can phrase the problem precisely. */
  code:
    | "missing-question"
    | "unresolved-equation"
    | "bad-marks"
    | "no-answer";
  message: string;
};

/** Taxonomy recovered from the template's metadata block. */
export type TemplateMeta = {
  templateVersion: number;
  schoolId: string;
  classLevelId: string;
  subjectId: string;
  chapterId: string;
  topicId: string | null;
};

export type ParseResult = {
  drafts: ParsedQuestionDraft[];
  errors: ParsedQuestionError[];
  meta: TemplateMeta | null;
  /** Tables that looked like question boxes but had no Question cell. */
  blankBoxes: number;
};

// ------------------------------------------------------------
//  Field vocabulary
// ------------------------------------------------------------

/**
 * Canonical field name for every label the template can emit.
 *
 * Keys are normalised labels; values are the canonical names the
 * importer and UI speak. Matching is case- and punctuation-insensitive
 * so "Equation (LaTeX)", "equation-latex" and "EQUATION LATEX" all
 * resolve to the same field.
 */
const FIELD_ALIASES: Record<string, string> = {
  question: "question",
  questiontext: "question",
  "optiona": "optionA",
  "optionb": "optionB",
  "optionc": "optionC",
  "optiond": "optionD",
  optione: "optionE",
  optionf: "optionF",
  correct: "correct",
  answer: "correct",
  marks: "marks",
  difficulty: "difficulty",
  medium: "medium",
  type: "type",
  questiontype: "type",
  bloom: "bloom",
  bloomlevel: "bloom",
  "equationlatex": "equation",
  equation: "equation",
  maths: "equation",
  math: "equation",
  previousyear: "previousYear",
  year: "previousYear",
  solution: "solution",
  explanation: "solution",
  tags: "tags",
};

/** "Option (LaTeX)" → "optionlatex". */
function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Canonical field for a label cell, or null when it is not a known field. */
function fieldForLabel(label: string): string | null {
  return FIELD_ALIASES[normaliseLabel(label)] ?? null;
}

// ------------------------------------------------------------
//  Cell reading
// ------------------------------------------------------------

/** A cell's text plus whether it holds something we could not read. */
type CellRead = {
  text: string;
  /** True when the cell contains an embedded object we cannot decode. */
  hasUnreadableObject: boolean;
  /** LaTeX recovered from an inline Word equation, if any. */
  ommlLatex: string;
};

/**
 * Reads one table cell.
 *
 * Three things can be in a cell and all three must be handled:
 *   · plain runs — <w:t> text, joined
 *   · a Word equation — <m:oMath>, converted to `$…$`
 *   · an embedded object — MathType/Equation 3.0 <w:object>, which has no
 *     recoverable text. Flagged, never guessed: silently dropping it would
 *     produce a question with missing maths that looks fine in the bank.
 */
function readCell(tc: XmlNode): CellRead {
  const paragraphs = childrenNamed(tc, "p");

  const ommlNodes = descendants(tc).filter((n) => n.name === "oMath");
  const hasObject = descendants(tc).some((n) => n.name === "object");

  // Paragraph-by-paragraph so multi-paragraph cells keep their breaks.
  const pieces: string[] = [];
  for (const p of paragraphs.length ? paragraphs : [tc]) {
    let line = "";
    for (const node of descendants(p)) {
      if (node.name === "t") {
        line += node.text;
      } else if (node.name === "oMath") {
        const tex = ommlToLatex(node);
        line += tex ? ` ${toInlineMath(tex)} ` : "";
      } else if (node.name === "tab") {
        line += " ";
      }
    }
    pieces.push(line.trim());
  }

  const ommlLatex = ommlNodes.map((n) => ommlToLatex(n)).filter(Boolean).join(" ");
  let text = pieces.filter(Boolean).join("\n").trim();

  // Word normally wraps an equation in <w:p>, but a hand-edited or
  // generated file can leave <m:oMath> sitting directly in the cell. Pick
  // that case up rather than silently losing the formula.
  if (ommlLatex) {
    const inline = toInlineMath(ommlLatex);
    if (!text.includes(inline)) text = text ? `${text} ${inline}` : inline;
  }

  return { text, hasUnreadableObject: hasObject, ommlLatex };
}

/** Reads a row into cell reads. */
function readRow(tr: XmlNode): CellRead[] {
  return childrenNamed(tr, "tc").map(readCell);
}

// ------------------------------------------------------------
//  Table reading
// ------------------------------------------------------------

/** Everything one question table yields, before field mapping. */
type TableFields = {
  fields: Record<string, CellRead>;
  /** Order fields were first seen, for stable preview rendering. */
  order: string[];
  /**
   * Any embedded object anywhere in the box, not just under a label.
   * Scanned across every cell because a teacher can paste an equation into
   * a cell the template did not label, and an unreadable equation must
   * block the row wherever it sits.
   */
  hasUnreadableObject: boolean;
};

function emptyFields(): TableFields {
  return { fields: {}, order: [], hasUnreadableObject: false };
}

function put(into: TableFields, key: string, read: CellRead): void {
  if (!(key in into.fields)) into.order.push(key);
  into.fields[key] = read;
}

const BLANK: CellRead = { text: "", hasUnreadableObject: false, ommlLatex: "" };

/**
 * Turns one question table into labelled fields.
 *
 * Walks rows and pairs each LABEL row with the VALUE row beneath it.
 * A label row repeated mid-table (Word's page-break header repetition)
 * simply re-declares the same fields; the following value row wins,
 * which is the later, real answer.
 */
function readQuestionTable(tbl: XmlNode): TableFields {
  const out = emptyFields();
  const rows = childrenNamed(tbl, "tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = readRow(rows[i]);
    if (!cells.length) continue;

    // Watched for every cell read, labelled or not.
    if (cells.some((c) => c.hasUnreadableObject)) out.hasUnreadableObject = true;

    const labels = cells.map((c) => fieldForLabel(c.text));
    const nonEmpty = cells.filter((c) => c.text.trim().length > 0);

    // A label row: every non-empty cell names a known field.
    const isLabelRow = nonEmpty.length > 0 && labels.every((l, idx) => cells[idx].text.trim() === "" || l !== null);
    if (!isLabelRow) continue;

    const next = rows[i + 1];
    if (!next) continue;
    const values = readRow(next);

    // The value row is where the teacher's content actually lives, so it
    // must be scanned for unreadable objects too — checking only the label
    // row would miss an equation pasted into any filled cell.
    if (values.some((c) => c.hasUnreadableObject)) out.hasUnreadableObject = true;

    labels.forEach((field, idx) => {
      if (!field) return;
      put(out, field, values[idx] ?? BLANK);
    });

    i += 1; // consume the value row
  }

  return out;
}

/**
 * A table with a single, empty, full-width cell is the visual separator
 * between question boxes — not a question.
 */
function isSeparatorTable(tbl: XmlNode): boolean {
  const rows = childrenNamed(tbl, "tr");
  if (rows.length !== 1) return false;
  const cells = childrenNamed(rows[0], "tc");
  if (cells.length !== 1) return false;
  return readCell(cells[0]).text.trim() === "";
}

// ------------------------------------------------------------
//  Metadata block
// ------------------------------------------------------------

/**
 * Recovers the SPGT-META block from the document's paragraphs.
 *
 * Returns null when absent — the file may predate the block or have been
 * stripped. Callers decide whether to fall back to the UI's selection.
 */
function readMeta(body: XmlNode): TemplateMeta | null {
  const lines: string[] = [];
  let inside = false;

  for (const node of descendants(body)) {
    if (node.name !== "p") continue;
    const text = textOf(node).trim();
    if (text === META_START) {
      inside = true;
      lines.length = 0;
      continue;
    }
    if (text === META_END) {
      inside = false;
      break;
    }
    if (inside && text) lines.push(text);
  }

  const kv: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq > 0) kv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  const required = ["schoolId", "subjectId", "chapterId"];
  if (!required.every((k) => kv[k])) return null;

  const version = Number.parseInt(kv.templateVersion ?? "", 10);

  return {
    templateVersion: Number.isFinite(version) ? version : 1,
    schoolId: kv.schoolId,
    classLevelId: kv.classLevelId ?? "",
    subjectId: kv.subjectId,
    chapterId: kv.chapterId,
    topicId: kv.topicId ? kv.topicId : null,
  };
}

// ------------------------------------------------------------
//  Draft assembly
// ------------------------------------------------------------

/** Options in canonical order, so letters always match the template. */
const OPTION_ORDER = [
  ["optionA", "A"],
  ["optionB", "B"],
  ["optionC", "C"],
  ["optionD", "D"],
  ["optionE", "E"],
  ["optionF", "F"],
] as const;

/** Defaults mirroring the app's question form. */
const DEFAULTS = {
  questionType: "SHORT_ANSWER",
  difficulty: "MEDIUM",
  medium: "ENGLISH",
  marks: 1,
  bloomLevel: "UNDERSTAND",
};

/** Collapses whitespace so a Word paragraph break becomes one space. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildDraft(index: number, fields: TableFields): ParsedQuestionDraft {
  const get = (key: string): CellRead => fields.fields[key] ?? BLANK;

  const questionCell = get("question");
  // An inline Word equation, if any, is appended so the LaTeX reaches
  // questionText; the dedicated Equation cell covers the typed case.
  const inlineMath = flatten(get("question").ommlLatex);
  let questionText = flatten(questionCell.text);
  if (inlineMath && !questionText.includes(inlineMath)) {
    questionText = questionText ? `${questionText} ${toInlineMath(inlineMath)}` : "";
  }

  const typeRaw = flatten(get("type").text).toUpperCase().replace(/[\s-]+/g, "_");
  const difficultyRaw = flatten(get("difficulty").text).toUpperCase();
  const mediumRaw = flatten(get("medium").text).toUpperCase();
  const bloomRaw = flatten(get("bloom").text).toUpperCase().replace(/[\s-]+/g, "_");

  const marksRaw = flatten(get("marks").text);
  const marksParsed = Number.parseFloat(marksRaw);

  const correctRaw = flatten(get("correct").text);
  const previousYear = flatten(get("previousYear").text);
  const tags = flatten(get("tags").text)
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  // MCQ options, with the correct letter marked.
  const correctLetter = correctRaw.length === 1 ? correctRaw.toUpperCase() : "";
  const options = OPTION_ORDER.filter(([key]) => get(key).text.trim().length > 0).map(
    ([key, letter]) => {
      const cell = get(key);
      return {
        label: letter,
        text: flatten(cell.text),
        isCorrect: correctLetter === letter,
      };
    }
  );

  // MATCH_THE_FOLLOWING pairs: "left => right", one per line.
  // Split from the RAW cell text — flattening first would collapse the
  // line breaks and turn three pairs into one long unmatchable line.
  const solutionCell = get("solution");
  const pairLines = solutionCell.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchPairs = pairLines
    .map((line) => {
      const m = line.match(/^(.+?)\s*=>\s*(.+)$/);
      return m ? { left: m[1].trim(), right: m[2].trim() } : null;
    })
    .filter((p): p is { left: string; right: string } => p !== null);

  const solution = matchPairs.length ? null : flatten(solutionCell.text);

  // The Equation cell is appended to the question when it adds something
  // beyond what the question text already carries.
  const equationCell = get("equation");
  const equation = flatten(equationCell.text);
  if (equation && !questionText.includes(equation)) {
    questionText = questionText ? `${questionText} ${equation}` : equation;
  }

  return {
    index,
    questionText,
    questionType: typeRaw || DEFAULTS.questionType,
    difficulty: difficultyRaw || DEFAULTS.difficulty,
    medium: mediumRaw || DEFAULTS.medium,
    marks: Number.isFinite(marksParsed) ? marksParsed : DEFAULTS.marks,
    bloomLevel: bloomRaw || DEFAULTS.bloomLevel,
    previousYearTag: previousYear || null,
    tags,
    options,
    matchPairs,
    answerKey: correctRaw || null,
    explanation: solution,
  };
}

// ------------------------------------------------------------
//  Public API
// ------------------------------------------------------------

/**
 * Parses a filled-in template.
 *
 * Never throws for a bad file: an unreadable archive or malformed XML
 * comes back as `errors`, so the caller can show the teacher what went
 * wrong instead of a stack trace.
 */
export function parseQuestionDocx(bytes: Uint8Array): ParseResult {
  const drafts: ParsedQuestionDraft[] = [];
  const errors: ParsedQuestionError[] = [];
  let blankBoxes = 0;

  let xml: string | null;
  try {
    xml = readZipText(bytes, "word/document.xml");
  } catch {
    return {
      drafts,
      meta: null,
      blankBoxes: 0,
      errors: [
        {
          index: 0,
          preview: "",
          code: "missing-question",
          message: "This file could not be opened. Is it a .docx saved by Word?",
        },
      ],
    };
  }

  if (!xml) {
    return {
      drafts,
      meta: null,
      blankBoxes: 0,
      errors: [
        {
          index: 0,
          preview: "",
          code: "missing-question",
          message: "This file has no Word document inside it. It may not be a .docx.",
        },
      ],
    };
  }

  const root = parseXml(xml);
  const body = root ? childNamed(root, "body") : null;
  if (!body) {
    return {
      drafts,
      meta: null,
      blankBoxes: 0,
      errors: [
        {
          index: 0,
          preview: "",
          code: "missing-question",
          message: "This document's content could not be read.",
        },
      ],
    };
  }

  const meta = readMeta(body);
  const tables = childrenNamed(body, "tbl");

  for (const tbl of tables) {
    if (isSeparatorTable(tbl)) continue;

    const fields = readQuestionTable(tbl);
    const questionCell = fields.fields.question;
    const questionText = flatten(questionCell?.text ?? "");

    // An unfilled box is normal — the template ships blank ones.
    if (!questionText && !questionCell?.ommlLatex) {
      blankBoxes += 1;
      continue;
    }

    const draft = buildDraft(drafts.length + 1, fields);

    if (!draft.questionText) {
      errors.push({
        index: draft.index,
        preview: "",
        code: "missing-question",
        message: "The Question cell is empty.",
      });
      continue;
    }

    // Unreadable maths must block the commit rather than ship a question
    // with a silently missing formula.
    if (fields.hasUnreadableObject) {
      errors.push({
        index: draft.index,
        preview: draft.questionText.slice(0, 60),
        code: "unresolved-equation",
        message:
          "This question contains an embedded equation image that cannot be read. Re-enter it as LaTeX text ($…$) in the Equation (LaTeX) cell, or use Word's Insert ▸ Equation.",
      });
      continue;
    }

    // Marks are optional — an empty cell means "use the default". Only a
    // cell the teacher actually filled with something unparseable is an
    // error; rejecting blanks here would fail every question in a template
    // that leaves Marks alone.
    const marksRaw = fields.fields.marks?.text.trim() ?? "";
    if (marksRaw.length > 0 && !Number.isFinite(Number.parseFloat(marksRaw))) {
      errors.push({
        index: draft.index,
        preview: draft.questionText.slice(0, 60),
        code: "bad-marks",
        message: `Marks must be a number (found "${marksRaw}").`,
      });
      continue;
    }

    drafts.push(draft);
  }

  return { drafts, errors, meta, blankBoxes };
}

/**
 * Warns when the file was built by a template revision this parser does
 * not know. V1 was the old `Q1.` / `---` plain-text format, which this
 * parser cannot read at all.
 */
export function metaWarning(meta: TemplateMeta | null): string | null {
  if (!meta) {
    return "No targeting data found in this file. The chapter you pick here will be used instead.";
  }
  if (meta.templateVersion < TEMPLATE_VERSION) {
    return "This file uses an older template format. Download a fresh template and copy your questions into it.";
  }
  if (meta.templateVersion > TEMPLATE_VERSION) {
    return "This file was made with a newer version of the template. Some fields may be ignored.";
  }
  return null;
}