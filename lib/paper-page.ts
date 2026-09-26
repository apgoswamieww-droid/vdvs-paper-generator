// ============================================================
//  Paper Page Setup — shared types, defaults & helpers
//
//  Single source of truth for how a paper is laid out on a
//  physical page. Consumed by the PDF engine (Puppeteer) and the
//  Word import/export engines so a paper looks the same in both.
// ============================================================

export type PageSize = "A4" | "A3" | "Letter" | "Legal";
export type PageOrientation = "portrait" | "landscape";

export type PageMargins = {
  top: number; // mm
  right: number; // mm
  bottom: number; // mm
  left: number; // mm
};

export type PageConfig = {
  size: PageSize;
  orientation: PageOrientation;
  margins: PageMargins;
  fontScale: number; // multiplier on the 11pt base size
  lineHeight: number;
  showPageNumbers: boolean;
  answerKeyOnNewPage: boolean;
};

export const PAGE_SIZES: {
  value: PageSize;
  label: string;
  widthMm: number;
  heightMm: number;
}[] = [
  { value: "A4", label: "A4 — 210 × 297 mm", widthMm: 210, heightMm: 297 },
  { value: "A3", label: "A3 — 297 × 420 mm", widthMm: 297, heightMm: 420 },
  { value: "Letter", label: "Letter — 8.5 × 11 in", widthMm: 215.9, heightMm: 279.4 },
  { value: "Legal", label: "Legal — 8.5 × 14 in", widthMm: 215.9, heightMm: 355.6 },
];

export const PAGE_ORIENTATIONS: { value: PageOrientation; label: string }[] = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

/** Authoring limits. Kept in sync with `pageConfigSchema` in lib/validations.ts. */
export const PAGE_LIMITS = {
  marginMin: 5,
  marginMax: 40,
  fontScaleMin: 0.8,
  fontScaleMax: 1.4,
  lineHeightMin: 1.1,
  lineHeightMax: 2.2,
} as const;

export const BASE_FONT_PT = 11;

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 15, right: 12, bottom: 15, left: 12 },
  fontScale: 1,
  lineHeight: 1.5,
  showPageNumbers: true,
  answerKeyOnNewPage: false,
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Coerces a value read from the `pageConfig` JSON column into a complete,
 * in-range PageConfig. Anything missing or malformed falls back to the default,
 * so older papers (and hand-edited JSON) can never break rendering.
 */
export function normalizePageConfig(raw: unknown): PageConfig {
  const d = DEFAULT_PAGE_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d, margins: { ...d.margins } };

  const o = raw as Record<string, unknown>;
  const margins = (o.margins ?? {}) as Record<string, unknown>;

  const size = PAGE_SIZES.some((s) => s.value === o.size) ? (o.size as PageSize) : d.size;
  const orientation =
    o.orientation === "landscape" || o.orientation === "portrait" ? o.orientation : d.orientation;

  return {
    size,
    orientation,
    margins: {
      top: clamp(num(margins.top, d.margins.top), PAGE_LIMITS.marginMin, PAGE_LIMITS.marginMax),
      right: clamp(num(margins.right, d.margins.right), PAGE_LIMITS.marginMin, PAGE_LIMITS.marginMax),
      bottom: clamp(num(margins.bottom, d.margins.bottom), PAGE_LIMITS.marginMin, PAGE_LIMITS.marginMax),
      left: clamp(num(margins.left, d.margins.left), PAGE_LIMITS.marginMin, PAGE_LIMITS.marginMax),
    },
    fontScale: clamp(num(o.fontScale, d.fontScale), PAGE_LIMITS.fontScaleMin, PAGE_LIMITS.fontScaleMax),
    lineHeight: clamp(num(o.lineHeight, d.lineHeight), PAGE_LIMITS.lineHeightMin, PAGE_LIMITS.lineHeightMax),
    showPageNumbers: typeof o.showPageNumbers === "boolean" ? o.showPageNumbers : d.showPageNumbers,
    answerKeyOnNewPage:
      typeof o.answerKeyOnNewPage === "boolean" ? o.answerKeyOnNewPage : d.answerKeyOnNewPage,
  };
}

/** Puppeteer's `format` option accepts exactly these names. */
export function pdfFormat(size: PageSize): PageSize {
  return size;
}

export function isLandscape(config: PageConfig): boolean {
  return config.orientation === "landscape";
}

/** Physical size with the orientation applied — used by the Word engine. */
export function pageDimensions(config: PageConfig): { widthMm: number; heightMm: number } {
  const base = PAGE_SIZES.find((s) => s.value === config.size) ?? PAGE_SIZES[0];
  return config.orientation === "landscape"
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : { widthMm: base.widthMm, heightMm: base.heightMm };
}

export function mmToTwips(mm: number): number {
  // 1 inch = 1440 twips = 25.4 mm
  return Math.round((mm / 25.4) * 1440);
}

export const MM_TO_PT = 72 / 25.4;

/**
 * Body/`.page` CSS for the shared HTML renderer (PDF export + print preview).
 * Page margins themselves are applied by Puppeteer's `margin` option, so the
 * `.page` wrapper carries no padding of its own — only the content width.
 */
export function pageSetupCss(config: PageConfig): string {
  const { widthMm } = pageDimensions(config);
  return `
    body {
      font-size: ${(BASE_FONT_PT * config.fontScale).toFixed(2)}pt;
      line-height: ${config.lineHeight.toFixed(2)};
    }

    .page {
      padding: 0;
      max-width: ${widthMm.toFixed(2)}mm;
      margin: 0 auto;
      position: relative;
    }
  `;
}
