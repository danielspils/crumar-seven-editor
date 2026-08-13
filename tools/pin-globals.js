'use strict';

// Re-pin the nine global options against the instrument.
//
//   node tools/pin-globals.js
//
// The globals were fully pinned on FW 1.37 (2026-08-12) and the results are in
// docs/protocol.md and schema/seven-1.37.json. This tool exists for the day
// that stops being true: a new firmware may reorder the page, add an entry, or
// change what a value means, and **every one of those tables becomes
// unverified again**. Nothing here is needed while 1.37 is what you are on.
//
// It never writes. The only frame it sends is 0x32, get-globals.
//
// ---------------------------------------------------------------------------
// The method, because half of it is not on the wire
// ---------------------------------------------------------------------------
//
// The wire gives you two things and withholds the third:
//
//   INDEX  — which slot a field is. Change one field on the panel and exactly
//            one slot moves. That is what this tool watches for.
//   RANGE  — how many values a field has. Cycle it until it wraps.
//   LABEL  — what a value is CALLED. Not available at any opcode. The 0x33
//            reply is a bare comma list (`glb=0,1,1,1,0,1,0,1,0`) with no
//            field names and no value names, unlike parameters, where the
//            device hands over its own display string.
//
// So the labels come from OPENING EACH DROPDOWN ON THE PANEL AND PHOTOGRAPHING
// IT. Every shot carries a checkmark on the value the wire has just told you
// the field is holding, and that checkmark pins the rest of the list by
// position. Do not skip this and read the labels off the list order alone.
//
// Two traps that cost real time in 2026-08-12, both invisible without the
// photographs:
//
//   * CHANNELS ARE 0-BASED. glb[0] = 0 displays "Ch. 1". An earlier note in
//     this repo claimed the opposite; a dropdown built on it is one channel
//     off on every entry.
//   * SEND CC AND SEND PC LIST THEIR VALUES BACKWARDS. Both dropdowns put
//     "Yes" above "No" while Yes is 1 — the only two fields on the page whose
//     list order is not value order. Derive them from position and both
//     switches come out inverted.
//
// And one the sampler taught: a poll can miss a step. It caught a field going
// 10 -> 12 in a single sample, so a wrap from 15 -> 0 was NOT evidence that 15
// was the top. Where the sampler cannot tell two explanations apart, open the
// dropdown and count.
//
// ---------------------------------------------------------------------------
// How to run it
// ---------------------------------------------------------------------------
//
//   1. Start this, leave it running.
//   2. Work down the panel's GLOBAL OPTIONS page, ONE field at a time. Cycle
//      each field all the way round until it wraps back to where it started.
//   3. Watch this print each move. One field should move one slot; if two
//      slots move at once you changed two things and that pins nothing.
//   4. Photograph every dropdown open, then leave every field as you found it.
//   5. Ctrl-C. The summary prints each slot's index, the range seen, and where
//      it started and ended — so you can check you put everything back.

const os = require('node:os');
const { SevenMidi, GLB_FIELDS } = require('../src/seven-midi');

const POLL_MS = 1200;

const nameOf = (i) => (GLB_FIELDS[i] ? GLB_FIELDS[i].name : `glb ${i}`);
// Only as a hint. On a new firmware these are the OLD firmware's labels, which
// is exactly the assumption this tool exists to retest — so they are marked.
const hintOf = (i, v) => {
  const f = GLB_FIELDS[i];
  const label = f && f.labels ? f.labels[v] : undefined;
  return label === undefined ? '' : `  (1.37 called this "${label}")`;
};

(async () => {
  const midi = new SevenMidi({ userDataDir: os.tmpdir() });
  process.stdout.write('Connecting…\n');
  await midi.connect();
  process.stdout.write(`Connected — ${midi.firmware || 'unknown firmware'}\n\n`);

  const start = (await midi.readGlobals()).glb;
  let prev = start.slice();
  const seen = start.map((v) => new Set([v]));
  let moves = 0;

  process.stdout.write(`glb = [${start.join(', ')}]\n\n`);
  process.stdout.write(
    'Change ONE field at a time on the panel and cycle it until it wraps.\n' +
    'Photograph each dropdown open — the labels are not on the wire.\n' +
    'Ctrl-C when you are done and everything is back as you found it.\n\n'
  );

  const summary = () => {
    const now = prev;
    process.stdout.write('\n\n--- what the wire showed ---\n');
    for (let i = 0; i < now.length; i++) {
      const vals = [...seen[i]].sort((a, b) => a - b);
      const swept = vals.length > 1
        ? `range ${vals[0]}–${vals[vals.length - 1]} (${vals.length} value${vals.length > 1 ? 's' : ''} seen)`
        : 'not moved';
      const back = now[i] === start[i] ? '' : `  ** LEFT AT ${now[i]}, STARTED AT ${start[i]} **`;
      process.stdout.write(`glb[${i}] ${nameOf(i).padEnd(16)} ${swept}${back}\n`);
    }
    process.stdout.write(
      '\nA range here is what the SAMPLER saw, which is a floor and not a count —\n' +
      'it can miss a step. Confirm each length by opening the dropdown, and take\n' +
      'the labels from the photographs. Only then write to docs/protocol.md and\n' +
      'schema/seven-1.37.json (or the new firmware\'s file), with the date.\n'
    );
  };

  let stopping = false;
  process.on('SIGINT', async () => {
    if (stopping) process.exit(1);
    stopping = true;
    summary();
    try { await midi.disconnect(); } catch { /* already gone */ }
    process.exit(0);
  });

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (stopping) return;
    let now;
    try { now = (await midi.readGlobals()).glb; } catch { continue; }
    const moved = [];
    for (let i = 0; i < now.length; i++) {
      if (now[i] !== prev[i]) { moved.push(i); seen[i].add(now[i]); }
    }
    if (moved.length > 1) {
      process.stdout.write(
        `  ${moved.length} slots moved together — that pins nothing. One field at a time.\n`
      );
    }
    for (const i of moved) {
      moves += 1;
      process.stdout.write(
        `glb[${i}] ${prev[i]} -> ${now[i]}   ${nameOf(i)}${hintOf(i, now[i])}\n`
      );
    }
    prev = now;
  }
})().catch((e) => { process.stderr.write(`\n${e.message || e}\n`); process.exitCode = 1; });
