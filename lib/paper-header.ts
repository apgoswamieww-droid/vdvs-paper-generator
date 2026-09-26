// ============================================================
//  Paper Header — shared types, tokens, defaults & HTML renderer
//  Single source of truth for preview (React), PDF (HTML) and
//  Word (OOXML).
//
//  Layout model
//  ────────────
//  A header is an ordered list of ROWS. A row is either
//    • "cells"   — items laid out side by side (logo next to the
//                  school name, name beside the contact block…)
//                  each cell carrying its own width + alignment
//    • "divider" — a full-width horizontal rule
//
//  Older papers stored a flat list of full-width items; those are
//  still read through normalizeHeaderConfig() and upgraded in place.
// ============================================================

export type HeaderAlign = "left" | "center" | "right";
export type HeaderVAlign = "top" | "center" | "bottom";
export type HeaderFontFamily = "Nunito" | "Rasa" | "Noto Serif Gujarati";
export type HeaderDividerStyle = "single" | "double" | "dashed";

// ------------------------------------------------------------
//  Cell content
// ------------------------------------------------------------

export type HeaderTextContent = {
  type: "text";
  text: string;
  fontSize: number; // pt
  fontFamily: HeaderFontFamily;
  bold: boolean;
  italic: boolean;
  color: string; // hex
};

export type HeaderLogoContent = {
  type: "logo";
  height: number; // px
};

export type HeaderContent = HeaderTextContent | HeaderLogoContent;

/**
 * How a cell claims horizontal space in its row:
 *   • "auto" — hug the content, so a logo is exactly logo-sized
 *   • "fill" — absorb all space the auto cells left behind
 *   • number — share that leftover proportionally with other flexing cells
 */
export type HeaderCellWidth = number | "auto" | "fill";

export type HeaderCell = {
  id: string;
  width: HeaderCellWidth;
  align: HeaderAlign;
  content: HeaderContent;
};

// ------------------------------------------------------------
//  Rows
// ------------------------------------------------------------

export type HeaderCellsRow = {
  id: string;
  type: "cells";
  vAlign: HeaderVAlign;
  gap: number; // px between cells
  cells: HeaderCell[];
};

export type HeaderDividerRow = {
  id: string;
  type: "divider";
  style: HeaderDividerStyle;
  color: string; // hex
};

export type HeaderRow = HeaderCellsRow | HeaderDividerRow;

export type HeaderConfig = { rows: HeaderRow[] };

export const EMPTY_HEADER: HeaderConfig = { rows: [] };

/** Authoring limits — mirrored by headerConfigSchema in lib/validations.ts. */
export const HEADER_LIMITS = {
  maxRows: 14,
  maxCellsPerRow: 4,
  fontSizeMin: 6,
  fontSizeMax: 48,
  logoHeightMin: 16,
  logoHeightMax: 200,
  widthMin: 1,
  widthMax: 8,
  gapMin: 0,
  gapMax: 48,
} as const;

export const HEADER_FONT_OPTIONS: { value: HeaderFontFamily; label: string }[] = [
  { value: "Nunito", label: "Nunito (Body)" },
  { value: "Rasa", label: "Rasa (Serif)" },
  { value: "Noto Serif Gujarati", label: "Noto Serif Gujarati" },
];

export const HEADER_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: "#1a1a1a", label: "Black" },
  { value: "#02015c", label: "Navy" },
  { value: "#edc602", label: "Brand Yellow" },
  { value: "#555555", label: "Gray" },
  { value: "#b91c1c", label: "Red" },
];

export const HEADER_DIVIDER_STYLES: { value: HeaderDividerStyle; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "double", label: "Double" },
  { value: "dashed", label: "Dashed" },
];

