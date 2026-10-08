import { describe, expect, it } from "vitest";
import {
  parseXml,
  childNamed,
  childrenNamed,
  descendants,
  textOf,
  type XmlNode,
} from "@/lib/xml-parse";
import { readZipText } from "@/lib/zip-read";
import {
  META_END,
  META_START,
  TEMPLATE_VERSION,
  buildQuestionTemplateDocx,
  templateFileName,
  type TemplateLabels,
  type TemplateTargets,
} from "@/lib/docx-table-template";
import { borderedTable } from "@/lib/docx";
import { parseQuestionDocx } from "@/lib/docx-table-parser";

// ============================================================
//  lib/docx-table-template.ts
//
//  The template is only useful if Word opens it without a repair
//  prompt and the metadata survives the round trip, so these tests
//  read the generated package back rather than asserting on strings.
// ============================================================

const targets: TemplateTargets = {
  schoolId: "sch_1",
  classLevelId: "cl_10",
  subjectId: "sub_math",
  chapterId: "ch_linear",
  topicId: "top_linear",
};

const labels: TemplateLabels = {
  school: "Vidyadhish Vidyasankul",
  classLevel: "Std 10",
  subject: "Mathematics",
  chapter: "Linear Equations",
  topic: "Two-variable equations",
};

function readDocumentXml(bytes: Uint8Array): string {
  const xml = readZipText(bytes, "word/document.xml");
  expect(xml).toBeTruthy();
  return xml!;
}

describe("buildQuestionTemplateDocx", () => {
  it("produces a package with the OOXML parts Word requires", () => {
    const bytes = buildQuestionTemplateDocx(targets, labels, 3);
    expect(readZipText(bytes, "[Content_Types].xml")).toBeTruthy();
    expect(readZipText(bytes, "_rels/.rels")).toBeTruthy();
    expect(readZipText(bytes, "word/document.xml")).toBeTruthy();
  });

  it("declares the required namespaces on w:document", () => {
    const xml = readDocumentXml(buildQuestionTemplateDocx(targets, labels, 2));
    expect(xml).toContain('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"');
    // OMML support is required or Word strips pasted equations.
    expect(xml).toContain("xmlns:m=");
  });

  it("emits one table per question box", () => {
    const root = parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 4)))!;
    const body = childNamed(root, "body")!;

    // 4 question boxes + 3 separators between them.
    const tables = childrenNamed(body, "tbl");
    expect(tables.length).toBe(7);
  });

  it("embeds the targeting ids in a machine-readable block", () => {
    const text = textOf(parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 2)))!);

    expect(text).toContain(META_START);
    expect(text).toContain(META_END);
    expect(text).toContain(`templateVersion=${TEMPLATE_VERSION}`);
    expect(text).toContain("schoolId=sch_1");
    expect(text).toContain("classLevelId=cl_10");
    expect(text).toContain("subjectId=sub_math");
    expect(text).toContain("chapterId=ch_linear");
    expect(text).toContain("topicId=top_linear");
  });

  it("shows human-readable labels so a stale template is obvious", () => {
    const text = textOf(parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 2)))!);
    expect(text).toContain("Vidyadhish Vidyasankul");
    expect(text).toContain("Std 10");
    expect(text).toContain("Mathematics");
    expect(text).toContain("Linear Equations");
  });

  it("writes an empty topicId when targeting a chapter only", () => {
    const text = textOf(
      parseXml(
        readDocumentXml(
          buildQuestionTemplateDocx({ ...targets, topicId: null }, labels, 1)
        )
      )!
    );
    expect(text).toContain("topicId=");
    expect(text).not.toContain("topicId=null");
  });

  it("gives every question box the full set of field labels", () => {
    const root = parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 1)))!;
    const body = childNamed(root, "body")!;
    const firstTable = childrenNamed(body, "tbl")[0];

    const labelText = childrenNamed(firstTable, "tr")
      .map((tr) => childrenNamed(tr, "tc").map(textOf).join("|"))
      .join("\n");

    for (const field of [
      "Question",
      "Option A",
      "Option B",
      "Option C",
      "Option D",
      "Correct",
      "Marks",
      "Difficulty",
      "Medium",
      "Type",
      "Bloom",
      "Equation (LaTeX)",
      "Previous Year",
      "Solution",
    ]) {
      expect(labelText).toContain(field);
    }
  });

  it("round-trips Gujarati through the writer and reader", () => {
    const text = textOf(parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 1)))!);
    expect(text).toContain("GUJARATI");
    // Gujarati is a precomposed/decomposed minefield: verify the exact
    // code points survive, not just that some Gujarati-looking glyphs appear.
    expect(text).toContain("ઉદાહરણ");
    expect(text).toContain("કિંમત શું છે");
  });

  it("always emits at least one box, even for a zero request", () => {
    const root = parseXml(readDocumentXml(buildQuestionTemplateDocx(targets, labels, 0)))!;
    expect(childrenNamed(childNamed(root, "body")!, "tbl").length).toBeGreaterThan(0);
  });
});

