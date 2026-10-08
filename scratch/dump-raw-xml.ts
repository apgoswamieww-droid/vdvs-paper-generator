import { readFileSync } from "node:fs";
import { readZipText } from "@/lib/zip-read";

const path = process.argv[2] ?? "other/question-import-template.docx";
const bytes = readFileSync(path);
const doc = readZipText(bytes, "word/document.xml")!;

console.log("=== XML DECLARATION + ROOT (first 1200 chars) ===");
console.log(doc.slice(0, 1200));

console.log("\n\n=== STRUCTURAL ELEMENTS PRESENT ===");
for (const tag of [
  "w:tbl",
  "w:tblGrid",
  "w:gridCol",
  "w:tblBorders",
  "w:tblW",
  "w:tcBorders",
  "w:shd",
  "w:sectPr",
  "w:body",
  "w:color",
  "w:i/",
  "w:b/",
  "w:sz",
  "w:rFonts",
  "w:pStyle",
]) {
  const n = (doc.match(new RegExp(`<${tag.replace("/", "\\/")}[ />]`, "g")) ?? []).length;
  console.log(`  ${String(n).padStart(4)}  ${tag}`);
}

console.log("\n=== FIRST TABLE, RAW (first 3000 chars) ===");
const tStart = doc.indexOf("<w:tbl>");
console.log(doc.slice(tStart, tStart + 3000));

console.log("\n\n=== [Content_Types].xml ===");
console.log(readZipText(bytes, "[Content_Types].xml"));
console.log("\n=== _rels/.rels ===");
console.log(readZipText(bytes, "_rels/.rels"));
