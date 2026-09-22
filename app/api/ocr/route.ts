// ============================================================
//  POST /api/ocr — OCR extracted text from an uploaded/pasted
//  image (English + Gujarati). Uses tesseract.js client package,
//  run server-side so the heavy WASM stays out of the browser.
//
//  Body:  { image: "<base64>" }   (data-URL header optional)
//  Reply: { text: string } | { error: string }
//
//  Optional env: TESSERACT_LANG_PATH to point at a lang data dir.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createWorker, OEM, PSM } from "tesseract.js";

export const runtime = "nodejs";

const MAX_BASE64 = 20_000_000; // ~15 MB raw

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
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) {
    return NextResponse.json({ error: "Could not decode image" }, { status: 400 });
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    const options: Partial<import("tesseract.js").WorkerOptions> = {};
    const langPath = process.env.TESSERACT_LANG_PATH;
    if (langPath) options.langPath = langPath;

    worker = await createWorker(["eng", "guj"], OEM.LSTM_ONLY, options);
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    const {
      data: { text },
    } = await worker.recognize(buffer);

    const cleaned = (text ?? "")
      .replace(/\u0000/g, "")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    return NextResponse.json({ text: cleaned });
  } catch (err) {
    console.error("[/api/ocr] failed", err);
    return NextResponse.json(
      { error: "OCR failed. Please try a clearer image." },
      { status: 500 }
    );
  } finally {
    try {
      await worker?.terminate();
    } catch {
      /* ignore teardown errors */
    }
  }
}