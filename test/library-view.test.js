'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { backupRuns } = require('../src/library-view.js');

// A backup run is stored as four per-bank setlists sharing a date. These build
// that shape so the tests read as what the library actually holds.
const run = (date, slots, { partial = false } = {}) =>
  [1, 2, 3, 4].map((bank) => ({
    name: `Bank ${bank} setlist (${date}${partial ? ', partial' : ''})`,
    slots: slots.map((f) => (f === null ? null : `${f}-b${bank}.json`)),
  }));

const EIGHT = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const MOVED = ['a', 'b', 'X', 'd', 'e', 'f', 'g', 'h'];

// Slots are compared by CONTENTS, so the patches list has to be present for
// the signature to see anything. Every file here holds the same patch unless a
// test says otherwise.
const patchesFor = (setlists, overrides = {}) => {
  const files = new Set();
  for (const s of setlists) for (const f of s.slots) if (f) files.add(f);
  return [...files].map((file) => ({
    file,
    name: file,
    soundName: overrides[file] ? overrides[file].soundName : 'Tine Piano',
    // Distinct per file NAME STEM, so "slot c holds patch c" and swapping in
    // patch X is a real change. Files that differ only by a recapture suffix
    // (a- -> a-recaptured-) share a stem and so share contents, which is
    // exactly the case the contents signature exists to see through.
    params: overrides[file] ? overrides[file].params
      : { rho_atk: file.charCodeAt(0), rho_dec: 32 },
  }));
};

const data = (...runs) => {
  const setlists = [].concat(...runs);
  return { patches: patchesFor(setlists), setlists };
};

test('a lone run is a one-day span', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT)));
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].dates, ['2026-08-12']);
  assert.equal(runs[0].since, '2026-08-12');
});

test('two identical runs collapse into one span, newest first', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', EIGHT)));
  assert.equal(runs.length, 1, 'identical runs share a row');
  // The representative is the NEWEST: its bank indices are what the row
  // expands to, and newest is the one certainly still true.
  assert.equal(runs[0].date, '2026-08-13');
  assert.equal(runs[0].since, '2026-08-12');
  assert.deepEqual(runs[0].dates, ['2026-08-13', '2026-08-12']);
});

test('a run that differs keeps its own row', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', MOVED)));
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => r.date), ['2026-08-13', '2026-08-12']);
});

// The rule the whole thing turns on. A change and a change BACK are two
// separate spans: merging them would put one row over a stretch during which
// the instrument held something else entirely.
test('a change and a change back do not merge across the change', () => {
  const runs = backupRuns(data(
    run('2026-08-12', EIGHT),
    run('2026-08-13', MOVED),
    run('2026-08-14', EIGHT)
  ));
  assert.equal(runs.length, 3, 'the two matching runs are not adjacent');
  assert.deepEqual(runs.map((r) => r.since), ['2026-08-14', '2026-08-13', '2026-08-12']);
});

test('three identical runs collapse to one span covering all of them', () => {
  const runs = backupRuns(data(
    run('2026-08-12', EIGHT), run('2026-08-13', EIGHT), run('2026-08-14', EIGHT)
  ));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].since, '2026-08-12');
  assert.equal(runs[0].date, '2026-08-14');
  assert.equal(runs[0].dates.length, 3, 'the trash icon needs every date in the span');
});

test('a partial run never merges with a complete one', () => {
  const runs = backupRuns(data(
    run('2026-08-12', EIGHT), run('2026-08-13', EIGHT, { partial: true })
  ));
  assert.equal(runs.length, 2, 'a partial run is a different kind of record');
  assert.equal(runs[0].partial, true);
});

test('an empty slot is part of the signature', () => {
  const withHole = [...EIGHT]; withHole[4] = null;
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', withHole)));
  assert.equal(runs.length, 2, 'a slot going empty is a change');
});

// The bug the contents signature exists for: delete a patch, back up again,
// and the slot points at a NEW FILE holding the same thing. The instrument did
// not change, so the two nights are one span.
test('the same patch under a different filename still merges', () => {
  const a = run('2026-08-12', EIGHT);
  const b = run('2026-08-13', EIGHT);
  // Rename one slot's file, as a delete-and-recapture does.
  b.forEach((s) => { s.slots[0] = s.slots[0].replace('a-', 'a-recaptured-'); });
  const setlists = [].concat(a, b);
  const runs = backupRuns({ patches: patchesFor(setlists), setlists });
  assert.equal(runs.length, 1, 'a renamed file is not a changed instrument');
  assert.equal(runs[0].since, '2026-08-12');
});

test('same filename but different values is still a change', () => {
  const a = run('2026-08-12', EIGHT);
  const b = run('2026-08-13', EIGHT);
  const setlists = [].concat(a, b);
  // Impossible via the runner (it would write a new file), but the signature
  // must not depend on that to be correct.
  const patches = patchesFor(setlists);
  const runs = backupRuns({ patches, setlists });
  assert.equal(runs.length, 1);
  patches[0].params = { rho_atk: 99, rho_dec: 32 };
  assert.equal(backupRuns({ patches, setlists }).length, 1,
    'both runs reference that same file, so both moved together');
});

test('a file the library no longer has is not treated as equal to anything', () => {
  const a = run('2026-08-12', EIGHT);
  const b = run('2026-08-13', EIGHT);
  b.forEach((s) => { s.slots[0] = s.slots[0].replace('a-', 'gone-'); });
  const setlists = [].concat(a, b);
  // Only the ORIGINAL files are in the library; the renamed ones are missing.
  const patches = patchesFor(a);
  const runs = backupRuns({ patches, setlists });
  assert.equal(runs.length, 2, 'unknown contents must not pass as a match');
});
