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

const data = (...runs) => {
  const setlists = [].concat(...runs);
  return { patches: [], setlists };
};

test('the four per-bank setlists of one night are one run', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT)));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].date, '2026-08-12');
  assert.deepEqual(runs[0].banks.map((b) => b.bank), [1, 2, 3, 4], 'in bank order');
});

// The reversal of 2026-08-14. These runs are identical in contents and used to
// collapse into one dated span; a backup is an EVENT, and every one of them
// keeps its own line.
test('identical runs each keep their own row', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', EIGHT)));
  assert.equal(runs.length, 2, 'two nights, two rows');
  assert.deepEqual(runs.map((r) => r.date), ['2026-08-13', '2026-08-12'], 'newest first');
});

test('a run that differs keeps its own row too', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', MOVED)));
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => r.date), ['2026-08-13', '2026-08-12']);
});

test('every night is a row, whatever changed between them', () => {
  const runs = backupRuns(data(
    run('2026-08-12', EIGHT),
    run('2026-08-13', MOVED),
    run('2026-08-14', EIGHT)
  ));
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((r) => r.date), ['2026-08-14', '2026-08-13', '2026-08-12']);
});

test('a partial run is marked as one', () => {
  const runs = backupRuns(data(
    run('2026-08-12', EIGHT), run('2026-08-13', EIGHT, { partial: true })
  ));
  assert.equal(runs.length, 2);
  assert.equal(runs[0].partial, true, 'the newest was the cancelled one');
  assert.equal(runs[1].partial, false);
});

// A run's banks carry the setlist INDEX, which is what the row expands to and
// what Send uses. Grouping must not lose it.
test('a run remembers which setlist each bank is', () => {
  const runs = backupRuns(data(run('2026-08-12', EIGHT), run('2026-08-13', EIGHT)));
  const newest = runs[0];
  assert.deepEqual(newest.banks.map((b) => b.index), [4, 5, 6, 7],
    'the second run occupies the second four setlists');
  assert.deepEqual(runs[1].banks.map((b) => b.index), [0, 1, 2, 3]);
});
