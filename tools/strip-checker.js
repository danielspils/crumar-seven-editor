'use strict';

// Turn a flattened illustration back into a cut-out.
//
//   node tools/strip-checker.js assets/instruments/*.png
//
// The instrument PNGs arrived as exports of a preview that DRAWS transparency
// as a grey checkerboard — every pixel opaque, the "background" painted in.
// Dropped straight into a tile they show that checker as a grey rectangle
// behind the instrument. This finds the background and cuts it away.
//
// Flood fill from the border rather than matching colour everywhere: the
// instruments contain plenty of greys of their own (chrome legs, brushed
// rails, white keys), and those are enclosed by the drawing's dark outline, so
// a fill that starts outside and stops at the first non-checker pixel can
// never reach them. A global colour match would eat them.
//
// The edges are anti-aliased against the checker, so a hard cut leaves a pale
// halo — visible against a dark theme, which is exactly where these are used.
// So the pass after the fill softens: a pixel still opaque but touching the
// cut, and still checker-ish, gets partial alpha scaled by how far it has
// travelled toward the drawing.

const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

// What counts as checkerboard: near-neutral (the checker is pure grey) and in
// its light band. Measured on the delivered files: tones around 178 and 228.
const MAX_CHROMA = 14;
const LUM_MIN = 160;
const LUM_MAX = 248;

const lum = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;
const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);
const isChecker = (r, g, b) =>
  chroma(r, g, b) <= MAX_CHROMA && lum(r, g, b) >= LUM_MIN && lum(r, g, b) <= LUM_MAX;

// --- PNG decode (8-bit RGBA only) ------------------------------------------
function decode(buf) {
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`only 8-bit RGBA is handled (depth ${bitDepth}, colour type ${colorType})`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= 4 ? prev[x - 4] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[x] = v & 0xff;
    }
  }
  return { w, h, px };
}

// --- PNG encode -------------------------------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encode({ w, h, px }) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the cut ----------------------------------------------------------------
function strip(img) {
  const { w, h, px } = img;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const n = y * w + x;
    if (bg[n]) return;
    const i = n * 4;
    if (!isChecker(px[i], px[i + 1], px[i + 2])) return;
    bg[n] = 1;
    stack.push(n);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const n = stack.pop();
    const x = n % w, y = (n / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  let cut = 0;
  for (let n = 0; n < w * h; n++) if (bg[n]) { px[n * 4 + 3] = 0; cut++; }

  // Soften the anti-aliased rim: still-opaque, still checker-ish pixels that
  // touch the cut fade by how light they are. Fully checker-toned goes to
  // nothing; a pixel already darkened by the outline keeps most of itself.
  let feathered = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = y * w + x;
      if (bg[n]) continue;
      const touches =
        (x > 0 && bg[n - 1]) || (x < w - 1 && bg[n + 1]) ||
        (y > 0 && bg[n - w]) || (y < h - 1 && bg[n + w]);
      if (!touches) continue;
      const i = n * 4;
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (chroma(r, g, b) > MAX_CHROMA) continue; // real colour: leave it
      const l = lum(r, g, b);
      if (l < LUM_MIN) continue;                  // dark outline: leave it
      px[i + 3] = Math.round(Math.max(0, Math.min(1, (LUM_MAX - l) / 40)) * 255);
      feathered++;
    }
  }
  return { cut, feathered };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/strip-checker.js <file.png> [...]');
  process.exit(1);
}
for (const file of files) {
  const img = decode(fs.readFileSync(file));
  const { cut, feathered } = strip(img);
  const pct = ((cut / (img.w * img.h)) * 100).toFixed(1);
  fs.writeFileSync(file, encode(img));
  console.log(`${path.basename(file)}: cut ${pct}% of the frame, feathered ${feathered}px`);
}
