// ============================================================
//  POST /api/ocr — OCR extracted text from an uploaded/pasted
//  image (English + Gujarati). Uses tesseract.js, run server-side
//  so the heavy WASM stays out of the browser.
//
//  Body:  { image: "<base64>" }   (data-URL header optional)
//  Reply: { text: string } | { error: string }
//
//  Vercel behaviour this file is built around:
//  - ./tessdata ships inside the function bundle (see
//    outputFileTracingIncludes in next.config.ts) so requests never
//    wait on a CDN download; TESSERACT_LANG_PATH overrides the dir.
//  - tesseract.js NEVER settles createWorker() when its internal
//    init chain fails (the error is swallowed), so every await is
//    raced against a deadline — otherwise a broken/slow worker
//    turns into an opaque platform 504 after a minute of silence.
//  - The worker is cached on globalThis and reused across warm
//    invocations. Building one loads ~4 MB of traineddata + compiles
//    the WASM, which alone can burn most of a function's time budget
//    when paid on every single request.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import type { Worker as ThreadWorker } from "node:worker_threads";
import { NextRequest, NextResponse } from "next/server";
import { createWorker, OEM, PSM } from "tesseract.js";

export const runtime = "nodejs";
// Vercel replies 504 FUNCTION_INVOCATION_TIMEOUT once this elapses.
export const maxDuration = 60;

const LANGS = ["eng", "guj"];
// Vercel caps request bodies at ~4.5 MB (base64 inflates raw bytes by 4/3).
const MAX_BASE64 = 4_400_000;
// Whole-request budget: answer (or bail with JSON) before the platform 504s.
const REQUEST_DEADLINE_MS = 55_000;
// createWorker() hangs (never rejects) when init fails — fail fast instead.
const INIT_DEADLINE_MS = 20_000;
// A stuck recognize() can only be escaped by killing the worker thread.
const RECOGNIZE_DEADLINE_MS = 30_000;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;
type DeadlineStage = "init" | "recognize" | "request";

class OcrTimeoutError extends Error {
  readonly stage: DeadlineStage;
  constructor(stage: DeadlineStage) {
    super(`OCR exceeded its ${stage} time budget`);
    this.name = "OcrTimeoutError";
    this.stage = stage;
  }
}

