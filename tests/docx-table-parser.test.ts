import { describe, expect, it } from "vitest";
import { borderedTable, buildDocx, buildDocumentXml, buildZip, defaultSectPr, para } from "@/lib/docx";
import { parseQuestionDocx, metaWarning } from "@/lib/docx-table-parser";
import { META_END, META_START, TEMPLATE_VERSION } from "@/lib/docx-table-template";

// ============================================================
//  lib/docx-table-parser.ts
//
//  Fixtures are built with the same OOXML helpers the template uses,
//  so they match what Word actually emits — including the things Word
//  does to a form on its own (repeated header rows, gridSpan, embedded
//  objects) rather than a tidy idealised shape.
// ============================================================

const W = 2600; // uniform grid column
const TOTAL = W * 4;

/** A cell: plain text, or raw paragraph XML for equations/objects. */
type Cell = { text?: string; xml?: string; span?: number };

function tc(cell: Cell) {
  return {
    widthTwips: (cell.span ?? 1) * W,
    gridSpan: cell.span ?? 1,
    paragraphs: cell.xml ?? para([{ text: cell.text ?? "" }], 0),
    vAlign: "top" as const,
  };
}

function tblXml(rows: Cell[][]): string {
  return borderedTable(TOTAL, rows.map((r) => r.map(tc)), "9CA3AF");
}

const row = (...labels: string[]): Cell[] => labels.map((l) => ({ text: l }));
const vals = (...texts: string[]): Cell[] => texts.map((t) => ({ text: t }));

function metaXml(over: Partial<Record<string, string>> = {}): string {
  const kv: Record<string, string> = {
    templateVersion: String(TEMPLATE_VERSION),
    schoolId: "sch_1",
    classLevelId: "cl_10",
    subjectId: "sub_math",
    chapterId: "ch_linear",
    topicId: "top_linear",
    ...over,
  };
  return (
    para([{ text: META_START }], 0) +
    Object.entries(kv)
      .map(([k, v]) => para([{ text: `${k}=${v}` }], 0))
      .join("") +
    para([{ text: META_END }], 0)
  );
}

/** Assemble a document from raw body parts. */
function docx(body: string): Uint8Array {
  return buildDocx(buildDocumentXml(body + metaXml(), defaultSectPr()));
}

/** A single MCQ question table. */
function mcqTable(over: { correct?: string; omitQuestion?: boolean } = {}): string {
  return tblXml([
    row("Question"),
    over.omitQuestion ? [{ text: "" }] : vals("What is 2x + 5 if x = 5?"),
    row("Option A", "Option B", "Option C", "Option D"),
    vals("11", "15", "17", "20"),
    row("Correct", "Marks", "Difficulty", "Medium"),
    vals(over.correct ?? "B", "2", "MEDIUM", "ENGLISH"),
    row("Type", "Bloom", "Previous Year"),
    vals("MCQ", "APPLY", "GSEB 2023"),
    row("Solution"),
    vals("Substitute x = 5: 2(5) + 5 = 15"),
  ]);
}

// ------------------------------------------------------------

