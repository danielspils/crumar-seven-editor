'use strict';
// ORPHANED BACKUP RECORDS — REPORT ONLY. Deletes nothing, merges nothing,
// writes nothing.
//
// WHAT AN ORPHAN IS HERE. Until 16 Nov 2026 a backup run named its setlists
// after the DATE alone, and createOrReplaceSetlist replaces by name — so two
// runs on one day produced one entry, the second overwriting the first run's
// four setlists and repointing them at its own patch files.
//
// Patch files are written with uniqueFile(), so nothing was deleted. But a
// slot that CHANGED between two same-day runs left the first run's version on
// disk referenced by no setlist — and the Backups tab is built entirely from
// setlists matching BACKUP_NAME, so those records are unreachable in the UI.
// Invisible rather than gone.
//
// THIS COUNTS THEM. A backup patch (origin.kind === 'backup') that no setlist
// points at is an orphan.
//
// READ-ONLY BY CONSTRUCTION: it opens files and prints. There is no write
// path in this file at all, which is the point — the question "how many" must
// not be answerable only by something that could also tidy them up.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dir = process.argv[2] || path.join(
  os.homedir(), 'Library', 'Application Support',
  'This Seven Goes to Eleven', 'Library'
);

if (!fs.existsSync(dir)) {
  console.log(`no library at ${dir}`);
  process.exit(0);
}
console.log(`library: ${dir}`);

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sevenlib.json'));
const setlistsPath = path.join(dir, 'setlists.json');
let setlists = [];
try {
  setlists = JSON.parse(fs.readFileSync(setlistsPath, 'utf8'));
  if (!Array.isArray(setlists)) setlists = setlists.setlists || [];
} catch (err) {
  console.log(`could not read setlists.json: ${err.message}`);
}

// Every filename any setlist points at, backup or hand-made. A patch is only
// an orphan if NOTHING references it.
const referenced = new Set();
for (const s of setlists) {
  for (const slot of (s.slots || [])) {
    if (typeof slot === 'string' && slot) referenced.add(slot);
    else if (slot && typeof slot.file === 'string') referenced.add(slot.file);
  }
}

const BACKUP_NAME = /^Bank ([1-4]) setlist \((\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?(, (?:partial|failed))?\)$/;
const backupSetlists = setlists.filter((s) => BACKUP_NAME.test(s.name || ''));
console.log(`setlists: ${setlists.length} (${backupSetlists.length} are backup setlists)`);
console.log(`patch files: ${files.length}`);
console.log(`files referenced by some setlist: ${referenced.size}`);

const orphans = [];
for (const f of files) {
  if (referenced.has(f)) continue;
  let patch = null;
  try {
    patch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch {
    continue;                       // unreadable: not this tool's business
  }
  const origin = (patch && patch.origin) || (patch && patch.patches
    && patch.patches[0] && patch.patches[0].origin) || null;
  if (origin && origin.kind === 'backup') {
    orphans.push({
      file: f,
      bank: origin.bank,
      preset: origin.preset,
      date: origin.date || '(no date)',
    });
  }
}

console.log('');
if (!orphans.length) {
  console.log('NO ORPHANED BACKUP RECORDS. Every backup patch on disk is');
  console.log('reachable from a setlist, so nothing has been made invisible.');
} else {
  console.log(`ORPHANED BACKUP RECORDS: ${orphans.length}`);
  console.log('(on disk, reachable from no setlist, so absent from the Backups tab)');
  console.log('');
  orphans.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const o of orphans) {
    console.log(`  ${String(o.date).padEnd(12)} Bank ${o.bank} Preset ${o.preset}  ${o.file}`);
  }
  console.log('');
  console.log('REPORTED ONLY. Nothing has been deleted, merged or rewritten.');
}