export const HEADER_ALIGNS: { value: HeaderAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export const HEADER_V_ALIGNS: { value: HeaderVAlign; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "center", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

export const HEADER_WIDTH_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Hug content" },
  { value: "fill", label: "Fill remaining space" },
].concat(
  Array.from({ length: HEADER_LIMITS.widthMax }, (_, i) => {
    const w = i + 1;
    return {
      value: String(w),
      label:
        w === 1
          ? "1 — narrow"
          : w === HEADER_LIMITS.widthMax
            ? `${w} — widest`
            : String(w),
    };
  })
);

// ------------------------------------------------------------
//  Ids
// ------------------------------------------------------------

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function newHeaderRowId(): string {
  return nextId("hr");
}

export function newHeaderCellId(): string {
  return nextId("hc");
}

// ------------------------------------------------------------
//  Factories
// ------------------------------------------------------------

export const DEFAULT_TEXT_CONTENT: HeaderTextContent = {
  type: "text",
  text: "",
  fontSize: 12,
  fontFamily: "Nunito",
  bold: false,
  italic: false,
  color: "#1a1a1a",
};

export function newTextCell(
  overrides: Partial<HeaderTextContent> = {},
  align: HeaderAlign = "center",
  width: HeaderCellWidth = 1
): HeaderCell {
  return {
    id: newHeaderCellId(),
    width,
    align,
    content: { ...DEFAULT_TEXT_CONTENT, ...overrides },
  };
}

export function newLogoCell(
  height = 80,
  align: HeaderAlign = "center",
  width: HeaderCellWidth = 1
): HeaderCell {
  return { id: newHeaderCellId(), width, align, content: { type: "logo", height } };
}

export function newCellsRow(cells: HeaderCell[] = []): HeaderCellsRow {
  return { id: newHeaderRowId(), type: "cells", vAlign: "center", gap: 12, cells };
}

export function newDividerRow(style: HeaderDividerStyle = "single", color = "#02015c"): HeaderDividerRow {
  return { id: newHeaderRowId(), type: "divider", style, color };
}

// ------------------------------------------------------------
//  Tokens (placeholder fields) resolved at render time
// ------------------------------------------------------------

export type HeaderTokenContext = {
  examName: string;
  date: string;
  className: string;
  subject: string;
  totalMarks: string;
  duration: string;
  academicYear: string;
  board: string;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
};

export const HEADER_TOKENS: {
  token: string;
  label: string;
  sample: string;
  key: keyof HeaderTokenContext;
}[] = [
  { token: "{{examName}}", label: "Exam name", sample: "Mathematics Final Exam", key: "examName" },
  { token: "{{date}}", label: "Date", sample: "25 Sep 2026", key: "date" },
  { token: "{{class}}", label: "Class", sample: "Std 12", key: "className" },
  { token: "{{subject}}", label: "Subject", sample: "Mathematics", key: "subject" },
  { token: "{{totalMarks}}", label: "Total marks", sample: "80", key: "totalMarks" },
  { token: "{{duration}}", label: "Duration", sample: "3 hours", key: "duration" },
  { token: "{{academicYear}}", label: "Academic year", sample: "2026-27", key: "academicYear" },
  { token: "{{board}}", label: "Board", sample: "GSEB", key: "board" },
  { token: "{{schoolName}}", label: "School name", sample: "Vidyadhish Vidyasankul", key: "schoolName" },
  { token: "{{schoolAddress}}", label: "School address", sample: "Ahmedabad, Gujarat", key: "schoolAddress" },
  { token: "{{schoolPhone}}", label: "School phone", sample: "+91 98765 43210", key: "schoolPhone" },
];

const TOKEN_REGEX = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export function resolveHeaderTokens(text: string, ctx: HeaderTokenContext): string {
  return text.replace(TOKEN_REGEX, (match, name: string) => {
    const token = HEADER_TOKENS.find((t) => t.token === `{{${name}}}`);
    if (!token) return match;
    return ctx[token.key] || "";
  });
}

export type SchoolHeaderProfile = {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  board: string | null;
  academicYear: string | null;
};

export type HeaderContextInput = {
  paperTitle: string;
  date: Date | null;
  className: string | null;
  subjectName: string | null;
  totalMarks: number;
  duration: number | null;
  school: SchoolHeaderProfile;
};

export function buildHeaderContext(input: HeaderContextInput): HeaderTokenContext {
  const d = input.date ?? new Date();
  return {
    examName: input.paperTitle || "Untitled Paper",
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    className: input.className || "",
    subject: input.subjectName || "",
    totalMarks: String(input.totalMarks || 0),
    duration: input.duration ? `${input.duration} minutes` : "",
    academicYear: input.school.academicYear || "",
    board: input.school.board || "",
    schoolName: input.school.name || "",
    schoolAddress: input.school.address || "",
    schoolPhone: input.school.phone || "",
  };
}

// ------------------------------------------------------------
//  Normalization — accepts legacy flat rows too
// ------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function clamp(n: number, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

function safeFontFamily(value: unknown): HeaderFontFamily {
  return value === "Rasa" || value === "Noto Serif Gujarati" || value === "Nunito"
    ? value
    : "Nunito";
}

/** Numeric widths keep their old proportional meaning; auto/fill pass through. */
function safeWidth(value: unknown): HeaderCellWidth {
  if (value === "auto" || value === "fill") return value;
  return clamp(Number(value), HEADER_LIMITS.widthMin, HEADER_LIMITS.widthMax, 1);
}

function safeAlign(value: unknown, fallback: HeaderAlign = "center"): HeaderAlign {
  return value === "left" || value === "right" || value === "center" ? value : fallback;
}

function safeVAlign(value: unknown): HeaderVAlign {
  return value === "top" || value === "bottom" || value === "center" ? value : "center";
}

function safeDividerStyle(value: unknown): HeaderDividerStyle {
  return value === "double" || value === "dashed" || value === "single" ? value : "single";
}

function normalizeTextContent(raw: Record<string, unknown>): HeaderTextContent {
  return {
    type: "text",
    text: typeof raw.text === "string" ? raw.text : "",
    fontSize: clamp(Number(raw.fontSize), HEADER_LIMITS.fontSizeMin, HEADER_LIMITS.fontSizeMax, 12),
    fontFamily: safeFontFamily(raw.fontFamily),
    bold: raw.bold === true,
    italic: raw.italic === true,
    color: safeColor(raw.color, "#1a1a1a"),
  };
}

function normalizeCell(raw: unknown, fallbackAlign: HeaderAlign = "center"): HeaderCell | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  // New shape: { id, width, align, content }
  if (o.content && typeof o.content === "object") {
    const content = o.content as Record<string, unknown>;
    const type = content.type;
    if (type === "text") {
      return {
        id: typeof o.id === "string" && o.id ? o.id : newHeaderCellId(),
        width: safeWidth(o.width),
        align: safeAlign(o.align, fallbackAlign),
        content: normalizeTextContent(content),
      };
    }
    if (type === "logo") {
      return {
        id: typeof o.id === "string" && o.id ? o.id : newHeaderCellId(),
        width: safeWidth(o.width),
        align: safeAlign(o.align, fallbackAlign),
        content: {
          type: "logo",
          height: clamp(Number(content.height), HEADER_LIMITS.logoHeightMin, HEADER_LIMITS.logoHeightMax, 80),
        },
      };
    }
    return null;
  }

  // Legacy flat item → single cell
  if (o.type === "text") {
    return {
      id: newHeaderCellId(),
      width: 1,
      align: safeAlign(o.align, fallbackAlign),
      content: normalizeTextContent(o),
    };
  }
  if (o.type === "logo") {
    return {
      id: newHeaderCellId(),
      width: 1,
      align: safeAlign(o.align, fallbackAlign),
      content: {
        type: "logo",
        height: clamp(Number(o.height), HEADER_LIMITS.logoHeightMin, HEADER_LIMITS.logoHeightMax, 80),
      },
    };
  }
  return null;
}

