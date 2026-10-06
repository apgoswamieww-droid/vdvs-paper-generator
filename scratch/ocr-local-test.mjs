// Verifies tesseract.js can OCR using the bundled ./tessdata directory
// (same options as app/api/ocr/route.ts) without any CDN download.
import { createWorker, OEM, PSM } from "tesseract.js";

const started = Date.now();
const worker = await createWorker(["eng", "guj"], OEM.LSTM_ONLY, {
  langPath: "./tessdata",
  cacheMethod: "none",
});
const boot = Date.now() - started;

await worker.setParameters({
  preserve_interword_spaces: "1",
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
});

const recognizeStart = Date.now();
const {
  data: { text },
} = await worker.recognize("scratch/ocr-test.png");
const recognize = Date.now() - recognizeStart;
await worker.terminate();

const cleaned = text
  .replace(/\u0000/g, "")
  .split("\n")
  .map((l) => l.replace(/[ \t]+/g, " ").trim())
  .filter(Boolean)
  .join("\n")
  .trim();

console.log(
  JSON.stringify({ bootMs: boot, recognizeMs: recognize, text: cleaned }, null, 2)
);