describe("parseQuestionDocx", () => {
  it("reads one filled MCQ question", () => {
    const { drafts, errors } = parseQuestionDocx(docx(mcqTable()));

    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);

    const q = drafts[0];
    expect(q.questionText).toBe("What is 2x + 5 if x = 5?");
    expect(q.questionType).toBe("MCQ");
    expect(q.marks).toBe(2);
    expect(q.difficulty).toBe("MEDIUM");
    expect(q.medium).toBe("ENGLISH");
    expect(q.bloomLevel).toBe("APPLY");
    expect(q.previousYearTag).toBe("GSEB 2023");
    expect(q.explanation).toBe("Substitute x = 5: 2(5) + 5 = 15");
  });

  it("maps option letters to the cell they came from", () => {
    const { drafts } = parseQuestionDocx(docx(mcqTable({ correct: "C" })));
    expect(drafts[0].options).toEqual([
      { label: "A", text: "11", isCorrect: false },
      { label: "B", text: "15", isCorrect: false },
      { label: "C", text: "17", isCorrect: true },
      { label: "D", text: "20", isCorrect: false },
    ]);
  });

  it("reads several questions, keeping their order", () => {
    const a = tblXml([
      row("Question"),
      vals("First question?"),
      row("Type"),
      vals("SHORT_ANSWER"),
    ]);
    const b = tblXml([
      row("Question"),
      vals("Second question?"),
      row("Type"),
      vals("LONG_ANSWER"),
    ]);
    const { drafts } = parseQuestionDocx(docx(a + b));
    expect(drafts.map((d) => d.questionText)).toEqual(["First question?", "Second question?"]);
    expect(drafts.map((d) => d.index)).toEqual([1, 2]);
  });

  it("reads options stacked one per row (the template's current layout)", () => {
    // The template gives Question, each Option and Solution the whole row
    // rather than four options side by side. Pairing is label-row-then-value
    // -row, so a stack of single-field rows must read exactly like a
    // four-across row.
    const t = tblXml([
      row("Question"),
      vals("Which process do green plants use to make food?"),
      row("Option A"),
      vals("Respiration"),
      row("Option B"),
      vals("Photosynthesis"),
      row("Option C"),
      vals("Transpiration"),
      row("Option D"),
      vals("Condensation"),
      row("Correct", "Marks", "Difficulty", "Medium"),
      vals("B", "1", "EASY", "ENGLISH"),
      row("Type", "Bloom", "Equation", "Previous Year"),
      vals("MCQ", "REMEMBER", "", "GSEB 2022"),
      row("Solution"),
      vals("Photosynthesis converts light energy into chemical energy."),
    ]);

    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);

    const q = drafts[0];
    expect(q.questionText).toBe("Which process do green plants use to make food?");
    expect(q.options).toEqual([
      { label: "A", text: "Respiration", isCorrect: false },
      { label: "B", text: "Photosynthesis", isCorrect: true },
      { label: "C", text: "Transpiration", isCorrect: false },
      { label: "D", text: "Condensation", isCorrect: false },
    ]);
    expect(q.answerKey).toBe("B");
    expect(q.marks).toBe(1);
    expect(q.previousYearTag).toBe("GSEB 2022");
    expect(q.explanation).toBe("Photosynthesis converts light energy into chemical energy.");
  });

  it("leaves unused stacked option boxes blank instead of shifting the solution", () => {
    // The failure this guards: when Option A–D are left empty and only the
    // Solution is filled, a positional reader would report the solution as
    // option A and leave the solution blank.
    const t = tblXml([
      row("Question"),
      vals("Explain the Von Neumann architecture."),
      row("Option A"),
      vals(""),
      row("Option B"),
      vals(""),
      row("Option C"),
      vals(""),
      row("Option D"),
      vals(""),
      row("Correct", "Marks", "Difficulty", "Medium"),
      vals("", "3", "HARD", "GUJARATI"),
      row("Type", "Bloom", "Equation", "Previous Year"),
      vals("LONG_ANSWER", "ANALYZE", "", ""),
      row("Solution"),
      vals("Stored-program design: data and instructions share one memory."),
    ]);

    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(errors).toEqual([]);
    expect(drafts[0].options).toEqual([]);
    expect(drafts[0].explanation).toBe(
      "Stored-program design: data and instructions share one memory."
    );
    expect(drafts[0].marks).toBe(3);
    expect(drafts[0].medium).toBe("GUJARATI");
  });

  it("appends the Equation (LaTeX) cell to the question text", () => {
    const t = tblXml([
      row("Question"),
      vals("Find the value of"),
      row("Equation (LaTeX)"),
      vals("$\\sqrt{144}$"),
    ]);
    const { drafts } = parseQuestionDocx(docx(t));
    expect(drafts[0].questionText).toBe("Find the value of $\\sqrt{144}$");
  });

  it("accepts Gujarati question text", () => {
    const t = tblXml([
      row("Question"),
      vals("ગુજરાતીમાં ઉત્તર આપો: $\\sqrt{144}$ ની કિંમત શું છે?"),
      row("Medium"),
      vals("GUJARATI"),
    ]);
    const { drafts } = parseQuestionDocx(docx(t));
    expect(drafts[0].questionText).toBe("ગુજરાતીમાં ઉત્તર આપો: $\\sqrt{144}$ ની કિંમત શું છે?");
    expect(drafts[0].medium).toBe("GUJARATI");
  });

  it("applies form defaults when optional fields are blank", () => {
    const t = tblXml([row("Question"), vals("Bare question?"), row("Marks"), vals("")]);
    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(errors).toEqual([]);
    expect(drafts[0]).toMatchObject({
      questionType: "SHORT_ANSWER",
      difficulty: "MEDIUM",
      medium: "ENGLISH",
      bloomLevel: "UNDERSTAND",
    });
  });

  it("accepts fractional marks", () => {
    const t = tblXml([row("Question"), vals("Half marks?"), row("Marks"), vals("1.5")]);
    expect(parseQuestionDocx(docx(t)).drafts[0].marks).toBe(1.5);
  });

  it("ignores rows whose label it does not recognise", () => {
    // A teacher adding their own row must not break the file, and must
    // not be silently folded into a real field either.
    const t = tblXml([
      row("Question"),
      vals("Which board?"),
      row("Board"),
      vals("GSEB"),
      row("Type"),
      vals("SHORT_ANSWER"),
    ]);
    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].questionText).toBe("Which board?");
    expect(drafts[0].questionType).toBe("SHORT_ANSWER");
  });

  it("reads MATCH_THE_FOLLOWING pairs from the Solution cell", () => {
    const t = tblXml([
      row("Question"),
      vals("Match the shapes"),
      row("Type"),
      vals("MATCH_THE_FOLLOWING"),
      row("Solution"),
      vals("Triangle => 3\nSquare => 4\nPentagon => 5"),
    ]);
    const { drafts } = parseQuestionDocx(docx(t));
    expect(drafts[0].matchPairs).toEqual([
      { left: "Triangle", right: "3" },
      { left: "Square", right: "4" },
      { left: "Pentagon", right: "5" },
    ]);
    expect(drafts[0].explanation).toBeNull();
  });
});