/**
 * Coerces any stored/incoming header JSON into the current shape.
 * Legacy flat rows (`text` / `logo` / `line`) become single-cell rows and
 * dividers, so papers configured before the layout upgrade keep working.
 */
export function normalizeHeaderConfig(raw: unknown): HeaderConfig {
  if (!raw || typeof raw !== "object") return { rows: [] };
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return { rows: [] };

  const out: HeaderRow[] = [];

  for (const row of rows.slice(0, HEADER_LIMITS.maxRows)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;

    if (o.type === "divider" || o.type === "line") {
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : newHeaderRowId(),
        type: "divider",
        style: safeDividerStyle(o.style),
        color: safeColor(o.color, "#02015c"),
      });
      continue;
    }

    if (o.type === "cells" && Array.isArray(o.cells)) {
      const cells = o.cells
        .slice(0, HEADER_LIMITS.maxCellsPerRow)
        .map((c) => normalizeCell(c))
        .filter((c): c is HeaderCell => c !== null);
      if (cells.length === 0) continue;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : newHeaderRowId(),
        type: "cells",
        vAlign: safeVAlign(o.vAlign),
        gap: clamp(Number(o.gap), HEADER_LIMITS.gapMin, HEADER_LIMITS.gapMax, 12),
        cells,
      });
      continue;
    }

    // Legacy flat item → one-cell row
    const cell = normalizeCell(o);
    if (!cell) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : newHeaderRowId(),
      type: "cells",
      vAlign: "center",
      gap: 12,
      cells: [cell],
    });
  }

  return { rows: out };
}

