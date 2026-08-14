'use strict';

// Derive per-sound factory values from Bank 1 and write
// schema/factory-defaults-<firmware>.json.
//
//   node tools/extract-factory-defaults.js [--library <dir>] [--write]
//
// Without --write it prints what it would emit and changes nothing.
//
// ---------------------------------------------------------------------------
// Why Bank 1 is evidence
// ---------------------------------------------------------------------------
//
// There is no factory-default opcode and no default field anywhere in the
// protocol. The schema's `value` came from 0x15 and was the CURRENT value at
// query time, not a factory one — so until now the app compared every
// parameter against `min(64, param.max)`, a guess.
//
// Bank 1 is the one place the factory's own numbers are readable: **the Seven
// does not accept a store into Bank 1** (owner-confirmed 2026-08-13), so its
// eight presets are what shipped. Backing them up reads them off the
// instrument like any other slot.
//
// The backup runner dedupes by hash(sound+params), so a Bank 1 slot whose
// stored file is still referenced by the NEWEST run is a slot that read back
// identical this run — that is the freshness check, and this tool refuses to
// run against anything but the newest Bank 1 setlist for exactly that reason.
//
// ---------------------------------------------------------------------------
// What this is NOT
// ---------------------------------------------------------------------------
//
// A factory PRESET is not a factory DEFAULT. The people who made the Tine
// Piano moved knobs deliberately; those positions are what the sound is. So
// "at its factory value" here means "the same as the factory preset for this
// sound", which is the useful comparison for an editor — did I change this? —
// and it is not a claim about some neutral origin the instrument reverts to.
//
// Coverage is partial and stays that way. Bank 1 holds eight presets, so eight
// sounds get real numbers; every other sound has none and the app falls back
// to the heuristic WITHOUT claiming it is a default (see src/defaults.js).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const args = process.argv.slice(2);
const write = args.includes('--write');
const libArg = args.indexOf('--library');

const defaultLibrary = () => {
  const app = 'Crumar Seven Editor';
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', app, 'library');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), app, 'library');
  }
  return path.join(os.homedir(), '.config', app, 'library');
};

const LIB = libArg >= 0 ? args[libArg + 1] : defaultLibrary();
const ROOT = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'seven-1.37.json'), 'utf8'));
const FW = schema.firmware || '1.37';
const paramKeys = new Set(schema.parameters.map((p) => p.key));

const die = (msg) => { process.stderr.write(`${msg}\n`); process.exit(1); };

if (!fs.existsSync(LIB)) die(`No library at ${LIB}\nRun a backup first, or pass --library <dir>.`);

const setlistsFile = path.join(LIB, 'setlists.json');
if (!fs.existsSync(setlistsFile)) die(`No setlists.json in ${LIB}`);
const raw = JSON.parse(fs.readFileSync(setlistsFile, 'utf8'));
const setlists = raw.setlists || raw;

// Newest Bank 1 run only. An older one may name files that have since been
// edited, and a partial run never had all eight slots.
const BANK1 = /^Bank 1 setlist \((\d{4}-\d{2}-\d{2})\)$/;
const runs = setlists
  .map((s) => ({ s, m: BANK1.exec(s.name || '') }))
  .filter((x) => x.m)
  .sort((a, b) => (a.m[1] < b.m[1] ? -1 : 1));
if (!runs.length) die('No complete Bank 1 setlist in the library. Run a backup with the Seven attached.');
const run = runs[runs.length - 1];
const runDate = run.m[1];

const sounds = {};
const slots = [];
let skipped = 0;

run.s.slots.forEach((file, i) => {
  if (!file) { skipped += 1; return; }
  const full = path.join(LIB, file);
  if (!fs.existsSync(full)) { skipped += 1; return; }
  const container = JSON.parse(fs.readFileSync(full, 'utf8'));
  const patch = (container.patches || [])[0];
  if (!patch || !patch.sound || !patch.params) { skipped += 1; return; }
  const name = patch.sound.name;

  // Two Bank 1 slots on the same sound would each claim to be its factory
  // value. Record the first and say so rather than letting slot order decide
  // silently.
  if (sounds[name]) {
    process.stdout.write(
      `  note: Bank 1 preset ${i + 1} is also “${name}” — keeping preset ` +
      `${slots.find((s) => s.sound === name).preset}, ignoring this one\n`
    );
    return;
  }

  const vals = {};
  for (const [k, v] of Object.entries(patch.params)) {
    if (paramKeys.has(k) && typeof v === 'number') vals[k] = v;
  }
  sounds[name] = vals;
  slots.push({ preset: i + 1, sound: name, file, params: Object.keys(vals).length });
});

const out = {
  firmware: FW,
  what: 'The factory value of each parameter, per sound, read off Bank 1.',
  why: 'The protocol has no factory-default opcode and the schema carries no default. '
    + 'Bank 1 cannot be stored to, so its eight presets are what the instrument shipped with — '
    + 'the only readable factory numbers on the device.',
  method: `Backed up from the instrument on FW ${FW} and extracted by tools/extract-factory-defaults.js. `
    + 'The backup dedupes by hash(sound+params), so these slots reading back to the same stored files '
    + 'is itself the check that they still match the instrument.',
  notADefault: 'A factory PRESET is not a neutral default. These are the positions the factory chose for '
    + 'each sound, which is the right comparison for "did I change this?" and is not a claim about any '
    + 'origin the instrument reverts to.',
  coverage: 'Eight sounds — the eight Bank 1 holds. Every other sound has no factory evidence and the app '
    + 'must not mark anything as default for it (src/defaults.js returns null).',
  derivedFrom: { setlist: run.s.name, date: runDate, slots },
  sounds,
};

const dest = path.join(ROOT, 'schema', `factory-defaults-${FW}.json`);
process.stdout.write(`\nBank 1 setlist (${runDate}) — ${slots.length} of 8 slots read`);
process.stdout.write(skipped ? `, ${skipped} skipped\n` : '\n');
for (const s of slots) process.stdout.write(`  preset ${s.preset}  ${s.sound.padEnd(24)} ${s.params} params\n`);

if (!write) {
  process.stdout.write(`\nWould write ${path.relative(ROOT, dest)}. Re-run with --write.\n`);
} else {
  fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`\nWrote ${path.relative(ROOT, dest)}\n`);
}
