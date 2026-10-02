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

/**
 * A bordered meta-data box: Section / Class / Subject / Date / Duration /
 * Marks, each field independently toggleable. Public-facing values (class,
 * subject, date…) come from the token context at render time; only the
 * School-section text is stored here.
 */
export type HeaderMetaGridRow = {
  id: string;
  type: "metaGrid";
  /** School-section line, e.g. "SHIVAY". */
  section: string;
  showSection: boolean;
  showClass: boolean;
  showDate: boolean;
  showDuration: boolean;
  showTotalMarks: boolean;
  showSubject: boolean;
  /** Label + frame color. */
  color: string; // hex
};

export type HeaderRow = HeaderCellsRow | HeaderDividerRow | HeaderMetaGridRow;

// ------------------------------------------------------------
//  Canvas layout (v2) — free-positioned blocks used by the visual
//  designer. Blocks carry percentage geometry (x / y / w of the
//  canvas) so the same inline styles render identically in the
//  React preview canvas and the Puppeteer PDF HTML.
// ------------------------------------------------------------

export type HeaderBlockKind = "branding" | "identity" | "metaGrid";

export type HeaderBlockBase = {
  id: string;
  kind: HeaderBlockKind;
  /** left edge — % of canvas width */
  x: number;
  /** top edge — % of canvas height */
  y: number;
  /** width — % of canvas width */
  w: number;
  /** text/content alignment inside the block */
  align: HeaderAlign;
  visible: boolean;
};

/** Block A — school logo (+ optional contact line). */
export type HeaderBrandingBlock = HeaderBlockBase & {
  kind: "branding";
  logoHeight: number; // px
  showContact: boolean;
};

/** Block B — school name + address lines (token-aware). */
export type HeaderIdentityBlock = HeaderBlockBase & {
  kind: "identity";
  nameText: string;
  addressText: string;
  fontSize: number; // pt — school name size
  color: string; // hex — school name color
};

/** Block C — the boxed meta grid (Section / Class / Subject / Date / …). */
export type HeaderMetaGridBlock = HeaderBlockBase & {
  kind: "metaGrid";
  section: string;
  showSection: boolean;
  showClass: boolean;
  showDate: boolean;
  showDuration: boolean;
  showTotalMarks: boolean;
  showSubject: boolean;
  color: string; // hex
};

export type HeaderBlock = HeaderBrandingBlock | HeaderIdentityBlock | HeaderMetaGridBlock;

export type HeaderCanvasLayout = {
  version: 2;
  /** canvas height in px — reserves the exact space in print */
  height: number;
  blocks: HeaderBlock[];
};

export type HeaderConfig = { rows: HeaderRow[]; canvas?: HeaderCanvasLayout };

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

