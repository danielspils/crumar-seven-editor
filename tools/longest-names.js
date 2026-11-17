'use strict';
// THE LONGEST PATCH NAMES IN THE LIVE LIBRARY — REPORT ONLY.
//
// Item 11 reserved a column for the setlist slot controls, which narrowed the
// name column from 247px to 153px at the default pane width. The trade is
// accepted; this is the eyeball check that would otherwise be done by hand.
//
// IT ESTIMATES A WIDTH RATHER THAN MEASURING ONE. There is no browser here,
// so this cannot be the last word — a scenario in the real window is. What it
// is for is finding WHICH names are worth looking at, out of sixty-odd.
//
// The factor is taken from a real measurement rather than invented: the slot
// row renders at 13px in the app's UI face, and "Missing file:
// shapes-clav-3-2" measured 229.3px for 29 characters — 7.9px per character
// including the spaces. Proportional type makes that an average, so a name of
// narrow letters will fit where this says it does not.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dir = process.argv[2] || path.join(
  os.homedir(), 'Library', 'Application Support',
  'This Seven Goes to Eleven', 'Library'
);
const COLUMN_PX = Number(process.argv[3] || 153);
const PX_PER_CHAR = 7.9;

if (!fs.existsSync(dir)) {
  console.log(`no library at ${dir}`);
  process.exit(0);
}

const names = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sevenlib.json'))) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const list = Array.isArray(p.patches) ? p.patches : [p];
    for (const one of list) {
      if (one && typeof one.name === 'string') names.push({ name: one.name, file: f });
    }
  } catch { /* unreadable: not this tool's business */ }
}

names.sort((a, b) => b.name.length - a.name.length);
// TAKES THE STRING, and it was taking the object — `n.length` was undefined,
// `undefined * 7.9` is NaN, `NaN <= 153` is false, and so every one of 63
// names reported as truncating, including "Rhodes" at six characters. A
// comparison against NaN is always false, which is how a filter inverts
// itself without erroring.
const fits = (name) => name.length * PX_PER_CHAR <= COLUMN_PX;
const chars = Math.floor(COLUMN_PX / PX_PER_CHAR);

console.log(`library: ${dir}`);
console.log(`patch names: ${names.length}`);
console.log(`column: ${COLUMN_PX}px, about ${chars} characters at ${PX_PER_CHAR}px each`);
console.log('');
console.log('THE LONGEST TWELVE:');
for (const n of names.slice(0, 12)) {
  const w = Math.round(n.name.length * PX_PER_CHAR);
  console.log(`  ${String(n.name.length).padStart(3)} chars  ~${String(w).padStart(4)}px`
    + `  ${fits(n.name) ? '   ' : 'CUT'}  ${n.name}`);
}

const cut = names.filter((n) => !fits(n.name));
console.log('');
console.log(`NAMES THAT WOULD TRUNCATE AT ${COLUMN_PX}px: ${cut.length} of ${names.length}`);
if (cut.length) {
  console.log('');
  for (const n of cut) {
    // What a reader would still see, as an end-truncation — the patch name
    // uses text-overflow, not the middle truncation the missing-file row got.
    console.log(`  "${n.name}"  ->  "${n.name.slice(0, Math.max(0, chars - 1))}…"`);
  }
}
console.log('');
console.log('REPORTED ONLY. Nothing has been changed.');
