import { writeFileSync } from "node:fs";
import { readZipText } from "@/lib/zip-read";
import { buildQuestionTemplateDocx } from "@/lib/docx-table-template";
import { parseQuestionDocx } from "@/lib/docx-table-parser";

const bytes = buildQuestionTemplateDocx(
  {
    schoolId: "sch_1",
    classLevelId: "cl_10",
    subjectId: "sub_gu",
    chapterId: "ch_1",
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

const out = "other/question-import-template-GU.docx";
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)\n`);

const xml = readZipText(bytes, "word/document.xml")!;

const STRINGS = [
  "How to fill this template",
  "The grey labels are fixed",
  "Before you upload",
  "આ ટેમ્પ્લેટ કેવી રીતે ભરવું",
  "કડા લેબલ સ્થિર છે",
  "ગણિત",
  "ગુજરાતી",
  "અપલોડ કરતાં પહેલાં",
  "પ્રશ્ન 'Question' બોક્સમાં લખો",
  "Marks માં દાશાંશ પણ લખી શકો",
  "ગુજરાતી કોઈપણ ઇનપુટ મેથડથી સામાન્ય રીતે લખો",
  "ઉદાહરણ:",
  "ફાઇલમાં જ રાખો",
  "ફક્ત Question ભરેલા બોક્સ જ આયાત થાય છે",
];

console.log("=== instruction strings present ===");
let missing = 0;
for (const s of STRINGS) {
  const ok = xml.includes(s);
  if (!ok) missing++;
  console.log(`  ${ok ? "OK  " : "MISS"}  ${s}`);
}

console.log("\n=== font handling ===");
console.log(`  w:cs="Nirmala UI" runs : ${(xml.match(/w:cs="Nirmala UI"/g) ?? []).length}`);
console.log(`  w:rFonts total          : ${(xml.match(/<w:rFonts/g) ?? []).length}`);
console.log(`  page breaks             : ${(xml.match(/w:type="page"/g) ?? []).length}`);

// Mojibake check: every Gujarati codepoint must survive as real UTF-8.
const gujaratiChars = (xml.match(/[઀-૿]/g) ?? []).length;
const replacement = (xml.match(/\uFFFD/g) ?? []).length;
console.log(`\n=== encoding ===`);
console.log(`  Gujarati codepoints : ${gujaratiChars}`);
console.log(`  U+FFFD replacements : ${replacement} ${replacement === 0 ? "(no mojibake)" : "<-- MOJIBAKE!"}`);

const { drafts, errors, blankBoxes } = parseQuestionDocx(bytes);
console.log(`\n=== parser still clean ===`);
console.log(`  drafts=${drafts.length} errors=${errors.length} blankBoxes=${blankBoxes} ${drafts.length === 0 && errors.length === 0 ? "OK" : "<-- INSTRUCTIONS LEAKED INTO PARSE"}`);
console.log(`\nmissing: ${missing}`);