/** Authoring limits for the canvas designer — mirrored in lib/validations.ts. */
export const CANVAS_LIMITS = {
  maxBlocks: 8,
  heightMin: 80,
  heightMax: 480,
  xMin: 0,
  xMax: 100,
  yMin: 0,
  yMax: 100,
  wMin: 5,
  wMax: 100,
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

export function newHeaderBlockId(): string {
  return nextId("hb");
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

export function newMetaGridRow(overrides: Partial<HeaderMetaGridRow> = {}): HeaderMetaGridRow {
  return {
    id: newHeaderRowId(),
    type: "metaGrid",
    section: "SHIVAY",
    showSection: true,
    showClass: true,
    showDate: true,
    showDuration: true,
    showTotalMarks: true,
    showSubject: false,
    color: "#02015c",
    ...overrides,
  };
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
//  Boxed meta grid — the bordered field box (Section / Class / …)
// ------------------------------------------------------------

export type HeaderMetaCell = { key: string; label: string; value: string };

/**
 * The cells a metaGrid row shows, honoring its visibility toggles. Cells whose
 * value would be blank are dropped so the box never shows a hollow field.
 * Shared by the React preview, the PDF HTML and the Word table.
 */
export function headerMetaGridCells(
  row: Pick<HeaderMetaGridRow, "section" | "showSection" | "showClass" | "showDate" | "showDuration" | "showTotalMarks" | "showSubject">,
  ctx: HeaderTokenContext
): HeaderMetaCell[] {
  const items: { key: string; label: string; value: string; show: boolean }[] = [
    { key: "section", label: "Section", value: row.section, show: row.showSection },
    { key: "class", label: "Class / Standard", value: ctx.className, show: row.showClass },
    { key: "subject", label: "Subject", value: ctx.subject, show: row.showSubject },
    { key: "date", label: "Exam Date", value: ctx.date, show: row.showDate },
    { key: "duration", label: "Time / Duration", value: ctx.duration, show: row.showDuration },
    { key: "totalMarks", label: "Max. Marks", value: ctx.totalMarks, show: row.showTotalMarks },
  ];

  return items
    .filter((i) => i.show && i.value.trim() !== "")
    .map(({ key, label, value }) => ({ key, label, value }));
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

    if (o.type === "metaGrid") {
      const bool = (v: unknown, fallback: boolean): boolean =>
        typeof v === "boolean" ? v : fallback;
      out.push({
        id: typeof o.id === "string" && o.id ? o.id : newHeaderRowId(),
        type: "metaGrid",
        section: typeof o.section === "string" ? o.section.slice(0, 80) : "SHIVAY",
        showSection: bool(o.showSection, true),
        showClass: bool(o.showClass, true),
        showDate: bool(o.showDate, true),
        showDuration: bool(o.showDuration, true),
        showTotalMarks: bool(o.showTotalMarks, true),
        showSubject: bool(o.showSubject, false),
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

/**
 * Keeps only the fields the schema/DB should persist — rows and/or canvas.
 */
export function toPersistedHeaderConfig(config: HeaderConfig): HeaderConfig {
  const out = normalizeHeaderConfig(config);
  if (config && typeof config === "object" && "canvas" in config && config.canvas) {
    out.canvas = normalizeCanvasLayout(config.canvas);
  }
  return out;
}

/**
 * Coerces a stored/incoming header JSON for reading: keeps the canvas layout
 * as-is (normalized) and upgrades legacy flat items to row cells.
 */
export function normalizeStoredHeaderConfig(raw: unknown): HeaderConfig {
  if (isCanvasHeader(raw)) {
    return { rows: [], canvas: normalizeCanvasLayout((raw as { canvas?: unknown }).canvas) };
  }
  return normalizeHeaderConfig(raw);
}

// ------------------------------------------------------------
//  Canvas normalization — coerces stored designer JSON
// ------------------------------------------------------------

function normalizeBase(raw: Record<string, unknown>): Pick<HeaderBlockBase, "id" | "x" | "y" | "w" | "align" | "visible"> {
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newHeaderBlockId(),
    x: clampPercent(raw.x, 0, CANVAS_LIMITS.xMin, CANVAS_LIMITS.xMax),
    y: clampPercent(raw.y, 0, CANVAS_LIMITS.yMin, CANVAS_LIMITS.yMax),
    w: clampPercent(raw.w, 100, CANVAS_LIMITS.wMin, CANVAS_LIMITS.wMax),
    align: safeAlign(raw.align, "center"),
    visible: raw.visible !== false,
  };
}

function normalizeCanvasBlock(raw: unknown): HeaderBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = normalizeBase(o);
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
  const color = (v: unknown): string => safeColor(v, "#02015c");

  if (o.kind === "branding") {
    return {
      ...base,
      kind: "branding",
      logoHeight: clamp(Number(o.logoHeight), HEADER_LIMITS.logoHeightMin, HEADER_LIMITS.logoHeightMax, 72),
      showContact: bool(o.showContact, false),
    };
  }
  if (o.kind === "identity") {
    return {
      ...base,
      kind: "identity",
      nameText: typeof o.nameText === "string" ? o.nameText.slice(0, 300) : "",
      addressText: typeof o.addressText === "string" ? o.addressText.slice(0, 500) : "",
      fontSize: clamp(Number(o.fontSize), HEADER_LIMITS.fontSizeMin, HEADER_LIMITS.fontSizeMax, 18),
      color: color(o.color),
    };
  }
  if (o.kind === "metaGrid") {
    return {
      ...base,
      kind: "metaGrid",
      section: typeof o.section === "string" ? o.section.slice(0, 80) : "SHIVAY",
      showSection: bool(o.showSection, true),
      showClass: bool(o.showClass, true),
      showDate: bool(o.showDate, true),
      showDuration: bool(o.showDuration, true),
      showTotalMarks: bool(o.showTotalMarks, true),
      showSubject: bool(o.showSubject, false),
      color: color(o.color),
    };
  }
  return null;
}

export function normalizeCanvasLayout(raw: unknown): HeaderCanvasLayout {
  if (!raw || typeof raw !== "object") return { version: 2, height: 220, blocks: [] };
  const o = raw as { height?: unknown; blocks?: unknown };
  const blocks = Array.isArray(o.blocks) ? o.blocks : [];
  return {
    version: 2,
    height: clamp(Number(o.height), CANVAS_LIMITS.heightMin, CANVAS_LIMITS.heightMax, 220),
    blocks: blocks
      .slice(0, CANVAS_LIMITS.maxBlocks)
      .map(normalizeCanvasBlock)
      .filter((b): b is HeaderBlock => b !== null),
  };
}

/** Detects whether a stored config uses the canvas (v2) layout. */
export function isCanvasHeader(config: unknown): boolean {
  return Boolean(config && typeof config === "object" && (config as { canvas?: unknown }).canvas);
}

// ------------------------------------------------------------
//  Layout presets — one click to a well-aligned header
// ------------------------------------------------------------

export type HeaderPresetId = "logo-left" | "split" | "classic" | "minimal" | "boxed";

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
  {
    id: "boxed",
    label: "Boxed meta bar",
    description: "Logo + school name, then a bordered grid for Section, Class, Date, Time and Marks.",
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
        "center"
      );

      if (school.logoUrl) {
        rows.push(
          newCellsRow([
            { ...newLogoCell(72, "center"), width: "auto" },
            { ...nameCell, width: "fill" },
          ])
        );
      } else {
        rows.push(newCellsRow([nameCell]));
      }

      const contact = contactLine(school);
      if (contact) {
        rows.push(newCellsRow([newTextCell({ text: contact, fontSize: 10.5, color: "#555555" })]));
      }

      rows.push(newMetaGridRow());
      return { rows };
    },
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

/**
 * One-way upgrade: flattens rows into canvas blocks so existing headers can be
 * edited in the visual designer. Logo cells → branding block, text lines →
 * one identity block (first line = name, rest = address), metaGrid row →
 * bottom meta block. Dividers are dropped (the print CSS adds its own rule).
 */
export function canvasLayoutFromRows(config: HeaderConfig): HeaderCanvasLayout {
  const rows = normalizeHeaderConfig(config).rows;
  let hasLogo = false;
  let logoHeight = 72;
  let logoAlign: HeaderAlign = "center";
  let metaRow: HeaderMetaGridRow | null = null;
  const textLines: { text: string; fontSize: number; color: string }[] = [];

  for (const row of rows) {
    if (row.type === "metaGrid") {
      metaRow = row;
      continue;
    }
    if (row.type !== "cells") continue;
    for (const cell of row.cells) {
      if (cell.content.type === "logo") {
        hasLogo = true;
        logoHeight = cell.content.height;
        logoAlign = cell.align;
      } else if (cell.content.text.trim()) {
        textLines.push({
          text: cell.content.text.trim(),
          fontSize: cell.content.fontSize,
          color: cell.content.color,
        });
      }
    }
  }

  const blocks: HeaderBlock[] = [];

  if (hasLogo) {
    const x = logoAlign === "left" ? 0 : logoAlign === "right" ? 72 : 38;
    blocks.push({
      id: newHeaderBlockId(),
      kind: "branding",
      x,
      y: 0,
      w: 28,
      align: logoAlign,
      visible: true,
      logoHeight,
      showContact: false,
    });
  }

  const stackedWithLogo = hasLogo && logoAlign === "center";
  const sideOffset = hasLogo && logoAlign === "left" ? 26 : hasLogo && logoAlign === "right" ? 0 : 0;
  blocks.push({
    id: newHeaderBlockId(),
    kind: "identity",
    x: sideOffset,
    y: stackedWithLogo ? 32 : hasLogo ? 0 : 2,
    w: stackedWithLogo || !hasLogo ? 100 : sideOffset === 0 ? 74 : 74 - sideOffset,
    align: hasLogo && logoAlign !== "center" ? logoAlign : "center",
    visible: true,
    nameText: textLines[0]?.text ?? "",
    addressText: textLines.slice(1).map((l) => l.text).join("\n"),
    fontSize: textLines[0]?.fontSize ?? 18,
    color: textLines[0]?.color ?? "#02015c",
  });

  if (metaRow) {
    blocks.push({
      id: newHeaderBlockId(),
      kind: "metaGrid",
      x: 0,
      y: 56,
      w: 100,
      align: "center",
      visible: true,
      section: metaRow.section,
      showSection: metaRow.showSection,
      showClass: metaRow.showClass,
      showDate: metaRow.showDate,
      showDuration: metaRow.showDuration,
      showTotalMarks: metaRow.showTotalMarks,
      showSubject: metaRow.showSubject,
      color: metaRow.color,
    });
  }

  const height = Math.round(
    (hasLogo ? 120 : 44) + (metaRow ? 88 : 0) + (textLines.length > 1 ? 24 : 0) + 12
  );

  return {
    version: 2,
    height: clamp(height, CANVAS_LIMITS.heightMin, CANVAS_LIMITS.heightMax, 220),
    blocks,
  };
}

/**
 * The canvas a brand-new paper starts from: logo beside the (token-driven)
 * school name, with the boxed meta bar across the bottom.
 */
export function defaultCanvasFromSchool(school: SchoolHeaderProfile, withMeta = true): HeaderCanvasLayout {
  const contact = [school.address, school.phone].filter(Boolean).join("  •  ");
  const blocks: HeaderBlock[] = [];
  const hasLogo = Boolean(school.logoUrl);

  if (hasLogo) {
    blocks.push({
      id: newHeaderBlockId(),
      kind: "branding",
      x: 0,
      y: 0,
      w: 30,
      align: "left",
      visible: true,
      logoHeight: 76,
      showContact: false,
    });
  }

  blocks.push({
    id: newHeaderBlockId(),
    kind: "identity",
    x: hasLogo ? 32 : 0,
    y: hasLogo ? 0 : 2,
    w: hasLogo ? 68 : 100,
    align: hasLogo ? "left" : "center",
    visible: true,
    nameText: "{{schoolName}}",
    addressText: contact ? "{{schoolAddress}}  •  {{schoolPhone}}" : "",
    fontSize: 18,
    color: "#02015c",
  });

  if (withMeta) {
    blocks.push({
      id: newHeaderBlockId(),
      kind: "metaGrid",
      x: 0,
      y: hasLogo ? 52 : 56,
      w: 100,
      align: "center",
      visible: true,
      section: school.name ? school.name.split(/\s+/).slice(0, 2).join(" ").toUpperCase() : "SHIVAY",
      showSection: true,
      showClass: true,
      showDate: true,
      showDuration: true,
      showTotalMarks: true,
      showSubject: false,
      color: "#02015c",
    });
  }

  const height = (hasLogo ? 64 : 40) + (withMeta ? 88 : 0) + 40;

  return {
    version: 2,
    height: clamp(height, CANVAS_LIMITS.heightMin, CANVAS_LIMITS.heightMax, 220),
    blocks,
  };
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

export function headerTextAlignCss(align: HeaderAlign): "left" | "right" | "center" {
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

/** Cross-axis alignment for column-flexed canvas blocks. */
export function headerAlignItemsCss(align: HeaderAlign): string {
  return align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
}

export function clampPercent(value: unknown, fallback: number, min = 0, max = 100): number {
  return clamp(Number(value), min, max, fallback);
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
  if (isCanvasHeader(config)) {
    return headerCanvasToHTML(normalizeCanvasLayout((config as { canvas?: unknown }).canvas), ctx, logoUrl);
  }

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

    if (row.type === "metaGrid") {
      const metaCells = headerMetaGridCells(row, ctx);
      if (metaCells.length === 0) continue;
      parts.push(headerMetaGridHTML(metaCells, row.color));
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

/** The bordered meta-data grid (same mark-up for rows and canvas blocks). */
export function headerMetaGridHTML(cells: HeaderMetaCell[], color: string): string {
  return (
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));` +
    `width:100%;box-sizing:border-box;` +
    `border-top:1.5px solid ${color};border-left:1.5px solid ${color};margin:8px 0;">` +
    cells
      .map(
        (c) =>
          `<div style="padding:5px 10px;border-right:1.5px solid ${color};border-bottom:1.5px solid ${color};">` +
          `<div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${color};">${escapeHTML(c.label)}</div>` +
          `<div style="font-size:10.5pt;font-weight:700;color:#1a1a1a;">${escapeHTML(c.value)}</div>` +
          `</div>`
      )
      .join("") +
    `</div>`
  );
}

function headerBlockToHTML(block: HeaderBlock, ctx: HeaderTokenContext, logoUrl: string | null): string {
  const base = `position:absolute;display:flex;flex-direction:column;box-sizing:border-box;` +
    `left:${block.x}%;top:${block.y}%;width:${block.w}%;` +
    `text-align:${headerTextAlignCss(block.align)};align-items:${headerAlignItemsCss(block.align)};`;

  if (block.kind === "branding") {
    const logo = logoUrl
      ? `<img src="${escapeHTML(logoUrl)}" alt="logo" style="height:${block.logoHeight}px;width:auto;max-width:100%;display:block;object-fit:contain;"/>`
      : `<div style="height:${block.logoHeight}px;"></div>`;
    const contact = block.showContact
      ? `<div style="font-family:'Nunito','Noto Sans',Arial,sans-serif;font-size:9pt;color:#555555;margin-top:4px;white-space:pre-line;">${escapeHTML(
          resolveHeaderTokens("{{schoolAddress}}  •  {{schoolPhone}}", ctx)
        ).replace(/\n/g, "<br/>")}</div>`
      : "";
    return `<div style="${base}">${logo}${contact}</div>`;
  }

  if (block.kind === "identity") {
    const name = `<div style="font-family:'Rasa',Georgia,serif;font-size:${block.fontSize}pt;font-weight:700;color:${block.color};line-height:1.2;white-space:pre-line;">${escapeHTML(
      resolveHeaderTokens(block.nameText, ctx)
    ).replace(/\n/g, "<br/>")}</div>`;
    const address = block.addressText.trim()
      ? `<div style="font-family:'Nunito','Noto Sans',Arial,sans-serif;font-size:9.5pt;color:#555555;line-height:1.4;margin-top:2px;white-space:pre-line;">${escapeHTML(
          resolveHeaderTokens(block.addressText, ctx)
        ).replace(/\n/g, "<br/>")}</div>`
      : "";
    return `<div style="${base}">${name}${address}</div>`;
  }

  const cells = headerMetaGridCells(block, ctx);
  if (cells.length === 0) return "";
  return `<div style="${base}">${headerMetaGridHTML(cells, block.color)}</div>`;
}

/**
 * Canvas header HTML. The container carries an explicit width/height and
 * position:relative so the percentage-positioned blocks reserve the exact
 * space in print — nothing overlaps the question title below.
 */
export function headerCanvasToHTML(layout: HeaderCanvasLayout, ctx: HeaderTokenContext, logoUrl: string | null): string {
  const h = Math.round(layout.height);
  const blocks = layout.blocks
    .filter((b) => b.visible)
    .map((b) => headerBlockToHTML(b, ctx, logoUrl))
    .join("");
  return (
    `<div style="position:relative;width:100%;height:${h}px;margin:0 0 12px;page-break-inside:avoid;">` +
    blocks +
    `</div>`
  );
}
