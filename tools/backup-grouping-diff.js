'use strict';
// WHAT THE runId READ-FIX DID TO THE BACKUPS TAB — REPORT ONLY.
//
// readSetlists() dropped `runId` on every read from 2026-08-16 until
// 2026-11-16, so library-view's backupRuns always fell back to its
// date-plus-flag key even for setlists that carried one on disk. Keeping the
// field means that grouping can now use runId for the first time.
//
// NOTHING IS LOST EITHER WAY — the same setlists are in the same rows' worth
// of data. But a day that used to be ONE entry becoming three is a visible
// change with no visible cause, so it is asserted here rather than
// discovered.
//
// It runs backupRuns TWICE over the real library: once with runId stripped,
// which is exactly what the app saw before the fix, and once as it is now.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { backupRuns } = require('/Users/danielspils/crumar-seven-editor/src/library-view.js');

const dir = process.argv[2] || path.join(
  os.homedir(), 'Library', 'Application Support',
  'This Seven Goes to Eleven', 'Library'
);
const file = path.join(dir, 'setlists.json');
if (!fs.existsSync(file)) {
  console.log(`no setlists.json at ${file}`);
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const setlists = Array.isArray(raw.setlists) ? raw.setlists : [];
console.log(`library: ${dir}`);
console.log(`setlists on disk: ${setlists.length}`);
const withId = setlists.filter((s) => typeof s.runId === 'string').length;
console.log(`carrying a runId on disk: ${withId}`);

// BEFORE: what the app actually saw, because the reader threw runId away.
const before = backupRuns({ setlists: setlists.map(({ runId, ...rest }) => rest) });
// AFTER: the field survives the read.
const after = backupRuns({ setlists });

const describe = (runs) => runs.map((r) => ({
  key: r.key,
  date: r.date,
  partial: r.partial,
  banks: r.banks.map((b) => b.bank).join(''),
}));

const b = describe(before);
const a = describe(after);

console.log('');
console.log(`ENTRIES BEFORE the fix: ${b.length}`);
console.log(`ENTRIES AFTER  the fix: ${a.length}`);
console.log('');

if (b.length === a.length) {
  console.log('THE SAME NUMBER OF ENTRIES. The Backups tab groups this library');
  console.log('exactly as it did before, so nothing visible changed here.');
} else {
  console.log('THE GROUPING CHANGED. Rows before and after:');
}

const show = (label, list) => {
  console.log('');
  console.log(`${label}:`);
  for (const r of list) {
    console.log(`  ${String(r.date).padEnd(12)} banks ${r.banks.padEnd(4)}`
      + `${r.partial ? ' partial' : '        '}  key ${r.key}`);
  }
};
show('BEFORE', b);
show('AFTER', a);

// Which dates differ, named, so the answer is not just a count.
const byDate = (list) => {
  const m = new Map();
  for (const r of list) m.set(r.date, (m.get(r.date) || 0) + 1);
  return m;
};
const mb = byDate(b);
const ma = byDate(a);
const dates = [...new Set([...mb.keys(), ...ma.keys()])].sort();
const moved = dates.filter((d) => (mb.get(d) || 0) !== (ma.get(d) || 0));
console.log('');
if (!moved.length) {
  console.log('NO DATE CHANGED ITS NUMBER OF ENTRIES.');
} else {
  console.log('DATES WHOSE ENTRY COUNT CHANGED:');
  for (const d of moved) {
    console.log(`  ${d}: ${mb.get(d) || 0} -> ${ma.get(d) || 0}`);
  }
}
console.log('');
console.log('REPORTED ONLY. Nothing has been changed.');
