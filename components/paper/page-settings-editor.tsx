"use client";

// ============================================================
//  Page Settings Editor — page size / orientation / margins /
//  density / footer / answer-key placement.
//
//  Shared by the paper builder, the paper detail page and the
//  pre-export dialog, so "custom page settings" behave the same
//  everywhere a paper is generated.
// ============================================================

import { cn } from "cn";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_PAGE_CONFIG,
  PAGE_LIMITS,
  PAGE_ORIENTATIONS,
  PAGE_SIZES,
  pageDimensions,
  type PageConfig,
  type PageMargins,
  type PageOrientation,
  type PageSize,
} from "@/lib/paper-page";

type Props = {
  value: PageConfig;
  onChange: (config: PageConfig) => void;
  /** Hides the heading + reset button — used inside the export dialog. */
  compact?: boolean;
  className?: string;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function PageSettingsEditor({ value, onChange, compact, className }: Props) {
  function patch(next: Partial<PageConfig>) {
    onChange({ ...value, ...next });
  }

  function patchMargin(side: keyof PageMargins, raw: string) {
    const n = clamp(Number(raw), PAGE_LIMITS.marginMin, PAGE_LIMITS.marginMax);
    onChange({ ...value, margins: { ...value.margins, [side]: n } });
  }

  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_PAGE_CONFIG);

  return (
    <div className={cn("space-y-4", className)}>
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Page layout
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1 text-muted-foreground"
            disabled={isDefault}
            onClick={() => onChange({ ...DEFAULT_PAGE_CONFIG, margins: { ...DEFAULT_PAGE_CONFIG.margins } })}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
      )}

      <PageThumbnail config={value} />

      {/* Size + orientation */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Page size</Label>
          <Select value={value.size} onValueChange={(v) => v && patch({ size: v as PageSize })}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Orientation</Label>
          <Select
            value={value.orientation}
            onValueChange={(v) => v && patch({ orientation: v as PageOrientation })}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_ORIENTATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Margins */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Margins (mm)</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <div key={side} className="space-y-1">
              <Input
                type="number"
                min={PAGE_LIMITS.marginMin}
                max={PAGE_LIMITS.marginMax}
                value={value.margins[side]}
                onChange={(e) => patchMargin(side, e.target.value)}
                className="h-8 text-sm"
                aria-label={`${side} margin in millimetres`}
              />
              <p className="text-center text-[10px] capitalize text-muted-foreground">{side}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Font size ×</Label>
          <Input
            type="number"
            min={PAGE_LIMITS.fontScaleMin}
            max={PAGE_LIMITS.fontScaleMax}
            step={0.05}
            value={value.fontScale}
            onChange={(e) =>
              patch({ fontScale: clamp(Number(e.target.value), PAGE_LIMITS.fontScaleMin, PAGE_LIMITS.fontScaleMax) })
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Line spacing</Label>
          <Input
            type="number"
            min={PAGE_LIMITS.lineHeightMin}
            max={PAGE_LIMITS.lineHeightMax}
            step={0.05}
            value={value.lineHeight}
            onChange={(e) =>
              patch({ lineHeight: clamp(Number(e.target.value), PAGE_LIMITS.lineHeightMin, PAGE_LIMITS.lineHeightMax) })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/40 p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Page numbers in footer
            <span className="ml-1 opacity-60">(Page X of Y)</span>
          </span>
          <Switch
            checked={value.showPageNumbers}
            onCheckedChange={(checked) => patch({ showPageNumbers: Boolean(checked) })}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Answer key on a new page</span>
          <Switch
            checked={value.answerKeyOnNewPage}
            onCheckedChange={(checked) => patch({ answerKeyOnNewPage: Boolean(checked) })}
          />
        </label>
      </div>
    </div>
  );
}

// ============================================================
//  Thumbnail — shows the real aspect ratio with margin guides
// ============================================================

function PageThumbnail({ config }: { config: PageConfig }) {
  const { widthMm, heightMm } = pageDimensions(config);
  const insets = {
    top: `${(config.margins.top / heightMm) * 100}%`,
    right: `${(config.margins.right / widthMm) * 100}%`,
    bottom: `${(config.margins.bottom / heightMm) * 100}%`,
    left: `${(config.margins.left / widthMm) * 100}%`,
  };
  // Line width hint: more lines when the page is denser.
  const lines = Math.max(4, Math.round(11 / (config.lineHeight * config.fontScale)));

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
      <div
        className="relative shrink-0 rounded-sm border border-slate-300 bg-white shadow-sm"
        style={{ height: 104, aspectRatio: `${widthMm} / ${heightMm}` }}
      >
        <div
          className="absolute flex flex-col justify-start gap-[3px] overflow-hidden p-[3px]"
          style={{ top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }}
        >
          <div className="h-[5px] w-3/5 rounded-[1px] bg-slate-800" />
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="h-[2px] rounded-[1px] bg-slate-300"
              style={{ width: `${72 + ((i * 13) % 28)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="min-w-0 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-700">
          {config.size} · {config.orientation}
        </p>
        <p>
          {widthMm.toFixed(0)} × {heightMm.toFixed(0)} mm
        </p>
        <p>
          Margins {config.margins.top}/{config.margins.right}/{config.margins.bottom}/
          {config.margins.left} mm
        </p>
        <p>
          Text ×{config.fontScale} · spacing {config.lineHeight}
        </p>
      </div>
    </div>
  );
}
