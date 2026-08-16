'use strict';

const test = require('node:test');
const assert = require('node:assert');
const SevenLibraryView = require('../src/library-view.js');
const { backupRuns } = SevenLibraryView;

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

// --- the Patches tab shows current state ------------------------------------
//
// A slot backed up five times leaves five records on disk, all generated from
// the same slot and sound, told apart only by a date. "From the Seven" answers
// "what is on my instrument", so it carries the newest record per slot — at
// most 32 rows — and the older ones stay on disk, reachable through Backups.

const capture = (bank, preset, date, name) => ({
  file: `b${bank}p${preset}-${date}.sevenlib.json`,
  patchIndex: 0,
  name,
  soundName: 'Tine Piano',
  params: {},
  origin: { kind: 'backup', bank, preset, date },
});

test('“From the Seven” lists the newest record per slot, not every capture', () => {
  const patches = [
    capture(3, 1, '2026-08-09T10:00:00Z', 'Bank 3 Preset 1 — Tine Piano'),
    capture(3, 1, '2026-08-12T10:00:00Z', 'Bank 3 Preset 1 — Tine Piano'),
    capture(3, 1, '2026-08-16T10:00:00Z', 'Kitchen Dishes Delay'),
    capture(3, 2, '2026-08-16T10:00:00Z', 'Bank 3 Preset 2 — Tine Piano'),
    { file: 'mine.sevenlib.json', patchIndex: 0, name: 'My Patch', soundName: 'Tine Piano',
      params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
  ];
  const html = SevenLibraryView.renderBody(
    { patches, setlists: [], files: patches.length },
    { tab: 'patches', patchScope: 'seven', search: '' }
  );
  const rows = (html.match(/class="lib-row lib-patch/g) || []).length;
  assert.strictEqual(rows, 2, 'two slots, two rows — not four captures');
  assert.ok(html.includes('Kitchen Dishes Delay'), 'the newest record for the slot');
  assert.ok(!html.includes('>Bank 3 Preset 1 — Tine Piano<'), 'and not the superseded ones');
});

test('a superseded capture is not counted in any scope', () => {
  const patches = [
    capture(3, 1, '2026-08-09T10:00:00Z', 'old'),
    capture(3, 1, '2026-08-16T10:00:00Z', 'new'),
  ];
  for (const scope of ['seven', 'all']) {
    const html = SevenLibraryView.renderBody(
      { patches, setlists: [], files: 2 }, { tab: 'patches', patchScope: scope, search: '' }
    );
    assert.strictEqual((html.match(/class="lib-row lib-patch/g) || []).length, 1, scope);
  }
});

test('patch rows carry no date — this list is current state', () => {
  const patches = [
    capture(3, 1, '2026-08-16T10:00:00Z', 'Bank 3 Preset 1 — Tine Piano'),
    { file: 'mine.sevenlib.json', patchIndex: 0, name: 'My Patch', soundName: 'Tine Piano',
      params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
  ];
  const html = SevenLibraryView.renderBody(
    { patches, setlists: [], files: 2 }, { tab: 'patches', patchScope: 'all', search: '' }
  );
  assert.ok(!/backed up/.test(html), 'no "backed up …" on a row');
  assert.ok(!/created \d|created (a|an|one) /i.test(html), 'and no "created …" either');
});

// --- a slot is a position, not a patch --------------------------------------
//
// A setlist may hold the same file in several slots. Keying selection on the
// patch highlighted every slot that shared it and loaded the first: arrow-down
// from slot 6 lit 5 AND 7 and opened 5 (Daniel, 2026-08-16).

const twiceSetlist = {
  patches: [
    { file: 'commander.sevenlib.json', patchIndex: 0, name: 'Commander Piano w/ pad',
      soundName: 'Tine Piano', params: {}, origin: { kind: 'created', date: '2026-08-01T00:00:00Z' } },
    { file: 'felt.sevenlib.json', patchIndex: 0, name: 'Felt Piano',
      soundName: 'Tine Piano', params: {}, origin: { kind: 'created', date: '2026-08-01T00:00:00Z' } },
  ],
  setlists: [{
    name: 'Gig',
    slots: [null, null, null, null, 'commander.sevenlib.json', 'felt.sevenlib.json',
      'commander.sevenlib.json', null],
  }],
  files: 2,
};

const litSlots = (html) =>
  [...html.matchAll(/class="lib-slot lib-slot-patch selected[^"]*"[^>]*data-slot="(\d+)"/g)]
    .map((m) => Number(m[1]));

test('only the selected SLOT highlights, even when another holds the same file', () => {
  for (const slot of [4, 6]) {
    const html = SevenLibraryView.renderBody(twiceSetlist, {
      tab: 'setlists', setlistIndex: 0, selectedSlot: slot,
      selected: 'commander.sevenlib.json 0', search: '',
    });
    assert.deepStrictEqual(litSlots(html), [slot], `slot ${slot} alone`);
  }
});

test('with no slot selected, no slot is lit — identity alone never selects one', () => {
  const html = SevenLibraryView.renderBody(twiceSetlist, {
    tab: 'setlists', setlistIndex: 0, selected: 'commander.sevenlib.json 0',
    selectedSlot: null, search: '',
  });
  assert.deepStrictEqual(litSlots(html), []);
});

// --- one row per RUN, not per day -------------------------------------------

const bankSetlist = (bank, date, filled, { partial = false, runId = null } = {}) => ({
  name: `Bank ${bank} setlist (${date}${partial ? ', partial' : ''})`,
  slots: Array.from({ length: 8 }, (_, i) => (i < filled ? `b${bank}s${i}.json` : null)),
  ...(runId ? { runId } : {}),
});

// The badge carries attributes when it is the impossible-count one, so the
// match has to allow them.
const runCounts = (html) =>
  [...html.matchAll(/class="lib-setlist-count[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);

test('an aborted run and its retry are two rows, not one 37-preset row', () => {
  const setlists = [
    bankSetlist(1, '2026-08-16', 8), bankSetlist(2, '2026-08-16', 8),
    bankSetlist(3, '2026-08-16', 8), bankSetlist(4, '2026-08-16', 8),
    bankSetlist(1, '2026-08-16', 5, { partial: true }),
  ];
  const html = SevenLibraryView.renderBody({ patches: [], setlists, files: 0 },
    { tab: 'backups', search: '' });
  assert.deepStrictEqual(runCounts(html), ['5 presets · partial', '32 presets']);
});

test('a runId groups exactly, even for two runs of the same shape on one day', () => {
  const setlists = [
    bankSetlist(1, '2026-08-17', 8, { runId: '2026-08-17T09:00:00Z' }),
    bankSetlist(1, '2026-08-17', 8, { runId: '2026-08-17T21:00:00Z' }),
  ];
  // Same name, so only a runId can tell them apart.
  setlists[1].name = 'Bank 2 setlist (2026-08-17)';
  const html = SevenLibraryView.renderBody({ patches: [], setlists, files: 0 },
    { tab: 'backups', search: '' });
  assert.deepStrictEqual(runCounts(html), ['8 presets', '8 presets'], 'two runs, two rows');
});

test('a count above 32 is never rendered — it means two runs were merged', () => {
  // Forced: two runs sharing a runId, which cannot happen but must not print
  // an impossible number if it ever does.
  const id = '2026-08-18T10:00:00Z';
  const setlists = [
    bankSetlist(1, '2026-08-18', 8, { runId: id }), bankSetlist(2, '2026-08-18', 8, { runId: id }),
    bankSetlist(3, '2026-08-18', 8, { runId: id }), bankSetlist(4, '2026-08-18', 8, { runId: id }),
    { ...bankSetlist(1, '2026-08-18', 5, { runId: id }), name: 'Bank 1 setlist (2026-08-18)' },
  ];
  const html = SevenLibraryView.renderBody({ patches: [], setlists, files: 0 },
    { tab: 'backups', search: '' });
  const counts = runCounts(html);
  assert.strictEqual(counts.length, 1);
  assert.strictEqual(counts[0], '32+', 'the row says what it can say');
  assert.ok(!/\d+ presets/.test(counts[0]), 'no impossible number on screen');
  // The real computed count rides on the badge, for the explanation to use —
  // never a constant, so the modal can say "37" without anyone typing 37.
  assert.match(html, /data-over-count="37"/);
  assert.match(html, /role="button"/, 'and it asks to be clicked');
});
