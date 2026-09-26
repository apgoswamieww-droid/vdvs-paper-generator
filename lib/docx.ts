// ============================================================
//  Minimal .docx (OOXML) writer — no third-party dependency.
//
//  A .docx is a ZIP of XML parts. This module owns the generic
//  plumbing — the STORE-only ZIP writer plus the few OOXML
//  helpers Word needs — so both the bulk-import template and the
//  paper export can build real Word files from the same code.
// ============================================================

// ------------------------------------------------------------
//  ZIP (STORE, no compression)
// ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  // Fixed timestamp (2026-09-01 00:00) — content doesn't change per build
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 1;

  const push = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const localOffset = offset;

    // Local file header
    push([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0,
      dosTime & 0xff, (dosTime >>> 8) & 0xff,
      dosDate & 0xff, (dosDate >>> 8) & 0xff,
      crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      nameBytes.length & 0xff, (nameBytes.length >>> 8) & 0xff,
      0, 0,
    ]);
    parts.push(nameBytes);
    parts.push(entry.data);

    // Central directory record
    const centralBytes: number[] = [
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0,
      dosTime & 0xff, (dosTime >>> 8) & 0xff,
      dosDate & 0xff, (dosDate >>> 8) & 0xff,
      crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      entry.data.length & 0xff, (entry.data.length >>> 8) & 0xff,
      (entry.data.length >>> 16) & 0xff, (entry.data.length >>> 24) & 0xff,
      nameBytes.length & 0xff, (nameBytes.length >>> 8) & 0xff,
      // extra len, comment len, disk start, internal attrs (2 bytes each)
      0, 0, 0, 0, 0, 0, 0, 0,
      // external attrs (4 bytes)
      0, 0, 0, 0,
      localOffset & 0xff, (localOffset >>> 8) & 0xff,
      (localOffset >>> 16) & 0xff, (localOffset >>> 24) & 0xff,
    ];
    central.push(new Uint8Array([...centralBytes, ...nameBytes]));

    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  parts.push(...central);

  // End of central directory
  push([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
    entries.length & 0xff, (entries.length >>> 8) & 0xff,
    entries.length & 0xff, (entries.length >>> 8) & 0xff,
    centralSize & 0xff, (centralSize >>> 8) & 0xff,
    (centralSize >>> 16) & 0xff, (centralSize >>> 24) & 0xff,
    centralStart & 0xff, (centralStart >>> 8) & 0xff,
    (centralStart >>> 16) & 0xff, (centralStart >>> 24) & 0xff,
    0, 0,
  ]);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// ------------------------------------------------------------
//  OOXML building blocks
// ------------------------------------------------------------

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number; // half-points: 20 = 10pt
  font?: string;
};

/** A `<w:p>` paragraph. `align` maps to Word's left/center/right. */
export function para(
  runs: Run[],
  spacingAfter = 120,
  opts: { align?: "left" | "center" | "right"; lineSpacing?: number; indent?: number } = {}
): string {
  const r = runs
    .map(({ text, bold, italic, color, size, font }) => {
      const rpr =
        `<w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}` +
        (font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : "") +
        (color ? `<w:color w:val="${color}"/>` : "") +
        `<w:sz w:val="${size ?? 22}"/></w:rPr>`;
      return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    })
    .join("");

  const jc = opts.align && opts.align !== "left" ? `<w:jc w:val="${opts.align}"/>` : "";
  const ind = opts.indent ? `<w:ind w:left="${Math.round(opts.indent)}"/>` : "";
  const spacing =
    `<w:spacing w:after="${spacingAfter}"` +
    (opts.lineSpacing ? ` w:line="${Math.round(opts.lineSpacing * 240)}" w:lineRule="auto"` : "") +
    `/>`;

  return `<w:p><w:pPr>${jc}${ind}${spacing}</w:pPr>${r}</w:p>`;
}

export const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

// ------------------------------------------------------------
//  Package assembly
// ------------------------------------------------------------

