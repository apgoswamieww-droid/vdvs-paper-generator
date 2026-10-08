import { readFileSync } from "node:fs";
import { readZip, readZipText } from "@/lib/zip-read";
import { parseQuestionDocx } from "@/lib/docx-table-parser";

const path = process.argv[2] ?? "other/question-import-template.docx";
const bytes = readFileSync(path);

const zip = readZip(bytes);
console.log("=== ZIP ENTRIES ===");
for (const name of Object.keys(zip).sort()) console.log(`  ${name}  (${zip[name].length} bytes)`);

const doc = readZipText(bytes, "word/document.xml");
console.log("\n=== document.xml length:", doc?.length ?? "MISSING");

if (doc) {
  console.log("tables (w:tbl):        ", (doc.match(/<w:tbl>/g) ?? []).length);
  console.log("rows (w:tr):           ", (doc.match(/<w:tr>/g) ?? []).length);
  console.log("cells (w:tc):          ", (doc.match(/<w:tc>/g) ?? []).length);
  console.log("paragraphs (w:p):      ", (doc.match(/<w:p[ >]/g) ?? []).length);
  console.log("header rows (tblHeader):", (doc.match(/tblHeader/g) ?? []).length);
  console.log("gridSpan:              ", (doc.match(/gridSpan/g) ?? []).length);
  console.log("oMath:                 ", (doc.match(/<m:oMath/g) ?? []).length);
  console.log("META_START marker:     ", (doc.match(/VDVS-IMPORT-META-START/g) ?? []).length);
  console.log("META_END marker:       ", (doc.match(/VDVS-IMPORT-META-END/g) ?? []).length);
}

console.log("\n=== parseQuestionDocx() ===");
try {
  const result = parseQuestionDocx(bytes);
  console.log("drafts:", result.drafts.length);
  console.log("errors:", JSON.stringify(result.errors, null, 2));
  console.log("meta:", JSON.stringify(result.meta, null, 2));
  console.log("blankBoxes:", result.blankBoxes);
  for (const d of result.drafts.slice(0, 3)) console.log(JSON.stringify(d, null, 2));
} catch (err) {
  console.log("THREW:", err);
}