describe("Word's own behaviours", () => {
  it("skips the separator table between question boxes", () => {
    const separator = tblXml([[{ text: "", span: 4 }]]);
    const { drafts, blankBoxes } = parseQuestionDocx(
      docx(mcqTable() + separator + mcqTable())
    );
    expect(drafts).toHaveLength(2);
    expect(blankBoxes).toBe(0);
  });

  it("treats a repeated header row as labels, not as data", () => {
    // Word copies <w:tblHeader/> rows to the top of every page a table
    // spans, so a long question legitimately contains them twice.
    const repeated = tblXml([
      row("Question"),
      vals("A long question that flows onto the next page?"),
      row("Question"),
      vals("A long question that flows onto the next page?"),
      row("Correct"),
      vals("B"),
    ]);
    const { drafts, errors } = parseQuestionDocx(docx(repeated));
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].questionText).toBe("A long question that flows onto the next page?");
    expect(drafts[0].answerKey).toBe("B");
  });

  it("reads a full-width gridSpan cell as one field", () => {
    const t = tblXml([
      [{ text: "Question", span: 4 }],
      [{ text: "Spanning the whole grid?", span: 4 }],
    ]);
    expect(parseQuestionDocx(docx(t)).drafts[0].questionText).toBe("Spanning the whole grid?");
  });

  it("skips the blank boxes a template ships with", () => {
    const emptyBox = tblXml([row("Question"), vals(""), row("Correct"), vals("")]);
    const { drafts, blankBoxes } = parseQuestionDocx(
      docx(mcqTable() + emptyBox + emptyBox)
    );
    expect(drafts).toHaveLength(1);
    expect(blankBoxes).toBe(2);
  });

  it("converts a pasted Word equation in the Question cell", () => {
    // Word's own <m:oMath> for d/dx(x²) = ? — the case from the parser
    // investigation, where mammoth dropped it entirely.
    const omml =
      `<m:oMath>` +
      `<m:f><m:num><m:r><m:t>d</m:t></m:r></m:num><m:den><m:r><m:t>dx</m:t></m:r></m:den></m:f>` +
      `<m:r><m:t>(</m:t></m:r>` +
      `<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>` +
      `<m:r><m:t>) = ?</m:t></m:r>` +
      `</m:oMath>`;

    const t = tblXml([
      row("Question"),
      [{ xml: para([], 0) + omml }],
      row("Type"),
      vals("SHORT_ANSWER"),
    ]);

    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(errors).toEqual([]);
    expect(drafts[0].questionText).toBe("$\\frac{d}{dx}(x^{2}) = ?$");
  });

  it("blocks a row whose equation is a MathType OLE object", () => {
    // MathType's default output: a picture plus an embedded binary with
    // no recoverable text. It must never import as a question with the
    // formula silently missing.
    const ole =
      `<w:p><w:r><w:object w:dxaOrig="1440">` +
      `<v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:72pt;height:36pt"/>` +
      `<o:OLEObject Type="Embed" ProgID="Equation.3" ShapeID="_x0000_i1025" ObjectID="_1"/>` +
      `</w:object></w:r></w:p>`;

    const t = tblXml([
      row("Question"),
      [{ text: "Solve for x" }, { xml: ole }],
      row("Correct"),
      vals("4"),
    ]);

    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(drafts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("unresolved-equation");
    expect(errors[0].message).toMatch(/LaTeX/i);
  });
});

