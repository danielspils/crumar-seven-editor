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
  // Newest first: the retry ran after the run that stopped.
  assert.deepStrictEqual(runCounts(html), ['32 presets', '5 presets · failed']);
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

test('each run row opens ITS run, not the first one sharing its date', () => {
  const setlists = [
    bankSetlist(1, '2026-08-16', 8), bankSetlist(2, '2026-08-16', 8),
    bankSetlist(3, '2026-08-16', 8), bankSetlist(4, '2026-08-16', 8),
    bankSetlist(1, '2026-08-16', 5, { partial: true }),
  ];
  const data = { patches: [], setlists, files: 0 };
  const keys = [...SevenLibraryView.renderBody(data, { tab: 'backups', search: '' })
    .matchAll(/data-backup="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(keys, ['2026-08-16', '2026-08-16|partial'],
    'two rows, two keys — a date alone could not tell them apart');

  const header = (key) => {
    const html = SevenLibraryView.renderBody(data, { tab: 'backups', backupRun: key, search: '' });
    return /lib-setlist-name">([^<]*)</.exec(html)[1];
  };
  assert.strictEqual(header('2026-08-16|partial'), '16 August · failed');
  assert.strictEqual(header('2026-08-16'), '16 August', 'the clean run opens as itself');
});

test('runs sort newest first, and a later run of the same day leads', () => {
  // Stamped: the retry started an hour after the aborted run, so it leads.
  const stamped = [
    bankSetlist(1, '2026-08-16', 5, { partial: true, runId: '2026-08-16T09:00:00Z' }),
    bankSetlist(1, '2026-08-16', 8, { runId: '2026-08-16T10:00:00Z' }),
    bankSetlist(2, '2026-08-16', 8, { runId: '2026-08-16T10:00:00Z' }),
  ];
  assert.deepStrictEqual(
    runCounts(SevenLibraryView.renderBody({ patches: [], setlists: stamped, files: 0 },
      { tab: 'backups', search: '' })),
    ['16 presets', '5 presets · failed']
  );

  // Unstamped, written before runIds existed: a partial run sorts last of the
  // two, which is the only case that can share a date.
  const legacy = [
    bankSetlist(1, '2026-08-16', 5, { partial: true }),
    bankSetlist(1, '2026-08-16', 8), bankSetlist(2, '2026-08-16', 8),
  ];
  assert.deepStrictEqual(
    runCounts(SevenLibraryView.renderBody({ patches: [], setlists: legacy, files: 0 },
      { tab: 'backups', search: '' })),
    ['16 presets', '5 presets · failed']
  );

  // And days still sort newest first.
  const days = [bankSetlist(1, '2026-08-12', 8), bankSetlist(1, '2026-08-16', 8)];
  const html = SevenLibraryView.renderBody({ patches: [], setlists: days, files: 0 },
    { tab: 'backups', search: '' });
  const names = [...html.matchAll(/lib-setlist-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['16 August Backup', '12 August Backup']);
});

// --- Patches is yours ------------------------------------------------------
//
// Only what you made in the app. Records captured from the instrument are its
// history and live in Backups, where position gives the slot (Daniel,
// 2026-08-16).

const captured = (name, bank, preset) => ({
  file: `${name.replace(/\W+/g, '-')}.sevenlib.json`,
  patchIndex: 0, name, soundName: 'Tine Piano', params: {},
  origin: { kind: 'backup', bank, preset, date: '2026-08-16T10:00:00Z', captured: '2026-08-16T10:00:00Z' },
});
const mine = (name, at) => ({
  file: `${name.replace(/\W+/g, '-')}.sevenlib.json`,
  patchIndex: 0, name, soundName: 'Clavi Piano', params: {},
  origin: { kind: 'created', date: at, captured: at },
});

test('captured records are not in Patches at all', () => {
  const patches = [
    captured('Bank 3 Preset 1 — Tine Piano', 3, 1),
    captured('Bank 1 Preset 4 — Clavi Piano', 1, 4),
    mine('Kitchen Dishes Delay', '2026-08-16T11:00:00Z'),
  ];
  const html = SevenLibraryView.renderBody({ patches, setlists: [], files: 3 },
    { tab: 'patches', search: '' });
  const names = [...html.matchAll(/class="patch-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['Kitchen Dishes Delay']);
  assert.ok(!/badge-factory/.test(html), 'and no factory badge — those records are elsewhere');
});

test('with no patches of your own, the empty state says where they come from', () => {
  const html = SevenLibraryView.renderBody(
    { patches: [captured('Bank 3 Preset 1 — Tine Piano', 3, 1)], setlists: [], files: 1 },
    { tab: 'patches', search: '' }
  );
  assert.match(html, /Patches you make live here — start one from Instruments, or duplicate a record from a backup\./);
});

test('your patches sort by what changed most recently', () => {
  const patches = [
    mine('Older', '2026-08-10T09:00:00Z'),
    mine('Newer', '2026-08-16T09:00:00Z'),
  ];
  const html = SevenLibraryView.renderBody({ patches, setlists: [], files: 2 },
    { tab: 'patches', search: '' });
  const names = [...html.matchAll(/class="patch-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['Newer', 'Older']);
});

// --- Backups is read-only, and the picker can reach it ----------------------

const runData = () => {
  const patches = [];
  for (let b = 1; b <= 2; b++) {
    for (let i = 0; i < 8; i++) {
      patches.push({
        file: `p${b}${i}.sevenlib.json`, patchIndex: 0,
        name: `Bank ${b} Preset ${i + 1} — Tine Piano`, soundName: 'Tine Piano', params: {},
        origin: { kind: 'backup', bank: b, preset: i + 1, date: '2026-08-16T10:00:00Z' },
      });
    }
  }
  patches.push({
    file: 'mine.sevenlib.json', patchIndex: 0, name: 'Kitchen Dishes Delay',
    soundName: 'Clavi Piano', params: {},
    origin: { kind: 'created', date: '2026-08-16T11:00:00Z' },
  });
  const setlist = (b) => ({
    name: `Bank ${b} setlist (2026-08-16)`,
    slots: Array.from({ length: 8 }, (_, i) => `p${b}${i}.sevenlib.json`),
  });
  return { patches, setlists: [setlist(1), setlist(2), { name: 'Gig', slots: Array(8).fill(null) }], files: 17 };
};

test('a record inside a backup offers Duplicate, never Delete', () => {
  const html = SevenLibraryView.renderBody(runData(),
    { tab: 'backups', backupRun: '2026-08-16', search: '' });
  assert.match(html, /data-duplicate-to-patches=/, 'duplicate is offered');
  assert.ok(!/data-patch-delete=/.test(html), 'and nothing there can be deleted');
  assert.ok(!/draggable="true"/.test(html), 'nor dragged into a new order');
});

test('search is hidden at the run list and present inside a run', () => {
  const data = runData();
  const list = SevenLibraryView.renderBody(data, { tab: 'backups', search: '' });
  assert.ok(!/lib-search/.test(list), 'nothing to search in a handful of runs');
  const run = SevenLibraryView.renderBody(data, { tab: 'backups', backupRun: '2026-08-16', search: '' });
  assert.match(run, /lib-search/, 'thirty-two records earn the box');
});

test('the picker has three tabs and reaches a backup by run, bank and preset', () => {
  const data = runData();
  const state = { tab: 'setlists', setlistIndex: 2, picking: 0, search: '' };
  const patchesTab = SevenLibraryView.renderBody(data, { ...state, pickMode: 'patches' }, []);
  assert.deepStrictEqual(
    [...patchesTab.matchAll(/data-pick-mode="(\w+)"/g)].map((m) => m[1]),
    ['patches', 'sounds', 'backups']
  );
  assert.strictEqual((patchesTab.match(/data-pick-file=/g) || []).length, 1,
    'the Patches tab offers only your own');

  const runs = SevenLibraryView.renderBody(data, { ...state, pickMode: 'backups' }, []);
  assert.strictEqual((runs.match(/data-pick-run=/g) || []).length, 1, 'one run to choose');

  const inside = SevenLibraryView.renderBody(data,
    { ...state, pickMode: 'backups', pickRun: '2026-08-16' }, []);
  assert.strictEqual((inside.match(/lib-group-title/g) || []).length, 2, 'two banks');
  assert.strictEqual((inside.match(/data-pick-file=/g) || []).length, 16, 'sixteen presets');
  assert.match(inside, /data-pick-run-back/, 'and a way back to the run list');
});

// THE FIRST USER REPORT OF 1.0.0, in test form. A patch naming a sound the
// connected instrument does not have looked completely ordinary in the flat
// Patches list, because that list suppressed the whole badge to be rid of the
// Model/Sample pill — and took the warning with it. Selecting such a patch
// then appears to do nothing, which is exactly how it was reported: "the
// presets on computer don't seem to work for me" (2026-08-17).
test('a patch whose sound this instrument lacks is flagged in the flat list', () => {
  const entry = {
    file: 'berlin.sevenlib.json', patchIndex: 0, name: 'Berlin Grand',
    soundName: 'Steinway D Berlin', sampled: true, missing: true,
    mtime: Date.now(), origin: { kind: 'created', created: '2026-08-17T00:00:00Z' },
  };
  const flat = SevenLibraryView.renderBody(
    { patches: [entry], setlists: [] }, { tab: 'patches', search: '' }, []
  );
  assert.match(flat, /Not installed/, 'the flat Patches list warns');

  // And the pill stays out of that list — the reason the badge was suppressed
  // in the first place.
  assert.doesNotMatch(flat, /badge-kind/, 'without bringing the Model/Sample pill back');

  // A patch whose sound IS present says nothing at all.
  const fine = SevenLibraryView.renderBody(
    { patches: [{ ...entry, missing: false }], setlists: [] }, { tab: 'patches', search: '' }, []
  );
  assert.doesNotMatch(fine, /Not installed/);
});
