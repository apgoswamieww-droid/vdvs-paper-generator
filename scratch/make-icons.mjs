// Scratch: writes the PWA icons in public/icons (no image libs in this repo).
// Run:  node scratch/make-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Geometry shared by every size: rounded square, check-mark glyph.
function makePixel(size, { pad, radius, stroke }) {
  const s = size;
  const r = radius * s;
  const p = pad * s;
  const x0 = p;
  const y0 = p;
  const x1 = s - p - 1;
  const y1 = s - p - 1;

  const ax = s * 0.3;
  const ay = s * 0.52;
  const bx = s * 0.46;
  const by = s * 0.68;
  const cx = s * 0.72;
  const cy = s * 0.36;
  const w = stroke * s;

  const dist = (px, py, ux, uy, vx, vy) => {
    const dx = vx - ux;
    const dy = vy - uy;
    const t = Math.max(0, Math.min(1, ((px - ux) * dx + (py - uy) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ux + t * dx), py - (uy + t * dy));
  };

  return (x, y) => {
    // outside the rounded rect → transparent
    const cxClamped = Math.max(x0 + r, Math.min(x1 - r, x));
    const cyClamped = Math.max(y0 + r, Math.min(y1 - r, y));
    const corner = (x - cxClamped) ** 2 + (y - cyClamped) ** 2 > r * r;
    const outside = x < x0 || x > x1 || y < y0 || y > y1 || corner;
    if (outside) return [0, 0, 0, 0];

    const inCheck = dist(x, y, ax, ay, bx, by) <= w || dist(x, y, bx, by, cx, cy) <= w;
    if (inCheck) return [255, 255, 255, 255];
    return [37, 99, 235, 255]; // #2563eb
  };
}

const outDir = path.resolve("public/icons");
fs.mkdirSync(outDir, { recursive: true });

const specs = [
  ["icon-192.png", 192, { pad: 0.04, radius: 0.2, stroke: 0.09 }],
  ["icon-512.png", 512, { pad: 0.04, radius: 0.2, stroke: 0.09 }],
  // maskable: full-bleed background, glyph inside the ~80% safe zone
  ["icon-maskable-512.png", 512, { pad: 0.0, radius: 0.0, stroke: 0.075 }],
];

for (const [name, size, opts] of specs) {
  const buf = png(size, makePixel(size, opts));
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}
