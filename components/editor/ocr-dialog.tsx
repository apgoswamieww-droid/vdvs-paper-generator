"use client";

// ============================================================
//  OCRDialog — paste/upload a screenshot or image and extract
//  English + Gujarati text. Calls POST /api/ocr (tesseract.js)
//  and hands the cleaned text back to the editor via onInsert.
// ============================================================

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, ScanText, Upload } from "lucide-react";

/** Cap the pixel count sent to the server — OCR time scales with pixels. */
const MAX_PIXELS = 4_000_000;
/** Vercel request bodies cap at ~4.5 MB; stay well under as base64. */
const MAX_UPLOAD_CHARS = 3_500_000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

function stripDataUrl(value: string): string {
  if (!value.startsWith("data:")) return value;
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : "";
}

/**
 * Keep the upload inside Vercel's body limit and keep recognition inside the
 * function's time budget: images over the pixel/size caps are scaled down and
 * re-encoded to JPEG (white background). Everything else is sent untouched so
 * screenshots keep their original quality. Falls back to the original image if
 * the browser cannot decode it.
 */
async function toUploadBase64(dataUrl: string): Promise<string> {
  const original = stripDataUrl(dataUrl);
  try {
    const img = await loadImage(dataUrl);
    const pixels = Math.max(1, img.naturalWidth * img.naturalHeight);
    const oversized = pixels > MAX_PIXELS;
    if (!oversized && original.length <= MAX_UPLOAD_CHARS) return original;

    const scale = oversized ? Math.min(1, Math.sqrt(MAX_PIXELS / pixels)) : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let encoded = canvas.toDataURL("image/jpeg", 0.85);
    if (stripDataUrl(encoded).length > MAX_UPLOAD_CHARS) {
      encoded = canvas.toDataURL("image/jpeg", 0.6);
    }
    return stripDataUrl(encoded);
  } catch {
    return original;
  }
}

function ocrErrorMessage(status: number, serverError?: string): string {
  if (serverError) return serverError;
  if (status === 413) return "Image too large. Try a smaller screenshot.";
  if (status === 502 || status === 503 || status === 504) {
    return "OCR took too long. Try a smaller screenshot.";
  }
  return "OCR failed. Try a clearer image.";
}

export function OCRDialog({
  open,
  onOpenChange,
  onInsert,
  initialImage = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
  /** Image (data URL) pasted directly into the editor — seeds this dialog. */
  initialImage?: string | null;
}) {
  const [image, setImage] = useState<string | null>(initialImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [extracted, setExtracted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function resetDialog() {
    setImage(null);
    setError(null);
    setDone(false);
    setExtracted("");
  }

  async function handleFile(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(typeof reader.result === "string" ? reader.result : null);
      setError(null);
      setDone(false);
      setExtracted("");
    };
    reader.readAsDataURL(file);
  }

  async function extract() {
    if (!image || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const base64 = await toUploadBase64(image);
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !json || typeof json.text !== "string") {
        setError(ocrErrorMessage(res.status, json?.error));
        return;
      }
      onInsert(json.text);
      setExtracted(json.text);
      setDone(true);
      // keep the original image previewed until the dialog is closed
    } catch {
      setError("OCR failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetDialog();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="w-full max-w-md sm:max-w-md"
        onPaste={(e) => {
          const item = Array.from(e.clipboardData?.items ?? []).find((it) =>
            it.type.startsWith("image/")
          );
          if (item) handleFile(item.getAsFile());
        }}
      >
        <DialogHeader>
          <DialogTitle>Insert from image (OCR)</DialogTitle>
          <DialogDescription>
            Paste (Ctrl+V) a screenshot into the question, or upload one here.
            The original image stays previewed until you close — closing
            discards it.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {!image && !busy && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-700 p-6 text-center">
            <ScanText className="size-6 text-zinc-500" />
            <p className="text-xs text-muted-foreground">
              Paste a screenshot anywhere on this dialog, or upload a file.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-3.5" /> Choose image
            </Button>
          </div>
        )}

        {image && !busy && (
          <div className="space-y-2">
            <img
              src={image}
              alt="Original image"
              className="max-h-48 w-full rounded-lg border border-zinc-800 object-contain"
            />
            {done ? (
              <p className="text-[11px] text-zinc-600">
                Original screenshot kept for reference — closing discards it.
              </p>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setImage(null)}
                >
                  Remove
                </Button>
                <Button type="button" onClick={extract}>
                  Extract text
                </Button>
              </div>
            )}
          </div>
        )}

        {busy && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-zinc-800 p-6 text-center">
            <LoaderCircle className="size-5 animate-spin text-indigo-400" />
            <p className="text-xs text-muted-foreground">
              Reading text… this can take a few seconds.
            </p>
          </div>
        )}

        {done && extracted && (
          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              Text extracted and inserted at the cursor. Check it against the
              image above — close to discard the preview.
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
              <p className="mb-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                Extracted text
              </p>
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-zinc-200">
                {extracted}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}