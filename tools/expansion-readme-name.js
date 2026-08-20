'use strict';

// Read the sound name an expansion will report, out of its README PDF.
//
//   node tools/expansion-readme-name.js <README.pdf> [more.pdf ...]
//
// WHY THIS EXISTS. `data/expansions.json` needs the name the INSTRUMENT
// reports for each sample set, and a set nobody here owns has no instrument to
// read it from. That gap listed three sounds twice for a real user (Rich
// Olivieri, 2026-08-19): once as "Installed, not in the catalogue" and once as
// "Unverified", because an entry with `sounds: null` claims nothing and so
// matches nothing.
//
// Every Crumar expansion ships a README PDF whose page footer reads:
//
//     Crumar Seven – <DEVICE NAME> - Page N/2
//
// and that string is the name the instrument displays. See CLAUDE.md
// ("Cataloguing an expansion you do not own") for the sources that look right
// and are wrong — the download title and the filename are both different from
// what the device says, and the .7ex payload is opaque.
//
// WHY IT IS NOT A ONE-LINER. The footer is drawn with a subset font, so the
// PDF stores glyph IDS, not text: `strings`, `grep` and Preview's copy-paste
// all come back with nothing. Each id has to be pushed back through the font's
// own ToUnicode CMap, which is what this does.
//
// THE INSTRUMENT STILL OUTRANKS THIS. Where somebody owns the expansion, read
// the names off their unit and record that as the source. This is for sets
// nobody here has installed. (They are free downloads, not purchases.)

const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

// --- PDF plumbing ----------------------------------------------------------

function inflate(buf) {
  for (const candidate of [buf, buf.subarray(0, buf.length - 1), buf.subarray(0, buf.length - 2)]) {
    try { return zlib.inflateSync(candidate); } catch { /* try the next trim */ }
  }
  return null;
}

// Streams are wrapped as `stream\n...\nendstream` inside an object. The EOL
// after the keyword varies, and a stream that will not inflate is returned
// raw — some are plain text already.
function streamOf(body) {
  const m = /stream\r?\n?/.exec(body);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = body.indexOf('endstream', start);
  if (end < 0) return null;
  const raw = Buffer.from(body.slice(start, end), 'latin1');
  const out = inflate(raw);
  return (out ? out.toString('latin1') : raw.toString('latin1'));
}

// A ToUnicode CMap maps glyph id -> the character it draws, as bfchar pairs
// and bfrange runs.
function parseCMap(data) {
  const map = new Map();
  for (const blk of data.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(m[1], 16), Buffer.from(m[2], 'hex').swap16().toString('utf16le'));
    }
  }
  for (const blk of data.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      for (let i = 0; i <= hi - lo; i++) map.set(lo + i, String.fromCodePoint(base + i));
    }
  }
  return map;
}

function pdfText(file) {
  const data = fs.readFileSync(file).toString('latin1');

  const objs = new Map();
  for (const m of data.matchAll(/(\d+)\s+\d+\s+obj([\s\S]*?)endobj/g)) {
    objs.set(Number(m[1]), m[2]);
  }

  // font object -> its CMap, then resource name (/F1) -> that CMap
  const fontCMaps = new Map();
  for (const [num, body] of objs) {
    if (!/\/Type\s*\/Font/.test(body)) continue;
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
    if (!tu) continue;
    const cm = streamOf(objs.get(Number(tu[1])) || '');
    if (cm) fontCMaps.set(num, parseCMap(cm));
  }
  const byName = new Map();
  for (const [, body] of objs) {
    for (const m of body.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      const cm = fontCMaps.get(Number(m[2]));
      if (cm) byName.set(m[1], cm);
    }
  }

  // Content streams: track the current font, then decode every shown string.
  const out = [];
  for (const [, body] of objs) {
    const s = streamOf(body);
    if (!s || !s.includes('BT')) continue;
    let cur = null;
    const re = /\/(F\d+)\s+[\d.]+\s+Tf|\[([\s\S]*?)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g;
    for (const m of s.matchAll(re)) {
      if (m[1]) { cur = byName.get(m[1]) || null; continue; }
      const chunk = m[2] !== undefined ? m[2] : `<${m[3]}>`;
      let text = '';
      for (const h of chunk.matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const hex = h[1];
        for (let i = 0; i + 1 < hex.length; i += 2) {
          text += (cur && cur.get(parseInt(hex.slice(i, i + 2), 16))) || '�';
        }
      }
      if (text.trim()) out.push(text);
    }
  }
  return out.join('\n');
}

// --- the footer ------------------------------------------------------------

// "Crumar Seven – Venice Grand CB1898 - Page 1/2". The dash before "Page" is
// sometimes missing its leading space, so it is optional.
const FOOTER = /Crumar Seven\s*[–-]\s*(.*?)\s*-?\s*Page/;

function nameIn(file) {
  const text = pdfText(file).replace(/\n/g, ' ');
  const m = FOOTER.exec(text);
  return m ? m[1].trim() : null;
}

// --- main ------------------------------------------------------------------

const files = process.argv.slice(2);
if (!files.length) {
  process.stdout.write(
    'Usage: node tools/expansion-readme-name.js <README.pdf> [more.pdf ...]\n\n' +
    'Prints the sound name each expansion will report, read from the PDF\n' +
    'footer. Add it to data/expansions.json as the entry\'s `sounds` list.\n'
  );
  process.exit(1);
}

let missed = 0;
for (const f of files) {
  let name = null;
  try {
    name = nameIn(f);
  } catch (err) {
    process.stdout.write(`${path.basename(f)}: could not read — ${err.message}\n`);
    missed += 1;
    continue;
  }
  if (name) process.stdout.write(`${path.basename(f)}\n  ${JSON.stringify(name)}\n`);
  else {
    // Say so plainly. A guess here becomes a catalogue entry that silently
    // never matches, which is the exact failure this tool exists to prevent.
    process.stdout.write(`${path.basename(f)}\n  NO FOOTER FOUND — do not guess a name\n`);
    missed += 1;
  }
}

process.stdout.write(
  '\nOne name per package unless the README describes more than one instrument;\n' +
  'Venice Upright U1/Felt is the only multi-sound download known. Until an\n' +
  'instrument that owns the set confirms it, this is a prediction — a good one\n' +
  '(4 for 4 on 2026-08-20, three of them blind), but the device is the source\n' +
  'of record.\n'
);
if (missed) process.exitCode = 1;