describe("question block layout", () => {
  const xml = readDocumentXml(buildQuestionTemplateDocx(targets, labels, 1));
  const root = parseXml(xml)!;
  const table = childrenNamed(childNamed(root, "body")!, "tbl")[0];
  const rows = childrenNamed(table, "tr");

  // gridSpan lives in <w:tcPr> and gridCol in <w:tblGrid>, so these need a
  // descendant search — a direct-children lookup finds neither.
  const deep = (node: XmlNode, name: string) =>
    descendants(node).filter((n) => n.name === name);

  const rowText = (i: number) => childrenNamed(rows[i], "tc").map(textOf).join("|");
  const rowSpan = (i: number) =>
    deep(rows[i], "tc").reduce(
      (sum, tc) => sum + Number(deep(tc, "gridSpan")[0]?.attrs.val ?? 1),
      0
    );

  it("gives the question the whole row", () => {
    expect(rowText(0)).toBe("Question");
    expect(rowSpan(0)).toBe(4);
    expect(rowSpan(1)).toBe(4);
  });

  it("stacks the options one per row, each the whole width", () => {
    for (const [i, name] of [
      [2, "Option A"],
      [4, "Option B"],
      [6, "Option C"],
      [8, "Option D"],
    ] as const) {
      expect(rowText(i)).toBe(name);
      expect(rowSpan(i)).toBe(4);
      // …and each option's answer box beneath it is full width too.
      expect(rowSpan(i + 1)).toBe(4);
    }
  });

  it("keeps the metadata rows four-across and the solution full width", () => {
    expect(rowText(10)).toBe("Correct|Marks|Difficulty|Medium");
    expect(rowText(12)).toBe("Type|Bloom|Equation (LaTeX)|Previous Year");
    expect(rowSpan(10)).toBe(4);
    expect(rowSpan(12)).toBe(4);

    expect(rowText(14)).toBe("Solution");
    expect(rowSpan(14)).toBe(4);
    expect(rowSpan(15)).toBe(4);
  });

  it("emits sixteen rows for fourteen fields", () => {
    expect(rows.length).toBe(16);
  });

  it("fits the printable width exactly, so nothing runs off the page", () => {
    // A4 portrait minus the 20mm default margins. The earlier grid summed to
    // 10400 twips against 9638 of usable width, pushing the right-hand column
    // 1.34cm past the margin.
    const printable = 11906 - 1134 * 2;
    const grid = deep(table, "gridCol").map((g) => Number(g.attrs.w));
    expect(grid.reduce((a, b) => a + b, 0)).toBe(printable);
    expect(Number(deep(table, "tblW")[0].attrs.w)).toBe(printable);
  });

  it("covers the whole grid on every row, so the borders line up", () => {
    for (let i = 0; i < rows.length; i++) {
      expect(rowSpan(i)).toBe(4);
    }
  });
});