export function buildDocumentXml(body: string, sectPr: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}${sectPr}</w:body></w:document>`
  );
}

/** A4 portrait with 20mm margins — the Word default when no config is given. */
export function defaultSectPr(): string {
  return (
    `<w:sectPr>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`
  );
}

/** An image to embed under `word/media/`. */
export type DocxImage = {
  fileName: string; // e.g. "logo.png"
  data: Uint8Array;
  contentType: "image/png" | "image/jpeg";
};

export function imageExtension(contentType: DocxImage["contentType"]): string {
  return contentType === "image/png" ? "png" : "jpeg";
}

// ------------------------------------------------------------
//  Tables (used for side-by-side header cells)
// ------------------------------------------------------------

export type DocxTableCell = {
  widthTwips: number;
  vAlign?: "top" | "center" | "bottom";
  /** Cell body — paragraphs / image runs. Falls back to an empty paragraph. */
  paragraphs: string;
};

/**
 * A borderless, fixed-layout, single-row table. This is how Word lays content
 * out side by side (a logo next to the school name, for example).
 */
export function borderlessTable(totalWidthTwips: number, cells: DocxTableCell[]): string {
  if (cells.length === 0) return "";

  const grid = cells
    .map((c) => `<w:gridCol w:w="${Math.max(1, Math.round(c.widthTwips))}"/>`)
    .join("");

  const border = (tag: string) => `<w:${tag} w:val="none" w:sz="0" w:space="0"/>`;

  const row = cells
    .map((c) => {
      const width = Math.max(1, Math.round(c.widthTwips));
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
        (c.vAlign ? `<w:vAlign w:val="${c.vAlign}"/>` : "") +
        `</w:tcPr>${c.paragraphs || "<w:p/>"}</w:tc>`
      );
    })
    .join("");

  return (
    `<w:tbl><w:tblPr>` +
    `<w:tblW w:w="${Math.round(totalWidthTwips)}" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("") +
    `</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>` +
    `<w:tr>${row}</w:tr></w:tbl>`
  );
}

/**
 * Wraps the generated XML into a valid .docx byte array. Images are optional;
 * when given, the media parts and document relationships are generated too.
 */
export function buildDocx(documentXml: string, images: DocxImage[] = []): Uint8Array {
  const enc = new TextEncoder();

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Default Extension="jpg" ContentType="image/jpeg"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
  ];

  if (images.length > 0) {
    // rId1 is the document itself, so relationships start at rId2.
    const rels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      images
        .map(
          (img, i) =>
            `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`
        )
        .join("") +
      `</Relationships>`;

    entries.push({ name: "word/_rels/document.xml.rels", data: enc.encode(rels) });
    for (const img of images) {
      entries.push({ name: `word/media/${img.fileName}`, data: img.data });
    }
  }

  return buildZip(entries);
}

/** Relationship id for the nth embedded image (matches buildDocx). */
export function imageRelId(index: number): string {
  return `rId${index + 2}`;
}

/** Natural pixel size of a PNG or JPEG. Returns null when it cannot be read. */
export function imagePixelSize(
  data: Uint8Array,
  contentType: DocxImage["contentType"]
): { width: number; height: number } | null {
  if (contentType === "image/png" && data.length >= 24) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // 8-byte signature, then the IHDR chunk: width/height are big-endian u32.
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (contentType === "image/jpeg") {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = data[i + 1];
      const len = (data[i + 2] << 8) | data[i + 3];
      // SOF0-SOF15 (excluding DHT=0xc4, JPG=0xc8, DAC=0xcc) carry the dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          height: (data[i + 5] << 8) | data[i + 6],
          width: (data[i + 7] << 8) | data[i + 8],
        };
      }
      if (len <= 0) break;
      i += 2 + len;
    }
  }

  return null;
}

/** An inline image run sized in points, aligned inside its cell/paragraph. */
export function imageRun(
  relId: string,
  widthPt: number,
  heightPt: number,
  align: "left" | "center" | "right" = "center"
): string {
  const cx = Math.round(widthPt * 12700); // EMU per point
  const cy = Math.round(heightPt * 12700);
  const jc = align === "center" ? `<w:jc w:val="center"/>` : `<w:jc w:val="${align}"/>`;
  return (
    `<w:p><w:pPr>${jc}</w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="1" name="School logo"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="School logo"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}
