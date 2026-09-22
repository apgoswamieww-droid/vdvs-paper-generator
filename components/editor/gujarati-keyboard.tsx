"use client";

// ============================================================
//  GujaratiKeyboard — virtual keyboard + transliteration helper.
//  - Letters tab: tap a Gujarati character to insert it at the caret
//  - Transliterate tab: type English ("namaste") and insert Gujarati
// ============================================================

import { useState } from "react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GUJARATI_KEYS, transliterateWord } from "./gujarati";

export function GujaratiKeyboard({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
}) {
  const [tab, setTab] = useState<"keys" | "trans">("keys");
  const [roman, setRoman] = useState("");
  const live = transliterateWord(roman);

  function handleTransInsert() {
    if (!live) return;
    onInsert(live);
    setRoman("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setRoman("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="w-full max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gujarati input</DialogTitle>
          <DialogDescription>
            Tap a letter or type English to transliterate. Font is Noto Serif
            Gujarati — stored as Unicode, no conversion needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1">
          {(
            [
              { id: "keys", label: "Keyboard" },
              { id: "trans", label: "Transliterate" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "keys" ? (
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {GUJARATI_KEYS.map((group) => (
              <div key={group.name} className="space-y-1.5">
                <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                  {group.name}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.keys.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onInsert(ch)}
                      className="rounded-md border border-zinc-800 bg-zinc-950 px-0 py-1.5 font-serif text-base text-zinc-100 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/10"
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Type English and watch it turn into Gujarati
              </label>
              <input
                value={roman}
                onChange={(e) => setRoman(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTransInsert();
                  }
                }}
                placeholder="namaste, svalpad uttar, prakaran"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div className="min-h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-serif text-base text-indigo-100">
              {live || <span className="text-sm text-zinc-600">Preview…</span>}
            </div>
            <Button
              type="button"
              disabled={!live}
              onClick={handleTransInsert}
              className="w-full"
            >
              Insert Gujarati
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}