'use strict';

// THE RIGHT-HAND CELL OF A PATCHES ROW: what this patch IS.
//
// IT USED TO SAY WHERE IT CAME FROM — "from Bank 3 · Preset 5", the slot a
// save was taken off — and these tests pinned that. Daniel removed it on
// 2026-11-15: "I would never care about where it came from." Two reasons, and
// the second is the one that settles it:
//
//   IT DECAYS. His list holds three rows reading "from Bank 3 · Preset 5":
//   three generations of one slot, two of them naming something that no
//   longer holds what they say.
//
//   THE SAME COLUMN MEANS THE SOUND IN THE SEVEN LIST. One position, two
//   meanings, which is what DESIGN.md's vocabulary exists to prevent.
//
// So the tests below are INVERTED rather than deleted, in the same commit as
// the change: a test that pins the old behaviour does not merely fail to
// catch the new one, it argues against it.
//
// THE PROVENANCE IS NOT GONE FROM THE DATA. It stays in the patch file and in
// the detail pane, where putting a patch back where it came from is an action
// you can take. Asserted below, because "stop showing it" and "stop keeping
// it" are a single careless edit apart.
//
// Asserted through `renderBody`, the real row renderer, rather than by
// exporting the private helper. A test against a copy of the formatting could
// not fail when the row stopped printing it (CLAUDE.md, 2026-08-23).

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

test('a patch saved off a slot names its SOUND, not the slot', () => {
  const origin = {
    kind: 'created', date: DATE, created: DATE, copiedFrom: { bank: 3, preset: 5 },
  };
  const entry = row(origin);
  const html = render(entry);
  assert.match(html, /<span class="lib-origin">Tine Piano<\/span>/,
    'the cell answers "what is this"');
  assert.doesNotMatch(html, /from Bank/,
    'and no longer says where it came from');
  // THE DATA IS UNTOUCHED. Unlisting it and discarding it are one careless
  // edit apart, and only one of them is reversible.
  assert.deepStrictEqual(entry.origin.copiedFrom, { bank: 3, preset: 5 },
    'the stored provenance survives the render');
});

// The common case, and it must not grow a dangling "from" — nor a date. The
// flat list carries NO context on an ordinary row (Daniel, 2026-08-16: dates
// live in Backups, where they distinguish one run from another). This change
// reopens that cell for one thing only.
test('a patch made in the app names its sound too', () => {
  // The cell used to be EMPTY on an ordinary row, because provenance was news
  // and most rows had none. A sound is not news — every patch has one — so
  // the column is uniform now, which is what makes it a column rather than an
  // occasional annotation.
  const html = render(row({ kind: 'created', date: DATE, created: DATE }));
  assert.doesNotMatch(html, /from Bank/, 'no slot is invented');
  assert.match(html, /<span class="lib-origin">Tine Piano<\/span>/,
    'and it says what the patch is');
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
