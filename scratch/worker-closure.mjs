// Walk the require() closure of the tesseract.js worker thread entry and
// report every file that outputFileTracing did NOT put in the /api/ocr trace.
// Those are exactly the files missing on Vercel.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const NFT = ".next/server/app/api/ocr/route.js.nft.json";
const base = path.resolve(path.dirname(NFT));
const traced = new Set(
  JSON.parse(fs.readFileSync(NFT, "utf8")).files.map((p) =>
    path.resolve(base, p).split(path.sep).join("/")
  )
);

const ENTRY = path.resolve("node_modules/tesseract.js/src/worker-script/node/index.js");
const require_ = createRequire(ENTRY);

const seen = new Set();
const missing = [];

function walk(fromFile, spec) {
  let resolved;
  if (spec.startsWith(".")) {
    resolved = path.resolve(path.dirname(fromFile), spec);
  } else {
    try {
      resolved = require_.resolve(spec, { paths: [path.dirname(fromFile)] });
    } catch {
      missing.push(`UNRESOLVED ${spec}  (required by ${path.relative(process.cwd(), fromFile)})`);
      return;
    }
  }
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    resolved = path.join(resolved, "index.js");
  }
  const key = resolved.split(path.sep).join("/");
  if (seen.has(key) || !key.endsWith(".js")) return;
  seen.add(key);
  if (!traced.has(key)) missing.push(`NOT TRACED  ${key}`);

  const src = fs.readFileSync(key, "utf8");
  const re = /require\((?:'([^']+)'|"([^"]+)")\)/g;
  let m;
  while ((m = re.exec(src))) walk(key, m[1] ?? m[2]);
}

walk(ENTRY, ".");

console.log(`worker closure files: ${seen.size}`);
console.log(`missing from trace:   ${missing.length}`);
console.log(missing.join("\n") || "(none — closure is fully traced)");