describe("instructions page", () => {
  const xml = readDocumentXml(buildQuestionTemplateDocx(targets, labels, 1));
  const text = textOf(parseXml(xml)!);

  it("gives the instructions in both English and Gujarati", () => {
    for (const s of [
      "How to fill this template",
      "The grey labels are fixed",
      "Maths",
      "Before you upload",
    ]) {
      expect(text).toContain(s);
    }

    for (const s of [
      "આ ટેમ્પ્લેટ કેવી રીતે ભરવું", // how to fill this template
      "કડા લેબલ સ્થિર છે", // the grey labels are fixed
      "ગણિત", // maths
      "અપલોડ કરતાં પહેલાં", // before you upload
    ]) {
      expect(text).toContain(s);
    }
  });

  it("keeps the field names and enum values in English inside the Gujarati copy", () => {
    // Teachers copy these verbatim into the cells, and the parser matches the
    // labels case-insensitively but expects these exact enum spellings.
    expect(text).toContain("'Question' બોક્સમાં");
    expect(text).toContain("Marks માં દાશાંશ પણ લખી શકો");
    expect(text).toContain("Difficulty: EASY, MEDIUM અથવા HARD");
    expect(text).toContain("MATCH_THE_FOLLOWING");
    expect(text).toContain("સેલનો Medium GUJARATI જ રાખો");
  });

  it("gives the Gujarati runs a complex-script font", () => {
    // Word picks w:cs for Indic runs; without it they fall back to the theme
    // font and render as tofu in WPS Office / LibreOffice.
    expect(xml).toContain('w:cs="Nirmala UI"');
  });

  it("keeps the instructions out of the parsed questions", async () => {
    const { drafts, errors } = parseQuestionDocx(
      buildQuestionTemplateDocx(targets, labels, 3)
    );
    expect(drafts).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("borderedTable grid derivation", () => {
  it("derives the grid from the widest row, not the first", () => {
    // A leading merged row must not collapse the grid to one column,
    // or Word reports the table as corrupt.
    const xml = borderedTable(
      1000,
      [
        [{ widthTwips: 1000, gridSpan: 4, paragraphs: "<w:p/>" }],
        [
          { widthTwips: 250, paragraphs: "<w:p/>" },
          { widthTwips: 250, paragraphs: "<w:p/>" },
          { widthTwips: 250, paragraphs: "<w:p/>" },
          { widthTwips: 250, paragraphs: "<w:p/>" },
        ],
      ],
      "999999"
    );

    expect((xml.match(/<w:gridCol /g) ?? []).length).toBe(4);
    expect(xml).toContain('<w:gridSpan w:val="4"/>');
  });

  it("marks the requested leading rows as repeating headers", () => {
    const cell = { widthTwips: 500, paragraphs: "<w:p/>" };
    const xml = borderedTable(
      1000,
      [
        [cell, cell],
        [cell, cell],
      ],
      "999999",
      { repeatHeaderRows: 1 }
    );
    expect((xml.match(/<w:tblHeader\/>/g) ?? []).length).toBe(1);
  });

  it("omits gridSpan for single-column cells", () => {
    const xml = borderedTable(500, [[{ widthTwips: 500, paragraphs: "<w:p/>" }]]);
    expect(xml).not.toContain("gridSpan");
  });

  it("returns an empty string when there are no rows", () => {
    expect(borderedTable(500, [])).toBe("");
  });
});

describe("templateFileName", () => {
  it("builds a readable, filesystem-safe name", () => {
    expect(templateFileName("Std 10", "Mathematics")).toBe("std-10-mathematics-questions.docx");
  });

  it("strips characters Windows rejects", () => {
    const name = templateFileName("Std 10", "Maths & Science: Part 1");
    expect(name).toMatch(/^[a-z0-9-]+\.docx$/);
  });

  it("falls back when a label has no usable characters", () => {
    expect(templateFileName("***", "###")).toBe("class-class-questions.docx");
  });
});