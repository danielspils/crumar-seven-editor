'use strict';

// Pin each global option to its index, by watching the instrument.
//
//   node tools/pin-globals.js
//
// The nine glb slots are addressed 1:1 (verified sweep), but WHICH setting each
// index is has only been pinned for three of them — 2 = Send CC, 3 = Send PC,
// 8 = Memory Protect — against the manufacturer editor's display. The other six
// follow that editor's page order, which is an assumption, and docs/protocol.md
// keeps `orderUnverified` because of it. The app refuses to write an index whose
// meaning is a guess, so those six are read-only in Settings.
//
// This closes that the only way the project allows: by asking the device. It
// reads the globals, waits while you change ONE setting on the instrument (or
// in the manufacturer's editor), reads again, and reports which slot moved and
// to what value. Repeat per field and every name is pinned by observation.
//
// It never writes. The only frame it sends is 0x32, get-globals.
//
// What comes out is two facts per field, both worth having:
//   - the INDEX, from which slot moved;
//   - the VALUE, from the number it moved to, against the label you set it to —
//     the encoding is per-field and partly unknown ("Ch. 1" reads as 1), so a
//     dropdown in our Settings needs these pairs before it can exist.

const readline = require('node:readline');
const path = require('node:path');
const os = require('node:os');
const { SevenMidi } = require('../src/seven-midi');

const ask = (rl, q) => new Promise((resolve) => rl.question(q, resolve));

const diff = (before, after) =>
  before
    .map((v, i) => ({ index: i, from: v, to: after[i] }))
    .filter((d) => d.from !== d.to);

(async () => {
  const midi = new SevenMidi({ userDataDir: os.tmpdir() });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pinned = [];

  try {
    process.stdout.write('Connecting…\n');
    await midi.connect();
    process.stdout.write(`Connected — ${midi.firmware || 'unknown firmware'}\n\n`);

    let before = (await midi.readGlobals()).glb;
    process.stdout.write(`glb = [${before.join(', ')}]\n\n`);
    process.stdout.write(
      'Change ONE setting at a time on the Seven (or in the manufacturer\'s editor),\n' +
      'then come back here and type what you set it to — e.g. "Velocity Curve = Hard".\n' +
      'Blank line to finish.\n\n'
    );

    for (;;) {
      const said = (await ask(rl, 'what you changed › ')).trim();
      if (!said) break;
      const after = (await midi.readGlobals()).glb;
      const moved = diff(before, after);
      if (!moved.length) {
        process.stdout.write('  nothing moved — did the change land on the instrument?\n');
        continue;
      }
      if (moved.length > 1) {
        process.stdout.write(
          `  ${moved.length} slots moved, so this cannot pin a name. ` +
          'Change one setting at a time.\n'
        );
      }
      for (const m of moved) {
        process.stdout.write(`  glb[${m.index}]: ${m.from} → ${m.to}   ← ${said}\n`);
        pinned.push({ said, ...m });
      }
      before = after;
    }

    if (pinned.length) {
      process.stdout.write('\n--- for docs/protocol.md ---\n');
      for (const p of pinned) {
        process.stdout.write(`glb[${p.index}] = ${p.said}  (value ${p.from} → ${p.to})\n`);
      }
      process.stdout.write(
        '\nThese are observations, not a mapping yet: a slot is pinned when the name you\n' +
        'typed matches the control you actually moved. Copy them into protocol.md with\n' +
        'the date, and only then may the app write those indexes.\n'
      );
    }
  } catch (err) {
    process.stderr.write(`\n${err.message || err}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    try { await midi.disconnect(); } catch { /* already gone */ }
  }
})();