describe("error reporting", () => {
  it("rejects a row whose marks are not a number", () => {
    const t = tblXml([row("Question"), vals("Bad marks?"), row("Marks"), vals("one")]);
    const { drafts, errors } = parseQuestionDocx(docx(t));
    expect(drafts).toHaveLength(0);
    expect(errors[0].code).toBe("bad-marks");
    expect(errors[0].preview).toBe("Bad marks?");
  });

  it("reports a file that is not a docx without throwing", () => {
    const { errors, drafts } = parseQuestionDocx(Buffer.from("not a zip at all"));
    expect(drafts).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/could not be opened/i);
  });

  it("reports a zip that genuinely has no Word document inside", () => {
    // A .docx-shaped package missing its main part — e.g. a renamed file.
    const notADocx = buildZip([
      {
        name: "[Content_Types].xml",
        data: new TextEncoder().encode("<Types/>"),
      },
    ]);
    const { errors } = parseQuestionDocx(notADocx);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/no Word document/i);
  });

  it("accepts a valid but empty document without inventing errors", () => {
    const { drafts, errors } = parseQuestionDocx(
      buildDocx(buildDocumentXml("", defaultSectPr()))
    );
    expect(drafts).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("reports malformed XML without throwing", () => {
    const broken = buildDocx(
      `<?xml version="1.0"?><w:document><w:body><w:tbl><w:tr>`,
      []
    );
    // A truncated document must degrade to a message, never a crash.
    expect(() => parseQuestionDocx(broken)).not.toThrow();
  });
});

describe("template metadata", () => {
  it("recovers the targeting ids", () => {
    const { meta } = parseQuestionDocx(docx(mcqTable()));
    expect(meta).toEqual({
      templateVersion: TEMPLATE_VERSION,
      schoolId: "sch_1",
      classLevelId: "cl_10",
      subjectId: "sub_math",
      chapterId: "ch_linear",
      topicId: "top_linear",
    });
  });

  it("reports a null topicId as null rather than an empty string", () => {
    const body = mcqTable();
    const withEmptyTopic =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${body}` +
      para([{ text: META_START }], 0) +
      para([{ text: "subjectId=sub" }], 0) +
      para([{ text: "schoolId=sch" }], 0) +
      para([{ text: "chapterId=ch" }], 0) +
      para([{ text: "topicId=" }], 0) +
      para([{ text: META_END }], 0) +
      `</w:body></w:document>`;
    expect(parseQuestionDocx(buildDocx(withEmptyTopic)).meta?.topicId).toBeNull();
  });

  it("returns null meta when the block is absent", () => {
    const body =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${mcqTable()}</w:body></w:document>`;
    expect(parseQuestionDocx(buildDocx(body)).meta).toBeNull();
  });
});

describe("metaWarning", () => {
  it("warns when there is no metadata block", () => {
    expect(metaWarning(null)).toMatch(/chapter you pick/i);
  });

  it("warns about the superseded plain-text template", () => {
    expect(metaWarning({
      templateVersion: 1,
      schoolId: "s",
      classLevelId: "c",
      subjectId: "b",
      chapterId: "h",
      topicId: null,
    })).toMatch(/older template/i);
  });

  it("warns about a newer template", () => {
    expect(metaWarning({
      templateVersion: TEMPLATE_VERSION + 1,
      schoolId: "s",
      classLevelId: "c",
      subjectId: "b",
      chapterId: "h",
      topicId: null,
    })).toMatch(/newer version/i);
  });

  it("stays quiet for a matching template", () => {
    expect(metaWarning({
      templateVersion: TEMPLATE_VERSION,
      schoolId: "s",
      classLevelId: "c",
      subjectId: "b",
      chapterId: "h",
      topicId: null,
    })).toBeNull();
  });
});