function resolveLangPath(): string | null {
  const candidates = [
    process.env.TESSERACT_LANG_PATH,
    path.join(process.cwd(), "tessdata"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    const hasAll = LANGS.every((lang) =>
      fs.existsSync(path.join(dir, `${lang}.traineddata.gz`))
    );
    if (hasAll) return dir;
  }
  return null;
}

const LANG_PATH = resolveLangPath();

async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  stage: DeadlineStage
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new OcrTimeoutError(stage)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
//  Worker lifecycle — one worker per warm function instance.
//
//  tesseract.js's createWorker() resolves only after load →
//  loadLanguage → initialize all succeed; any failure in that
//  chain is swallowed (.catch(() => {})) and the promise stays
//  pending forever. So: attach our own handlers, keep a deadline
//  on every await, and recycle the worker whenever the thread
//  dies or a job wedges.
// ------------------------------------------------------------
interface OcrState {
  init: Promise<OcrWorker> | null;
  worker: OcrWorker | null;
  queue: Promise<unknown>;
}

const globals = globalThis as typeof globalThis & { __ocrState?: OcrState };
const state: OcrState = (globals.__ocrState ??= {
  init: null,
  worker: null,
  queue: Promise.resolve(),
});

function spawnWorker(): Promise<OcrWorker> {
  const options: Partial<import("tesseract.js").WorkerOptions> = {
    // Lambda filesystems are read-only outside /tmp — never touch a cache.
    cacheMethod: "none",
    // Without an errorHandler tesseract.js re-throws job failures inside
    // its message handler; an uncaught exception there kills the lambda.
    errorHandler: (err) => console.error("[/api/ocr] worker job failed", err),
  };
  if (LANG_PATH) {
    options.langPath = LANG_PATH;
  } else {
    console.error(
      "[/api/ocr] tessdata missing from deployment — falling back to CDN download"
    );
  }

  return createWorker(LANGS, OEM.LSTM_ONLY, options).then(async (worker) => {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    return worker;
  });
}

async function dropWorker(worker: OcrWorker): Promise<void> {
  if (state.worker === worker) {
    state.worker = null;
    state.init = null;
  }
  try {
    await worker.terminate();
  } catch {
    /* thread already dead */
  }
}

function watchWorker(worker: OcrWorker): void {
  const thread = (worker as unknown as { worker: ThreadWorker }).worker;
  thread.on("error", (err) => {
    console.error("[/api/ocr] worker thread error", err);
    void dropWorker(worker);
  });
  thread.on("exit", (code) => {
    if (state.worker === worker) {
      console.error(`[/api/ocr] worker thread exited unexpectedly (${code})`);
      void dropWorker(worker);
    }
  });
}

async function ensureWorker(): Promise<OcrWorker> {
  if (state.worker) return state.worker;

  if (!state.init) {
    const attempt = spawnWorker();
    state.init = attempt;
    attempt.then(
      (worker) => {
        if (state.init !== attempt) {
          // A reset happened while this worker was starting — don't leak it.
          void worker.terminate().catch(() => {});
          return;
        }
        state.worker = worker;
        watchWorker(worker);
      },
      (err) => {
        console.error("[/api/ocr] worker init failed", err);
        if (state.init === attempt) state.init = null;
      }
    );
  }

  // On deadline we keep state.init: if it eventually settles the next
  // request picks the worker up instead of starting a second one.
  return withDeadline(state.init, INIT_DEADLINE_MS, "init");
}

// Serializes recognize jobs: one worker thread = one job at a time.
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = state.queue.then(task, task);
  state.queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { image } = body as { image?: unknown };
  if (typeof image !== "string" || !image.length) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  let raw = image;
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    raw = comma >= 0 ? raw.slice(comma + 1) : "";
  }
  if (!raw.length) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (raw.length > MAX_BASE64) {
    return NextResponse.json(
      { error: "Image too large. Try a smaller screenshot." },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) {
    return NextResponse.json({ error: "Could not decode image" }, { status: 400 });
  }

  const t0 = Date.now();
  const cold = state.worker === null;
  try {
    const text = await withDeadline(
      enqueue(async () => {
        const worker = await ensureWorker();
        const initMs = Date.now() - t0;
        try {
          const {
            data: { text },
          } = await withDeadline(
            worker.recognize(buffer),
            RECOGNIZE_DEADLINE_MS,
            "recognize"
          );
          console.log(
            `[/api/ocr] ok cold=${cold} initMs=${initMs} ocrMs=${Date.now() - t0 - initMs} totalMs=${Date.now() - t0} chars=${raw.length}`
          );
          return text ?? "";
        } catch (err) {
          if (err instanceof OcrTimeoutError) {
            // The job is wedged; killing the thread is the only way out.
            await dropWorker(worker);
          }
          throw err;
        }
      }),
      REQUEST_DEADLINE_MS,
      "request"
    );

    const cleaned = text
      .replace(/\u0000/g, "")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    return NextResponse.json({ text: cleaned });
  } catch (err) {
    if (err instanceof OcrTimeoutError) {
      console.error(`[/api/ocr] ${err.stage} deadline exceeded`);
      if (err.stage === "init") {
        return NextResponse.json(
          { error: "OCR engine is still starting up. Please try again." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "OCR took too long. Try a smaller screenshot." },
        { status: 504 }
      );
    }
    console.error("[/api/ocr] failed", err);
    return NextResponse.json(
      { error: "OCR failed. Please try a clearer image." },
      { status: 500 }
    );
  }
}