/** Keeps only the fields the schema/DB should persist. */
export function toPersistedHeaderConfig(config: HeaderConfig): HeaderConfig {
  return normalizeHeaderConfig(config);
}

// ------------------------------------------------------------
//  Layout presets — one click to a well-aligned header
// ------------------------------------------------------------

export type HeaderPresetId = "logo-left" | "split" | "classic" | "minimal";

export type HeaderPreset = {
  id: HeaderPresetId;
  label: string;
  description: string;
  build: (school: SchoolHeaderProfile) => HeaderConfig;
};

function contactLine(school: SchoolHeaderProfile): string {
  return [school.address, school.phone].filter(Boolean).join("  •  ");
}

function metaLine(school: SchoolHeaderProfile): string {
  return [school.board, school.academicYear].filter(Boolean).join("  •  ");
}

export const HEADER_PRESETS: HeaderPreset[] = [
  {
    id: "logo-left",
    label: "Logo left + name",
    description: "Logo beside the school name, details centred underneath.",
    build: (school) => {
      const rows: HeaderRow[] = [];

      const nameCell = newTextCell(
        {
          text: school.name || "School Name",
          fontSize: 18,
          fontFamily: "Rasa",
          bold: true,
          color: "#02015c",
        },
        "left"
      );

      if (school.logoUrl) {
        rows.push(
          newCellsRow([
            // The logo hugs its own size; the name takes everything else.
            { ...newLogoCell(72, "left"), width: "auto" },
            { ...nameCell, width: "fill" },
          ])
        );
      } else {
        rows.push(newCellsRow([{ ...nameCell, align: "center" }]));
      }

      const contact = contactLine(school);
      if (contact) {
        rows.push(newCellsRow([newTextCell({ text: contact, fontSize: 11, color: "#555555" })]));
      }

      const meta = metaLine(school);
      if (meta) {
        rows.push(newCellsRow([newTextCell({ text: meta, fontSize: 10, color: "#666666" })]));
      }

      rows.push(newDividerRow("double", "#02015c"));
      return { rows };
    },
  },
  {
    id: "split",
    label: "Three columns",
    description: "Logo, school name and contact block side by side.",
    build: (school) => {
      const rows: HeaderRow[] = [];

      const middle = newTextCell(
        {
          text: school.name || "School Name",
          fontSize: 17,
          fontFamily: "Rasa",
          bold: true,
          color: "#02015c",
        },
        "center"
      );

      const rightText = [contactLine(school), metaLine(school)].filter(Boolean).join("\n");

      const cells: HeaderCell[] = [];
      if (school.logoUrl) cells.push({ ...newLogoCell(64, "left"), width: "auto" });
      cells.push({ ...middle, width: "fill" });
      if (rightText) {
        cells.push({
          ...newTextCell({ text: rightText, fontSize: 9.5, color: "#555555" }, "right"),
          width: "auto",
        });
      }

      rows.push(newCellsRow(cells));
      rows.push(newDividerRow("double", "#02015c"));
      return { rows };
    },
  },
  {
    id: "classic",
    label: "Classic centre",
    description: "Everything stacked and centred — the original layout.",
    build: (school) => {
      const rows: HeaderRow[] = [];

      if (school.logoUrl) rows.push(newCellsRow([newLogoCell(80, "center")]));

      rows.push(
        newCellsRow([
          newTextCell(
            {
              text: school.name || "School Name",
              fontSize: 18,
              fontFamily: "Rasa",
              bold: true,
              color: "#02015c",
            },
            "center"
          ),
        ])
      );

      const contact = contactLine(school);
      if (contact) {
        rows.push(newCellsRow([newTextCell({ text: contact, fontSize: 11, color: "#555555" })]));
      }

      const meta = metaLine(school);
      if (meta) {
        rows.push(newCellsRow([newTextCell({ text: meta, fontSize: 10, color: "#666666" })]));
      }

      rows.push(newDividerRow("double", "#02015c"));
      return { rows };
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Just the school name and a rule.",
    build: (school) => ({
      rows: [
        newCellsRow([
          newTextCell(
            { text: school.name || "School Name", fontSize: 16, bold: true, color: "#1a1a1a" },
            "center"
          ),
        ]),
        newDividerRow("single", "#1a1a1a"),
      ],
    }),
  },
];

/**
 * The header a new paper starts from: logo beside the name when the school
 * has a logo, otherwise the centred classic layout.
 */
export function defaultHeaderFromSchool(school: SchoolHeaderProfile): HeaderConfig {
  const preset = HEADER_PRESETS.find((p) => p.id === (school.logoUrl ? "logo-left" : "classic"));
  return preset ? preset.build(school) : { rows: [] };
}

// ------------------------------------------------------------
//  CSS helpers (shared by preview styles & PDF HTML)
// ------------------------------------------------------------

export function headerFontCss(family: HeaderFontFamily): string {
  switch (family) {
    case "Rasa":
      return "'Rasa', Georgia, serif";
    case "Noto Serif Gujarati":
      return "'Noto Serif Gujarati', 'Noto Sans', serif";
    case "Nunito":
    default:
      return "'Nunito', 'Noto Sans', Arial, sans-serif";
  }
}

export function headerTextAlignCss(align: HeaderAlign): string {
  switch (align) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
    default:
      return "center";
  }
}

