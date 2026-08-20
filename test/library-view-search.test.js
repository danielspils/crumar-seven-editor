'use strict';

// SEARCH: what it looks at, and when it ends.
//
// Both behaviours here were shipped untested and both were caught by the
// release mutation sweep on 2026-08-20 — deleting them left the suite green.
// The sound-name half is the older of the two: a search that only read names
// would still have passed every test in the project.

const test = require('node:test');
const assert = require('node:assert');

global.window = {
  SevenScrollFade: { watchWithin: () => () => {} },
  SevenSoundArt: { iconFor: (name) => `<svg data-art="${name}"></svg>` },
};
global.CSS = { escape: (s) => s };

const SevenLibraryView = require('../src/library-view.js');

// --- what search looks at ---------------------------------------------------

// A patch is found by the INSTRUMENT it uses, not only by what it is called.
// "Rhodes" holding a Tine Piano is exactly the row a player wants when they
// search for the sound, and its name says nothing about it.
test('search matches the sound name, not only the patch name', () => {
  const patches = [
    { file: 'a.json', patchIndex: 0, name: 'Rhodes', soundName: 'Tine Piano',
      mtime: 2, params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
    { file: 'b.json', patchIndex: 0, name: 'Clav thing', soundName: 'Clavi Piano',
      mtime: 1, params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
  ];
  const render = (search) => SevenLibraryView.renderBody(
    { patches, setlists: [], files: 2 }, { tab: 'patches', patchScope: 'all', search }
  );
  const hit = render('tine');
  assert.ok(/Rhodes/.test(hit), 'found by its sound');
  assert.ok(!/Clav thing/.test(hit), 'and the other row is filtered out');
  // The name half still works, so this cannot be satisfied by matching
  // everything.
  assert.ok(/Clav thing/.test(render('clav')));
  assert.ok(!/Rhodes/.test(render('clav')));
});

// --- when search ends -------------------------------------------------------

// The click ROUTER, not the markup — same approach as
// library-view-picker.test.js, and for the same reason: this is a state
// machine, and a rendering test cannot see it.
const target = (map = {}, classes = []) => {
  const at = (el, own = []) => ({
    ...el,
    dataset: el.dataset || {},
    classList: { contains: (c) => own.includes(c) },
    closest: (sel) => (map[sel] ? at(map[sel], map[sel].classes || []) : null),
  });
  return at({}, classes);
};

// The guard asks for all three at once; the fake answers by exact selector.
const AWAY = '.lib-search, [data-search-open], .lib-row';

const libraryData = () => {
  const patches = [];
  const setlists = [];
  for (const bank of [1, 2, 3, 4]) {
    const slots = [];
    for (let p = 1; p <= 8; p++) {
      const file = `b${bank}p${p}.sevenlib.json`;
      patches.push({
        file, patchIndex: 0, name: `Bank ${bank} Preset ${p} — Tine Piano`,
        soundName: 'Tine Piano', mtime: 1, params: {},
        origin: { kind: 'backup', bank, preset: p, date: '2026-08-15' },
      });
      slots.push(file);
    }
    setlists.push({ name: `Bank ${bank} setlist (2026-08-15)`, runId: 'run-15', slots });
  }
  return { patches, setlists };
};

// Captures input handlers as well as clicks, and gives the view a `.lib-list`
// to write into — typing re-renders only the list (a full render would replace
// the input and lose the caret), so without one the search would appear to do
// nothing.
const mount = () => {
  const clicks = [];
  const inputs = [];
  const list = { innerHTML: '' };
  const el = {
    innerHTML: '',
    addEventListener(type, fn) {
      if (type === 'click') clicks.push(fn);
      if (type === 'input') inputs.push(fn);
    },
    querySelector: (sel) => (sel === '.lib-list' ? list : null),
    querySelectorAll: () => [],
    contains: () => true,
  };
  const view = SevenLibraryView.createLibraryView({ el, on: { sounds: [] } });
  view.update(libraryData());
  return {
    el,
    list,
    async click(map, classes) {
      for (const fn of clicks) await fn({ target: target(map, classes) });
    },
    async type(value) {
      for (const fn of inputs) {
        await fn({ target: { value, classList: { contains: (c) => c === 'lib-search' }, dataset: {} } });
      }
    },
  };
};

const openRun = (m) => m.click({ '.lib-setlist': { dataset: { backup: 'run-15' } } });
// The magnifier, then the term — the order a person does it in.
const openSearch = (m) => m.click({ '[data-search-open]': { dataset: {} } });
// Only the OPEN field carries lib-autofocus; the closed state is a button
// whose class starts with the same eleven characters.
const boxOpen = (m) => /lib-autofocus/.test(m.el.innerHTML);

const startSearch = async (m, term) => {
  await openRun(m);
  await openSearch(m);
  await m.type(term);
};

test('a search inside a backup filters it and stays open', async () => {
  const m = mount();
  await startSearch(m, 'preset 3');
  assert.ok(boxOpen(m), 'the box is open');
  // Inside a run the row shows the STRIPPED name — bank and preset live in the
  // heading — so the assertion is about how many slots still hold a record.
  // Non-matching slots blank rather than disappear: the run's shape is eight
  // positions and hiding rows would renumber them.
  const kept = (m.list.innerHTML.match(/lib-patch/g) || []).length;
  const blanked = (m.list.innerHTML.match(/lib-slot-empty/g) || []).length;
  assert.equal(kept, 4, 'one slot per bank matched "preset 3"');
  assert.equal(blanked, 28, 'the other twenty-eight blanked');
});

test('leaving a run ends the search', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  await m.click({ '.lib-back': { dataset: {} } });
  assert.ok(!boxOpen(m), 'back to the run list with no search running');
});

test('opening another run ends the search', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  await openRun(m);
  assert.ok(!boxOpen(m), 'a run opens unfiltered');
});

// The one click that must NOT end it: choosing from the results is using the
// search, not leaving it.
test('clicking a result keeps the search', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  await m.click({
    [AWAY]: { dataset: {} },
    '.lib-row': { dataset: { file: 'b1p1.sevenlib.json', pi: '0' } },
  });
  assert.ok(boxOpen(m), 'the results are still there');
});

// And a click on chrome that matches no other branch still ends it — the case
// that changed the state and rendered nothing until a fall-through render was
// added.
test('clicking inert chrome ends the search and redraws', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  assert.ok(boxOpen(m));
  await m.click({});
  assert.ok(!boxOpen(m), 'search ended, and the body was rebuilt to say so');
});
