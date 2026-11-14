'use strict';

// THE ORIGIN LINE UNDER A PATCH NAME: where this one came from.
//
// A save taken off the instrument lands in Patches among patches that were
// built there. Without this line it arrives unexplained — the thing §3 of
// out/save-what-you-hear.md asked for, and the half that lives in the view
// rather than in the file.
//
// Asserted through `renderBody`, the real row renderer, rather than by
// exporting the private helper. A test against a copy of the formatting could
// not fail when the row stopped printing it, which is the only failure this
// exists to catch (CLAUDE.md, 2026-08-23).
//
// NOT A NEW FIELD. The store has written `origin.copiedFrom.bank` since
// 2026-08-21 for copies of backup records and nothing ever displayed it, so
// those rows start saying where they came from too.

const test = require('node:test');
const assert = require('node:assert');

global.window = {
  SevenScrollFade: { watchWithin: () => () => {} },
  SevenSoundArt: { iconFor: (name) => `<svg data-art="${name}"></svg>` },
};
global.CSS = { escape: (s) => s };

const SevenLibraryView = require('../src/library-view.js');

const DATE = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

const row = (origin, name = 'Off the panel') => ({
  file: 'a.json', patchIndex: 0, name, soundName: 'Tine Piano',
  mtime: 1, params: {}, origin,
});

const render = (...patches) => SevenLibraryView.renderBody(
  { patches, setlists: [], files: patches.length },
  { tab: 'patches', patchScope: 'all', search: '' }
);

test('a patch saved off a slot says which slot', () => {
  const html = render(row({
    kind: 'created', date: DATE, created: DATE, copiedFrom: { bank: 3, preset: 5 },
  }));
  assert.match(html, /from Bank 3 · Preset 5/,
    'the row names where the values came from');
});

// The common case, and it must not grow a dangling "from" — nor a date. The
// flat list carries NO context on an ordinary row (Daniel, 2026-08-16: dates
// live in Backups, where they distinguish one run from another). This change
// reopens that cell for one thing only.
test('a patch made in the app still says nothing at all', () => {
  const html = render(row({ kind: 'created', date: DATE, created: DATE }));
  assert.doesNotMatch(html, /from Bank/, 'no slot is invented');
  assert.match(html, /<span class="lib-origin"><\/span>/,
    'and the cell is empty, as it has been since 2026-08-16');
});

// A COPY OF AN ORDINARY PATCH carries a file and a name in `copiedFrom` and no
// slot at all. Guarding on `copiedFrom` existing rather than on the numbers is
// how this would render "from Bank undefined · Preset undefined".
test('a copy with no slot in its provenance prints no bank', () => {
  const html = render(row({
    kind: 'created',
    date: DATE,
    created: DATE,
    copiedFrom: { file: 'b.json', patchIndex: 0, name: 'Reed Piano' },
  }));
  assert.doesNotMatch(html, /from Bank/, 'a file is not a slot');
  assert.doesNotMatch(html, /undefined/, 'and nothing leaks');
});

// Half a slot is a guess. The file layer refuses to write one; this is the
// view refusing to print one it finds anyway — a patch edited by hand, or
// written by an older build.
test('half a slot is not printed', () => {
  for (const copiedFrom of [{ bank: 3 }, { preset: 5 }, { bank: '3', preset: '5' }]) {
    const html = render(row({ kind: 'created', date: DATE, created: DATE, copiedFrom }));
    assert.doesNotMatch(html, /from Bank/, `${JSON.stringify(copiedFrom)} is not a slot`);
    assert.doesNotMatch(html, /undefined|NaN/, 'and nothing leaks');
  }
});

// A BACKUP RECORD IS NOT A COPY OF ONE. A record IS a slot — the flat list
// already identifies it by its preset number in the lead cell — so it must
// never pick up "from Bank", which would read as a patch that was saved off
// the instrument rather than captured by a backup run.
test('a backup record does not read as a copy', () => {
  const html = render(row({ kind: 'backup', bank: 2, preset: 7, date: DATE }, 'Bank 2 record'));
  assert.doesNotMatch(html, /from Bank/, 'a record did not come FROM a slot — it IS one');
});

// ---- The setlist slot row, which is where originLine shows ------------------
//
// Two surfaces read the same formatter: the flat row above shows the slot
// alone, and a setlist slot row shows it after the age. Pinned through
// `createLibraryView`'s own renderer rather than by exporting the private
// helper, for the same reason as the rest of this file.
test('a setlist slot row says the age AND where it came from', () => {
  const patch = row({
    kind: 'created', date: DATE, created: DATE, copiedFrom: { bank: 3, preset: 5 },
  });
  const html = SevenLibraryView.renderBody(
    { patches: [patch], setlists: [{ name: 'Friday', slots: ['a.json'] }], files: 1 },
    { tab: 'setlists', setlistIndex: 0, patchScope: 'all', search: '' }
  );
  assert.match(html, /Created[^<]*· from Bank 3 · Preset 5/,
    'the age and the slot, in one line and in that order');
});
