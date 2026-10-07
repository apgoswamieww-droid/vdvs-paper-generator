// ============================================================
//  Simulate the Vercel function bundle for /api/ocr.
//
//  Vercel ships only the files listed in the route's .nft.json
//  trace. This script stages exactly those files (including
//  Turbopack's directory entries) into .ocr-sim/, then runs
//  tesseract.js from that staging tree alone — the runner sits
//  under .ocr-sim/.next/server/ just like the compiled chunk,
//  so bare requires (tesseract.js-<hash>) and the worker's
//  node_modules walk-up resolve exactly as in the lambda.
//  If OCR succeeds here, it works on Vercel.
//
//  Run: node scratch/lambda-sim.mjs
// ============================================================
import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync, readdirSync, statSync, cpSync, lstatSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
// Set SIM_STRICT=0 to also dereference Turbopack's symlinked package dirs.
const STRICT = process.env.SIM_STRICT !== "0";
const NFT = path.join(ROOT, ".next/server/app/api/ocr/route.js.nft.json");
const nft = JSON.parse(readFileSync(NFT, "utf8"));

// Entries are relative to the .nft.json directory — verify with the
// tessdata entry (it only exists at its real location).
const nftDir = path.dirname(NFT);
const probe = nft.files.find((f) => f.includes("traineddata")) ?? nft.files[0];
let base = null;
for (let up = 0; up <= 8; up++) {
  const dir = up === 0 ? nftDir : path.resolve(nftDir, Array(up).fill("..").join("/"));
  if (probe && existsSync(path.resolve(dir, probe))) {
    base = dir;
    break;
  }
}
if (!base) {
  console.error("SIM: could not resolve trace base directory");
  process.exit(2);
}
console.log("trace base =", path.relative(ROOT, base) || ".");

// Stage exactly the traced files/dirs, preserving repo-relative layout.
// IMPORTANT: the staging dir must live OUTSIDE the repo — otherwise the
// worker's node_modules walk-up escapes into the real node_modules and
// the test passes for the wrong reason. Vercel's lambda root is
// /var/task, whose ancestors have no node_modules.
const SIM = path.join(os.tmpdir(), "vdvs-ocr-sim");
rmSync(SIM, { recursive: true, force: true });
let copied = 0;
const missing = [];
for (const f of nft.files) {
  const src = path.resolve(base, f);
  if (!existsSync(src)) {
    missing.push(f);
    continue;
  }
  // Strict mode: ship ONLY the files the trace lists. Turbopack emits a
  // symlinked dir entry for external packages (node_modules/tesseract.js-<hash>),
  // and dereferencing it would smuggle the ENTIRE package into the staging
  // tree — which is exactly how a broken trace hides behind a green sim.
  // Vercel copies the trace, so skip it and let the listed files stand alone.
  if (STRICT && (lstatSync(src).isSymbolicLink() || statSync(src).isDirectory())) {
    missing.push(`(dir/symlink skipped) ${f}`);
    continue;
  }
  const rel = path.relative(ROOT, src);
  if (rel.startsWith("..")) {
    missing.push(`(outside repo) ${f}`);
    continue;
  }
  const dest = path.join(SIM, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (statSync(src).isDirectory()) {
    // Turbopack external dirs may be symlinks — dereference so the
    // staged tree contains real files (Vercel runs on Linux where
    // nft follows symlinks too).
    cpSync(src, dest, { recursive: true, dereference: true });
  } else {
    copyFileSync(src, dest);
  }
  copied++;
}
console.log(`staged ${copied} entries; not-found: ${missing.length}`);
if (missing.length) console.log(missing.slice(0, 10).join("\n"));

// Runner lives under .next/server (same position as the compiled chunk) and
// requires the same Turbopack external id the chunk uses. In strict mode that
// junction isn't shipped, so resolve plain "tesseract.js" from the traced
// node_modules instead — same package, same entry, just a different specifier.
const hashDir = STRICT ? null : readdirSync(path.join(SIM, ".next/node_modules")).find((d) =>
  d.startsWith("tesseract.js-")
);
if (!STRICT) {
  if (!hashDir) {
    console.error("SIM: staged tree has no .next/node_modules/tesseract.js-<hash>");
    process.exit(2);
  }
  console.log("tesseract external id =", hashDir);
} else {
  console.log("STRICT mode: requiring bare tesseract.js from traced node_modules");
}
const spec = STRICT ? "tesseract.js" : hashDir;

const runner = path.join(SIM, ".next/server/sim-runner.cjs");
writeFileSync(
  runner,
  `const path = require("path");
const fs = require("fs");
const { createWorker, OEM, PSM } = require(${JSON.stringify(spec)});
(async () => {
  // Same options as app/api/ocr/route.ts (cwd = .ocr-sim, the lambda root).
  const options = { langPath: path.join(process.cwd(), "tessdata"), cacheMethod: "none" };
  const worker = await createWorker(["eng", "guj"], OEM.LSTM_ONLY, options);
  await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const buf = fs.readFileSync(process.argv[2]);
  const { data } = await worker.recognize(buf);
  await worker.terminate();
  const text = (data.text || "").trim();
  console.log("OCR_OK text_len=" + text.length);
  console.log("first_lines:", text.split("\\n").slice(0, 3).join(" | "));
})().catch((e) => {
  console.error("OCR_FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
`
);

const image = path.resolve("scratch/ocr-test.png");
const res = spawnSync(process.execPath, [runner, image], { cwd: SIM, encoding: "utf8" });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
console.log("SIM_EXIT=" + res.status);
process.exit(res.status === 0 ? 0 : 1);
