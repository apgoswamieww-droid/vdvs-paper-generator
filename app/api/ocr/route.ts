// ============================================================
//  POST /api/ocr — OCR extracted text from an uploaded/pasted
//  image (English + Gujarati). Uses tesseract.js client package,
//  run server-side so the heavy WASM stays out of the browser.
//
//  Body:  { image: "<base64>" }   (data-URL header optional)
//  Reply: { text: string } | { error: string }
//
//  Language data ships in ./tessdata (traced into the deployment) so
//  requests never wait on a CDN download; TESSERACT_LANG_PATH overrides
//  the directory, and tesseract.js's CDN is the fallback when the files
//  are missing.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createWorker, OEM, PSM } from "tesseract.js";

export const runtime = "nodejs";
// Vercel replies 504 FUNCTION_INVOCATION_TIMEOUT once this elapses.
export const maxDuration = 60;

const LANGS = ["eng", "guj"];
// Vercel caps request bodies at ~4.5 MB (base64 inflates raw bytes by 4/3).
const MAX_BASE64 = 4_400_000;
// Bail with JSON a few seconds before the platform kills the function.
const DEADLINE_MS = 55_000;

class OcrTimeoutError extends Error {
  constructor() {
    super("OCR exceeded its time budget");
    this.name = "OcrTimeoutError";
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

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new OcrTimeoutError()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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

  // Held in an object so the worker created inside the deadline closure is
  // still terminatable from `finally`.
  const session: { worker: Awaited<ReturnType<typeof createWorker>> | null } = {
    worker: null,
  };
  try {
    const options: Partial<import("tesseract.js").WorkerOptions> = {};
    if (LANG_PATH) {
      options.langPath = LANG_PATH;
      // Server filesystems (Vercel) are read-only outside /tmp — skip caching.
      options.cacheMethod = "none";
    }

    const text = await withDeadline(
      (async () => {
        session.worker = await createWorker(LANGS, OEM.LSTM_ONLY, options);
        await session.worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });

        const {
          data: { text },
        } = await session.worker.recognize(buffer);
        return text ?? "";
      })(),
      DEADLINE_MS
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
      console.error("[/api/ocr] exceeded deadline");
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
  } finally {
    try {
      await session.worker?.terminate();
    } catch {
      /* ignore teardown errors */
    }
  }
}
