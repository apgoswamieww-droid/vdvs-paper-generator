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
      const base64 = image.startsWith("data:")
        ? (image.split(",")[1] ?? "")
        : image;
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null;
      if (!res.ok || !json || typeof json.text !== "string") {
        setError(json?.error ?? "OCR failed. Try a clearer image.");
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
              Reading text… (first run downloads language data)
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