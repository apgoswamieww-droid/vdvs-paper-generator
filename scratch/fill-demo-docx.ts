import { writeFileSync } from "node:fs";
import { readZipText } from "@/lib/zip-read";
import { buildDocx } from "@/lib/docx";
import { buildQuestionTemplateDocx } from "@/lib/docx-table-template";
import { parseQuestionDocx } from "@/lib/docx-table-parser";

const OUT = "other/question-import-template-FILLED.docx";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Writes `text` into the Nth <w:tc> of a <w:tr> row fragment.
 *
 * The cell's existing runs are REPLACED, not appended to. The template ships
 * a grey hint as real text ("1", "MEDIUM", "SHORT_ANSWER"), so appending
 * would yield "12" / "MEDIUMMEDIUM" — which is exactly what a teacher does
 * when they click at the end of a box instead of selecting it.
 */
function setRowCells(rowXml: string, texts: string[]): string {
  const parts = rowXml.split("<w:tc>");
  let i = 0;
  return parts
    .map((p, idx) => {
      if (idx === 0) return p;
      const text = texts[i++] ?? "";
      if (!text) return `<w:tc>${p}`;

      const open = p.indexOf("<w:p");
      const close = p.indexOf("</w:p>");
      if (open === -1 || close === -1) {
        return `<w:tc>${p}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:tc>`;
      }
      // Keep <w:pPr> (alignment/spacing), drop every run, then add one.
      const inner = p.slice(open, close);
      const pPr = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
      const rebuilt =
        inner.slice(0, open >= 0 ? inner.indexOf(">") + 1 : 0) +
        pPr +
        `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
        "</w:p>";
      return `<w:tc>${rebuilt}${p.slice(close + "</w:p>".length)}`;
    })
    .join("");
}

// ── The demo answers, keyed to the value rows of a question table ──
// Question and Solution are full-width; each option is its own full-width
// row; only the two metadata rows carry four cells.
//   r1  = Question
//   r3  = Option A      r5 = Option B    r7 = Option C    r9 = Option D
//   r11 = Correct, Marks, Difficulty, Medium
//   r13 = Type, Bloom, Equation, Previous Year
//   r15 = Solution
const FILL: Record<number, Record<number, string[]>> = {
  0: {
    1: ["What is 2x + 5 if x = 5?"],
    3: ["11"],
    5: ["15"],
    7: ["17"],
    9: ["20"],
    11: ["B", "2", "MEDIUM", "ENGLISH"],
    13: ["MCQ", "APPLY", "", "GSEB 2023"],
    15: ["Substitute x = 5: 2(5) + 5 = 15"],
  },
  1: {
    1: ["ઉદાહરણ: $\\sqrt{144}$ ની કિંમત શું છે?"],
    11: ["12", "1", "EASY", "GUJARATI"],
    13: ["NUMERIC", "UNDERSTAND", "", ""],
    15: ["144 નું વર્ગમૂળ 12 છે."],
  },
  2: {
    1: ["Explain the Von Neumann architecture in two lines."],
    11: ["", "3", "HARD", "ENGLISH"],
    13: ["LONG_ANSWER", "ANALYZE", "", "GSEB 2024"],
    15: ["Stored-program design: data and instructions share one memory."],
  },
};

// Always start from the current template builder so the demo carries the
// latest instructions page (English + Gujarati).
const src = buildQuestionTemplateDocx(
  {
    schoolId: "sch_demo",
    classLevelId: "cl_11",
    subjectId: "sub_cs",
    chapterId: "ch_intro",
    topicId: null,
  },
  {
    school: "Vidyadhish Vidyasankul",
    classLevel: "Std 11",
    subject: "Computer Science",
    chapter: "Introduction to Computers",
    topic: null,
  },
  10
);
let xml = readZipText(src, "word/document.xml");
if (!xml) throw new Error("no document.xml");

// Tables 2, 4, 6... are the 1-row blank separators; only 1, 3, 5... are questions.
const isSeparator = (t: string) => (t.match(/<w:tr>/g) ?? []).length === 1;

let q = 0;
const filled: number[] = [];
xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
  if (isSeparator(table)) return table;
  const answers = FILL[q];
  if (!answers) {
    q++;
    return table;
  }
  filled.push(q + 1);
  q++;

  // Edit rows by POSITION. Several value rows are byte-identical (every
  // blank Option A–D box is the same empty paragraph), so a
  // string replace would always hit the first match and write Option D's
  // answer into Option A's box.
  const rowRe = /<w:tr>[\s\S]*?<\/w:tr>/g;
  const found = [...table.matchAll(rowRe)];
  if (!found.length) return table;

  const head = table.slice(0, found[0].index!);
  const last = found[found.length - 1];
  const tail = table.slice(last.index! + last[0].length);
  const rows = found.map((m) => m[0]);

  for (const [rowIdxStr, texts] of Object.entries(answers)) {
    const rowIdx = Number(rowIdxStr);
    if (rowIdx >= rows.length) {
      throw new Error(`row ${rowIdx} does not exist (table has ${rows.length})`);
    }
    rows[rowIdx] = setRowCells(rows[rowIdx], texts);
  }

  return head + rows.join("") + tail;
});

const out = buildDocx(xml);
writeFileSync(OUT, out);
console.log(`filled questions: ${filled.join(", ")}`);
console.log(`wrote ${OUT} (${out.length} bytes)\n`);

const { drafts, errors, blankBoxes, meta } = parseQuestionDocx(out);
console.log(`parsed → drafts=${drafts.length} errors=${errors.length} blankBoxes=${blankBoxes}`);
console.log("meta:", meta ? `v${meta.templateVersion} chapter=${meta.chapterId}` : "none");
console.log("");
for (const d of drafts) {
  console.log(`--- Question ${d.index} ---`);
  console.log(`  text      : ${d.questionText}`);
  console.log(`  type      : ${d.questionType}   marks: ${d.marks}   medium: ${d.medium}`);
  console.log(`  difficulty: ${d.difficulty}   bloom: ${d.bloomLevel}   prevYear: ${d.previousYearTag}`);
  console.log(`  options   : ${d.options.map((o) => `${o.label})=${o.text}${o.isCorrect ? "*" : ""}`).join("  ") || "(none)"}`);
  console.log(`  answerKey : ${d.answerKey}`);
  console.log(`  solution  : ${d.explanation ?? "(none)"}`);
}
if (errors.length) console.log("\nERRORS:", JSON.stringify(errors, null, 2));
