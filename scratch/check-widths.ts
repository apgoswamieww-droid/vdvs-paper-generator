import { readFileSync } from "node:fs";
import { readZipText } from "@/lib/zip-read";
import { parseXml, type XmlNode } from "@/lib/xml-parse";

const PG_W = 11906;
const MARGIN = 1134;
const printable = PG_W - MARGIN * 2;

const file = process.argv[2] ?? "other/question-import-template-GU.docx";
const doc = readZipText(readFileSync(file), "word/document.xml")!;

function descendants(n: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (x: XmlNode) => {
    for (const c of x.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(n);
  return out;
}

console.log(`PRINTABLE width : ${printable} twips (${(printable / 1440).toFixed(2)} in)\n`);

const tbls = descendants(parseXml(doc)!, "tbl");
for (const [i, t] of tbls.slice(0, 2).entries()) {
  const tblW = Number(descendants(t, "tblW")[0]?.attrs.w);
  const grid = descendants(t, "gridCol").map((g) => Number(g.attrs.w));
  const sum = grid.reduce((a, b) => a + b, 0);
  const tcWs = [...new Set(descendants(t, "tcW").map((w) => Number(w.attrs.w)))];

  console.log(`table #${i + 1}`);
  console.log(`  tblW          : ${tblW} ${tblW === printable ? "OK" : "MISMATCH"}`);
  console.log(`  grid          : ${grid.join(" + ")} = ${sum} ${sum === printable ? "OK" : "MISMATCH"}`);
  console.log(`  overflow      : ${sum - printable} twips ${sum - printable <= 0 ? "(fits)" : "(OFF PAGE)"}`);
  console.log(`  distinct tcW  : ${tcWs.join(", ")}`);
  for (const w of tcWs) {
    const inGrid = grid.some((g) => g === w) || w === sum;
    console.log(`     tcW ${w} → ${inGrid ? "matches a grid column" : w === sum ? "full row" : "NO MATCH IN GRID"}`);
  }
  console.log("");
}

// Every row's cells must cover exactly the grid, or Word's borders drift.
console.log("=== row coverage (cells x span must equal 4) ===");
let bad = 0;
for (const [i, t] of tbls.slice(0, 2).entries()) {
  tbls.length;
  const rows = descendants(t, "tr");
  rows.forEach((r, ri) => {
    const cells = descendants(r, "tc");
    const covered = cells.reduce(
      (sum, c) => sum + Number(descendants(c, "gridSpan")[0]?.attrs.val ?? 1),
      0
    );
    if (covered !== 4) {
      bad++;
      console.log(`  table #${i + 1} row ${ri}: covers ${covered} of 4 columns  <-- BROKEN`);
    }
  });
}
console.log(bad === 0 ? "  all rows cover exactly 4 columns" : `  ${bad} broken rows`);
