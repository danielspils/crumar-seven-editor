'use strict';

// Removes the demo patches that 1.0 shipped by mistake.
//
// WHY THIS IS NOT "DELETING SOMEONE'S FILES". Those 32 patches were never the
// user's — they arrived with the app, two of them naming sounds no Seven has
// ever had ("Steinway D Berlin", "Fazioli F308"), and the first user report of
// 1.0.0 was somebody hunting Crumar's site for a download that cannot exist.
// Worse, they were sendable: a new owner who had backed up nothing could push
// fiction into a preset they had no copy of. Cleaning that up is finishing the
// bug fix, not editing a library (Daniel, 2026-08-17).
//
// THE RULE THAT KEEPS IT HONEST: only an EXACT match against the shipped
// fixture is removed — same name, same sound, same 110 values. Edit one value,
// rename it, duplicate it, and it is yours; it stays. Measured: 32/32
// identified on an untouched library, and an edited patch stops matching the
// moment it is saved.
//
// One exception, deliberately: a demo patch the user put in a setlist of their
// own stays too. Removing it would leave a hole in something they built, and
// the point of this is to remove what we left behind, not to break their work.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARKER = 'demo-cleanup-done.json';

// Identity of a patch as it was shipped: what it is called, what it plays, and
// every value. Nothing about the file — a rename alone must not disguise it,
// and a rename by the USER must.
function signature(name, soundName, params) {
  const values = Object.keys(params || {}).sort().map((k) => [k, params[k]]);
  return crypto.createHash('sha256')
    .update(JSON.stringify([name, soundName, values]))
    .digest('hex')
    .slice(0, 16);
}

function fixtureSignatures(fixture) {
  const sigs = new Set();
  for (const bank of (fixture && fixture.banks) || []) {
    for (const p of bank.patches || []) sigs.add(signature(p.name, p.soundName, p.params));
  }
  return sigs;
}

// The demo setlist goes with them: it referenced those files and nothing else,
// so leaving it behind means a setlist of eight holes. Only if untouched —
// same name, and every filled slot pointing at a patch we are removing.
const DEMO_SETLIST = 'Stage Setlist (demo)';

// `trash` puts a file where the app's own delete puts it — the Trash, not
// oblivion. Injected so this module stays free of Electron, and so a mistake
// here is recoverable by the person it happened to.
async function run({ store, fixture, userDataDir, trash, force = false }) {
  const markerPath = path.join(userDataDir, MARKER);
  if (!force && fs.existsSync(markerPath)) return { ran: false, removed: 0 };

  const sigs = fixtureSignatures(fixture);
  const result = { ran: true, removed: 0, keptEdited: 0, keptInSetlist: 0, setlistRemoved: false };

  let entries;
  try {
    entries = store.list({ skipMigration: true }).patches;
  } catch (err) {
    // A library we cannot read is one we must not touch.
    console.warn(`[demo-cleanup] could not read the library: ${err.message}`);
    return { ran: false, removed: 0, error: String(err.message || err) };
  }

  const setlists = store.readSetlists();
  const demoSetlistIndex = setlists.findIndex((s) => s && s.name === DEMO_SETLIST);
  // Which files a setlist the USER made points at. Those are spoken for.
  const spokenFor = new Set();
  setlists.forEach((s, i) => {
    if (i === demoSetlistIndex) return;
    for (const slot of (s && s.slots) || []) if (slot) spokenFor.add(slot);
  });

  const doomed = [];
  for (const entry of entries) {
    let patch;
    try {
      const parsed = store.readFile(entry.file);
      patch = parsed.library && parsed.library.patches[entry.patchIndex];
    } catch { continue; }        // unreadable: leave it exactly where it is
    if (!patch) continue;
    const sig = signature(patch.name, (patch.sound || {}).name, patch.params);
    if (!sigs.has(sig)) { result.keptEdited++; continue; }
    if (spokenFor.has(entry.file)) { result.keptInSetlist++; continue; }
    doomed.push(entry);
  }

  for (const entry of doomed) {
    try {
      await trash(store.absPath(entry.file));
      result.removed++;
    } catch (err) {
      console.warn(`[demo-cleanup] could not remove ${entry.file}: ${err.message}`);
    }
  }

  // The demo setlist, only if every filled slot was one of the removed files.
  if (demoSetlistIndex >= 0) {
    const removedFiles = new Set(doomed.map((e) => e.file));
    const slots = (setlists[demoSetlistIndex].slots || []).filter(Boolean);
    if (slots.length && slots.every((f) => removedFiles.has(f))) {
      try {
        store.deleteSetlist(demoSetlistIndex);
        result.setlistRemoved = true;
      } catch (err) {
        console.warn(`[demo-cleanup] could not remove the demo setlist: ${err.message}`);
      }
    }
  }

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      at: new Date().toISOString(), ...result,
    }, null, 2)}\n`);
  } catch (err) {
    console.warn(`[demo-cleanup] could not write the marker: ${err.message}`);
  }
  return result;
}

module.exports = { run, signature, fixtureSignatures, MARKER, DEMO_SETLIST };
