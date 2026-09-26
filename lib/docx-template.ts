// ============================================================
//  .docx Import Template Generator
//
//  Produces the downloadable bulk-import template as a real Word
//  file (Word 2007+ .docx = zip of OOXML parts). Built by hand —
//  no docx dependency. Opens in Word, Google Docs, LibreOffice.
//
//  Contents:
//    Page 1 — instructions (ignored by the importer, safe to keep)
//    Page 2 — one example block for every question type
//             (MCQ, SHORT_ANSWER, LONG_ANSWER, TRUE_FALSE,
//              FILL_IN_THE_BLANK, MATCH_THE_FOLLOWING, CASE_STUDY)
//             including Gujarati + KaTeX samples.
// ============================================================

export const IMPORT_TEMPLATE_FILENAME = "question-import-template.docx";

// ------------------------------------------------------------
//  Minimal ZIP (STORE, no compression) writer
// ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Uint8Array };

function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  // Fixed timestamp (2026-09-01 00:00) — content doesn't change per build
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 1;

  const push = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const localOffset = offset;

    // Local file header
    push([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0,
      dosTime & 0xff, (dosTime >>> 8) & 0xff,
      dosDate & 0xff, (dosDate >>> 8) & 0xff,
      crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      nameBytes.length & 0xff, (nameBytes.length >>> 8) & 0xff,
      0, 0,
    ]);
    parts.push(nameBytes);
    parts.push(entry.data);

    // Central directory record
    const centralBytes: number[] = [
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0,
      dosTime & 0xff, (dosTime >>> 8) & 0xff,
      dosDate & 0xff, (dosDate >>> 8) & 0xff,
      crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      nameBytes.length & 0xff, (nameBytes.length >>> 8) & 0xff,
      // extra len, comment len, disk start, internal attrs (2 bytes each)
      0, 0, 0, 0, 0, 0, 0, 0,
      // external attrs (4 bytes)
      0, 0, 0, 0,
      localOffset & 0xff, (localOffset >>> 8) & 0xff,
      (localOffset >>> 16) & 0xff, (localOffset >>> 24) & 0xff,
    ];
    central.push(new Uint8Array([...centralBytes, ...nameBytes]));

    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  parts.push(...central);

  // End of central directory
  push([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
    entries.length & 0xff, (entries.length >>> 8) & 0xff,
    entries.length & 0xff, (entries.length >>> 8) & 0xff,
    centralSize & 0xff, (centralSize >>> 8) & 0xff,
    (centralSize >>> 16) & 0xff, (centralSize >>> 24) & 0xff,
    centralStart & 0xff, (centralStart >>> 8) & 0xff,
    (centralStart >>> 16) & 0xff, (centralStart >>> 24) & 0xff,
    0, 0,
  ]);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ------------------------------------------------------------
//  OOXML helpers
// ------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Run = { text: string; bold?: boolean; color?: string; size?: number; font?: string };

// sz is in half-points: 20 = 10pt, 22 = 11pt, 28 = 14pt
function para(runs: Run[], spacingAfter = 120): string {
  const r = runs
    .map(({ text, bold, color, size, font }) => {
      const rpr =
        `<w:rPr>${bold ? "<w:b/>" : ""}` +
        (font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : "") +
        (color ? `<w:color w:val="${color}"/>` : "") +
        `<w:sz w:val="${size ?? 22}"/></w:rPr>`;
      return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    })
    .join("");
  return `<w:p><w:pPr><w:spacing w:after="${spacingAfter}"/></w:pPr>${r}</w:p>`;
}

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

// ------------------------------------------------------------
//  Template content
// ------------------------------------------------------------

const DARK = "0F172A";
const GRAY = "64748B";
const RED = "B91C1C";
const GREEN = "047857";
const MONO = "Consolas";

