import { readFileSync } from "node:fs";
import { readZipText } from "@/lib/zip-read";
import { parseXml, type XmlNode } from "@/lib/xml-parse";

const path = process.argv[2] ?? "other/question-import-template.docx";
const doc = readZipText(readFileSync(path), "word/document.xml");
if (!doc) throw new Error("no document.xml");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function descendants(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

function textOf(node: XmlNode): string {
  let out = "";
  for (const c of node.children) {
    if (c.name === "t") out += c.text;
    else out += textOf(c);
  }
  return out;
}

/** Paragraphs of a cell, kept separate so empty lines show. */
function cellLines(cell: XmlNode): string[] {
  return descendants(cell, "p").map((p) => {
    const style = descendants(p, "pStyle").map((s) => s.attrs.val).join("|");
    const t = textOf(p).trim();
    return style ? `[${style}] ${t}` : t;
  });
}

const root = parseXml(doc);
if (!root) throw new Error("document.xml did not parse");
const body = descendants(root, "body")[0];
if (!body) throw new Error("no <w:body>");
const blocks = body.children.filter((c) => c.name === "p" || c.name === "tbl");

console.log(`=== BODY: ${blocks.length} top-level blocks ===\n`);

let tblNo = 0;
for (const [i, b] of blocks.entries()) {
  if (b.name === "p") {
    const t = textOf(b).trim();
    if (t) console.log(`[${String(i).padStart(3)}] PARA : ${t.slice(0, 120)}`);
    continue;
  }
  tblNo++;
  const rows = descendants(b, "tr");
  console.log(`\n[${String(i).padStart(3)}] TABLE #${tblNo} — ${rows.length} rows`);

  const firstCells = descendants(rows[0] ?? b, "tc");
  const cellCount = firstCells.length;
  const spans = descendants(b, "gridSpan").map((g) => g.attrs.val ?? "1");
  const widths = descendants(b, "tcW").map((w) => w.attrs.w ?? "?");
  console.log(`      cells/row=${cellCount} gridSpan=[${spans.join(",")}] tcW=[${widths.join(",")}]`);

  for (const [r, row] of rows.entries()) {
    const cells = descendants(row, "tc");
    const parts: string[] = [];
    for (const c of cells) {
      const span = descendants(c, "gridSpan")[0]?.attrs.val ?? "1";
      const lines = cellLines(c).filter((l, idx) => l !== "" || idx === 0);
      const body = lines.join(" / ").trim() || "(blank)";
      parts.push(span !== "1" ? `{s${span}}${body}` : body);
    }
    console.log(`      r${r}: ${parts.join("  |  ")}`);
  }
}
console.log(`\n=== ${tblNo} tables total ===`);
void W;
