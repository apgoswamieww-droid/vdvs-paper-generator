// Inspect the /api/ocr function trace for tesseract files.
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync(".next/server/app/api/ocr/route.js.nft.json", "utf8"));
const l = j.files.map((p) => p.replace(/^(\.\.\/)+/, ""));
const tess = l.filter((p) => /tesseract/i.test(p));
console.log("total traced:", l.length);
console.log("--- worker-script files ---");
console.log(tess.filter((p) => /worker-script/.test(p)).join("\n") || "(NONE)");
console.log("--- tesseract.js-core files ---");
console.log(tess.filter((p) => /tesseract\.js-core/.test(p)).join("\n") || "(NONE)");
console.log("--- wasm files of any kind ---");
console.log(l.filter((p) => /\.wasm/.test(p)).join("\n") || "(NONE)");
console.log("--- tessdata ---");
console.log(l.filter((p) => /traineddata/.test(p)).join("\n") || "(NONE)");
console.log("--- runtime packages required by the worker ---");
for (const n of [
  "bmp-js",
  "wasm-feature-detect",
  "tesseract.js-core",
  "regenerator-runtime",
  "is-url",
]) {
  console.log(n.padEnd(26), l.some((p) => p.includes(n)) ? "OK" : "MISSING");
}