// One example block per question type — each block is written to
// pass parseDocxQuestions + questionFormSchema unchanged.
const EXAMPLE_BLOCKS: string[][] = [
  [
    "Q1. What is the value of x if 2x + 5 = 15?",
    "Type: MCQ",
    "Difficulty: EASY",
    "Marks: 1",
    "Bloom: APPLY",
    "Year: GSEB 2023",
    "Tags: algebra, linear-equations",
    "Options:",
    "A) x = 3",
    "B) x = 5 *",
    "C) x = 7",
    "D) x = 10",
    "Explanation: 2x = 15 - 5 = 10, so x = 5",
  ],
  [
    "Q2. ગુજરાતીમાં ઉત્તર આપો: $\\sqrt{144}$ ની કિંમત શું છે?",
    "Type: SHORT_ANSWER",
    "Difficulty: EASY",
    "Marks: 1",
    "Bloom: REMEMBER",
    "Answer: 12",
  ],
  [
    "Q3. The sum of the interior angles of a triangle is 180°.",
    "Type: TRUE_FALSE",
    "Difficulty: EASY",
    "Marks: 1",
    "Bloom: REMEMBER",
    "Answer: True",
  ],
  [
    "Q4. Fill in the blank: The HCF of 12 and 18 is ____.",
    "Type: FILL_IN_THE_BLANK",
    "Difficulty: MEDIUM",
    "Marks: 1",
    "Bloom: UNDERSTAND",
    "Answer: 6",
  ],
  [
    "Q5. Explain, with steps, how to solve a pair of linear equations by substitution. Support your answer with one worked example.",
    "Type: LONG_ANSWER",
    "Difficulty: MEDIUM",
    "Marks: 4",
    "Bloom: UNDERSTAND",
    "Answer: Solve one equation for a variable, substitute into the other, solve, then back-substitute.",
    "Explanation: Award marks for correct method (2), correct example (1), clear steps (1).",
  ],
  [
    "Q6. Match the following shapes with their number of sides.",
    "Type: MATCH_THE_FOLLOWING",
    "Difficulty: EASY",
    "Marks: 2",
    "Bloom: UNDERSTAND",
    "Pairs:",
    "Triangle => 3",
    "Square => 4",
    "Pentagon => 5",
  ],
  [
    "Q7. Read the case and answer: A school plants trees along a path, first at 2 m and each next one 3 m further. Find the distance of the 10th tree.",
    "Type: CASE_STUDY",
    "Format: INLINE",
    "Difficulty: HARD",
    "Marks: 5",
    "Bloom: ANALYZE",
    "Answer: d(n) = 2 + (n-1)*3, so the 10th tree is at 29 m.",
    "Explanation: Arithmetic progression with first term 2 and common difference 3.",
  ],
];

function buildDocumentXml(): string {
  const out: string[] = [];

  const line = (text: string, o: Partial<Run> = {}, after = 120) =>
    out.push(para([{ text, ...o }], after));
  const bullet = (text: string, o: Partial<Run> = {}) =>
    out.push(para([{ text: "•  ", color: GRAY, size: 20 }, { text, size: 20, color: DARK, ...o }], 60));
  const code = (text: string, o: Partial<Run> = {}) =>
    out.push(para([{ text, size: 20, font: MONO, color: DARK, ...o }], 40));

  // ── Page 1: cover ──
  line("SchoolPaperGen — Bulk Question Import Template", { bold: true, size: 32, color: DARK }, 80);
  line(
    "Add your questions on the next pages, then upload this file at Questions → Bulk Import.",
    { color: GRAY },
    80
  );
  line("Works with Microsoft Word, Google Docs and LibreOffice.", { color: GRAY }, 200);

  // ── Page 2: instructions (skipped automatically by the importer) ──
  out.push(PAGE_BREAK);
  line("INSTRUCTIONS", { bold: true, size: 26, color: GREEN }, 120);
  bullet("Each question is one block. Separate blocks with a line containing only three hyphens: ---");
  bullet("If Word converts the hyphens into a long dash (—), that still works.");
  bullet("Optional fields can be left out — defaults are used.");
  bullet("Type values: MCQ, SHORT_ANSWER, LONG_ANSWER, TRUE_FALSE, FILL_IN_THE_BLANK, MATCH_THE_FOLLOWING, CASE_STUDY");
  bullet("Difficulty: EASY / MEDIUM / HARD   •   Bloom: REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE");
  bullet("MCQ: list options as A) … B) … and mark the correct one with * (or set Answer: A). 2–6 options.");
  bullet("TRUE_FALSE: Answer: True or Answer: False.");
  bullet("FILL_IN_THE_BLANK: write ____ where the blank goes, then Answer: the missing word.");
  bullet("MATCH_THE_FOLLOWING: list 2–10 pairs under Pairs: as Left => Right.");
  bullet("CASE_STUDY: add Format: INLINE or Format: SHARED_PASSAGE.");
  bullet("Gujarati text and KaTeX math like $\\frac{1}{2}$ are preserved.");
  bullet("Year: optional previous-year tag (e.g. GSEB 2023).   Tags: comma-separated.");
  bullet("Keep this instructions page in the file if you like — the importer skips it automatically.", { bold: true, color: RED });

  // ── Page 3+: examples ──
  out.push(PAGE_BREAK);
  line("EXAMPLES — one block per question type", { bold: true, size: 26, color: DARK }, 120);
  out.push(para([{ text: "---", bold: true, color: RED, size: 20 }], 80));

  EXAMPLE_BLOCKS.forEach((block, i) => {
    block.forEach((l, j) => {
      const isQuestionLine = j === 0;
      code(l, isQuestionLine ? { bold: true } : {});
    });
    if (i < EXAMPLE_BLOCKS.length - 1) {
      out.push(para([{ text: "---", bold: true, color: RED, size: 20 }], 80));
    }
  });

  const body = out.join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}` +
    `<w:sectPr>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

// ------------------------------------------------------------
//  Public API
// ------------------------------------------------------------

/** Builds the bulk-import template as a valid .docx byte array. */
export function buildImportTemplateDocx(): Uint8Array {
  const enc = new TextEncoder();

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  return buildZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/document.xml", data: enc.encode(buildDocumentXml()) },
  ]);
}