export function headerVerticalAlignCss(vAlign: HeaderVAlign): string {
  return vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
}

/**
 * CSS flex shorthand for a cell width — shared by the React preview and the
 * PDF HTML builder so both lay the header out identically.
 *   "auto" → 0 1 auto (hug the content, shrink rather than overflow)
 *   "fill" → 1 1 0%   (grow into whatever the auto cells left behind)
 *   n      → n 1 0%   (the same, but weighted)
 */
export function headerCellFlex(width: HeaderCellWidth): string {
  if (width === "auto") return "0 1 auto";
  return `${width === "fill" ? 1 : width} 1 0%`;
}

// ============================================================
//  HTML builder for the PDF engine (server-side)
// ============================================================

function escapeHTML(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function headerContentToHTML(content: HeaderContent, ctx: HeaderTokenContext, logoUrl: string | null): string {
  if (content.type === "logo") {
    if (!logoUrl) return "";
    return `<img src="${escapeHTML(logoUrl)}" alt="logo" style="height:${content.height}px;width:auto;max-width:100%;display:inline-block;object-fit:contain;"/>`;
  }

  const weight = content.bold ? "700" : "400";
  const style = content.italic ? "italic" : "normal";
  return (
    `<div style="font-family:${headerFontCss(content.fontFamily)};` +
    `font-size:${content.fontSize}pt;font-weight:${weight};font-style:${style};` +
    `color:${content.color};padding:2px 0;white-space:pre-line;">` +
    `${escapeHTML(resolveHeaderTokens(content.text, ctx)).replace(/\n/g, "<br/>")}</div>`
  );
}

export function headerConfigToHTML(
  config: HeaderConfig,
  ctx: HeaderTokenContext,
  logoUrl: string | null
): string {
  const normalized = normalizeHeaderConfig(config);
  const parts: string[] = [];

  for (const row of normalized.rows) {
    if (row.type === "divider") {
      const border =
        row.style === "double"
          ? "3px double"
          : row.style === "dashed"
            ? "1px dashed"
            : "1px solid";
      parts.push(`<div style="border-bottom:${border} ${row.color};margin:6px 0;"></div>`);
      continue;
    }

    const cells = row.cells
      .map(
        (cell) =>
          `<div style="flex:${headerCellFlex(cell.width)};min-width:0;text-align:${headerTextAlignCss(cell.align)};">` +
          headerContentToHTML(cell.content, ctx, logoUrl) +
          `</div>`
      )
      .join("");

    parts.push(
      `<div style="display:flex;align-items:${headerVerticalAlignCss(row.vAlign)};` +
        `gap:${row.gap}px;width:100%;">${cells}</div>`
    );
  }

  return parts.join("");
}
