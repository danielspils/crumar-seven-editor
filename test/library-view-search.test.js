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
const AWAY = '.lib-search-wrap, .lib-row';

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
    // Exposed so a test can force a full repaint and ask the bar what the
    // view currently believes — see `term` below.
    view,
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
// THE FIELD IS ALWAYS THERE NOW (2026-11-15), so there is nothing to open
// first — typing is the whole gesture. `openSearch` is gone with the
// disclosure button it clicked.
//
// `boxOpen` used to look for lib-autofocus, which only the summoned field
// carried, and it answered "is there a search running?". A permanent field
// cannot answer that — it is always on screen — and a permanent field must
// NOT carry lib-autofocus either, or it would seize the caret on every render.
//
// SO THE QUESTION MOVED TO THE TERM. "Is a search running" is now "does the
// field hold anything", which is what the list is filtered by and what these
// tests were always really about. Two of them asserted the box had vanished;
// that was the disclosure closing, which no longer exists, and asserting it
// against a permanent field would have been a test pinning its own fiction.
// "IS A SEARCH RUNNING" NEEDS A REPAINT TO ANSWER, and that is a property of
// the design rather than of the test.
//
// It used to be answerable from the bar's own markup: the field was rendered
// only while `searchOpen || search`, so `lib-autofocus` being present WAS the
// answer. The field is permanent now, so its presence says nothing, and the
// term is what distinguishes a running search from an idle one.
//
// But typing repaints `.lib-list` alone — deliberately, because a full render
// would replace the field being typed in and take the caret with it — so the
// bar in `el.innerHTML` is one render stale mid-search. And the list cannot
// stand in either: every patch in this fixture carries the same sound name,
// so "tine" matches all 32 and narrows nothing.
//
// So: force a full repaint through the public `update`, then read the field.
// That is also the honest question — "after a redraw, does the view still
// think a search is on?" — which is exactly what the two "ends the search"
// tests are about.
const fieldPresent = (m) => /class="lib-search"/.test(m.el.innerHTML);
const term = (m) => {
  m.view.update(libraryData());
  const hit = /class="lib-search"[^>]*value="([^"]*)"/.exec(m.el.innerHTML);
  return hit ? hit[1] : null;
};
const searching = (m) => !!term(m);

const startSearch = async (m, term) => {
  await openRun(m);
  await m.type(term);
};

test('a search inside a backup filters it and stays open', async () => {
  const m = mount();
  await startSearch(m, 'preset 3');
  assert.ok(fieldPresent(m), 'the field is on screen, with nothing to open');
  // Searching a run FLATTENS it across all four banks — the tabs are a filter,
  // and searching inside four filtered lists would ask someone to check four
  // places for their own word. So the result is the matches themselves, with
  // no empty placeholders standing in for the slots that did not match.
  const kept = (m.list.innerHTML.match(/lib-patch/g) || []).length;
  const blanked = (m.list.innerHTML.match(/lib-slot-empty/g) || []).length;
  assert.equal(kept, 4, 'one slot per bank matched "preset 3"');
  assert.equal(blanked, 0, 'and the run is flattened, not blanked out');
});

test('leaving a run ends the search', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  await m.click({ '.lib-back': { dataset: {} } });
  assert.ok(!searching(m), 'back to the run list with no search running');
});

test('opening another run ends the search', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  await openRun(m);
  assert.ok(!searching(m), 'a run opens unfiltered');
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
  assert.ok(searching(m), 'the results are still there');
});

// And a click on chrome that matches no other branch still ends it — the case
// that changed the state and rendered nothing until a fall-through render was
// added.
test('clicking inert chrome ends the search and redraws', async () => {
  const m = mount();
  await startSearch(m, 'tine');
  assert.ok(searching(m));
  await m.click({});
  assert.ok(!searching(m), 'search ended, and the body was rebuilt to say so');
});

// --- the count beside the search -------------------------------------------
//
// IT ONLY APPEARS WHILE A SEARCH IS NARROWING SOMETHING (Daniel, 2026-11-15).
// The bar used to carry "9 patches" at all times — a number beside a list you
// can already see and count. While searching it answers the question you
// cannot: how much of the list the search just hid.
//
// Mounted rather than calling renderBody directly, because the count is passed
// IN by the live view: a bare renderBody() has no count by design, and a test
// that called it would assert the absence of something nothing was asked for.
// ASSERTED ON THE STATE, which is where the honesty lives. The numbers are
// set by whichever list actually does the narrowing, so they cannot drift from
// what was rendered — and reading them here needs no test-only method on the
// view. (renderBody takes the finished label as an argument; the live view is
// what supplies it.)
const twoPatches = [
  { file: 'a.json', patchIndex: 0, name: 'Rhodes', soundName: 'Tine Piano',
    mtime: 2, params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
  { file: 'b.json', patchIndex: 0, name: 'Clav thing', soundName: 'Clavi Piano',
    mtime: 1, params: {}, origin: { kind: 'created', date: '2026-08-15T10:00:00Z' } },
];

test('a search records how many of how many it narrowed to', () => {
  const state = { tab: 'patches', patchScope: 'all', search: 'tine' };
  SevenLibraryView.renderBody({ patches: twoPatches, setlists: [], files: 2 }, state);
  assert.strictEqual(state.searchHits, 1);
  assert.strictEqual(state.searchTotal, 2);
});

test('with no search there is nothing to count', () => {
  // The bar used to say "9 patches" at all times — a number beside a list you
  // can already see and count.
  const state = { tab: 'patches', patchScope: 'all', search: '' };
  SevenLibraryView.renderBody({ patches: twoPatches, setlists: [], files: 2 }, state);
  assert.strictEqual(state.searchHits, null);
});

// INVERTED 2026-11-15, with the code, which is the only way a test of this
// shape may change. It used to assert that the setlist list set no count —
// correct while it did not filter at all — and said in its own comment that
// giving setlists a real search later had to come with its own decision about
// the count. That is this: the list filters by name, so the count is a real
// answer and is set from the list that actually did the narrowing.
test('searching setlists narrows the list and counts what it hid', () => {
  const data = {
    patches: [],
    setlists: [
      { name: 'Friday', slots: [] },
      { name: 'Saturday', slots: [] },
      // A backup's own setlist is not a setlist of yours and is not counted.
      { name: 'Bank 1 setlist (2026-08-16)', slots: [] },
    ],
    files: 0,
  };
  const state = { tab: 'setlists', search: 'fri' };
  const html = SevenLibraryView.renderBody(data, state);
  assert.strictEqual(state.searchHits, 1, 'one name matched');
  assert.strictEqual(state.searchTotal, 2, 'out of the two that are yours');
  assert.ok(/Friday/.test(html) && !/Saturday/.test(html),
    'and the list shows only the match');

  // No search, no count — the bar carries a number only while one is narrowing.
  const idle = { tab: 'setlists', search: '' };
  SevenLibraryView.renderBody(data, idle);
  assert.strictEqual(idle.searchHits, null);
});

test('a setlist search that matches nothing says so, and does not claim the library is empty', () => {
  const data = { patches: [], setlists: [{ name: 'Friday', slots: [] }], files: 0 };
  const html = SevenLibraryView.renderBody(data, { tab: 'setlists', search: 'zzz' });
  assert.ok(/No setlists match/.test(html), 'it names the search');
  assert.ok(!/No setlists yet/.test(html), 'and never the empty-library state');
});

// REPLACED 2026-11-15, with the code. This asserted that the bar drew a count
// when given one. The count is gone — "9 patches" and the "3 of 12" that
// replaced it — because the list is its own count (Daniel). What it was
// genuinely for is kept and asserted below instead: telling "nothing matched"
// apart from "nothing rendered", which the list now says in words.
test('the bar carries no count, in any state', () => {
  const data = { patches: twoPatches, setlists: [], files: 2 };
  for (const state of [
    { tab: 'patches', patchScope: 'all', search: 'tine' },
    { tab: 'patches', patchScope: 'all', search: '' },
    { tab: 'setlists', search: '' },
  ]) {
    const html = SevenLibraryView.renderBody(data, state, []);
    assert.ok(!/lib-count-right/.test(html), `no count span on ${state.tab}/"${state.search}"`);
    assert.ok(!/\d+ of \d+/.test(html), `and no bare "n of m" either on ${state.tab}`);
  }
});

test('a search that matches nothing says so, rather than emptying the panel', () => {
  // The count was the only thing distinguishing these two, so the empty state
  // is what replaces it. Same quiet .lib-empty line the rest of the app uses —
  // no new treatment was invented for this.
  const data = { patches: twoPatches, setlists: [], files: 2 };
  const none = SevenLibraryView.renderBody(
    data, { tab: 'patches', patchScope: 'all', search: 'zzzznope' }, []
  );
  assert.ok(/lib-empty/.test(none), 'the list draws its empty state');
  assert.ok(/No patches match/.test(none), 'and says the search is why');
});

test('the search field is always rendered, with no disclosure button', () => {
  const data = { patches: twoPatches, setlists: [], files: 2 };
  const html = SevenLibraryView.renderBody(
    data, { tab: 'patches', patchScope: 'all', search: '' }, []
  );
  assert.ok(/class="lib-search"/.test(html), 'the field is there without being asked for');
  assert.ok(!/data-search-open/.test(html), 'and nothing has to be clicked to get it');
});

test('the list views carry the folder button, and it is named', () => {
  const data = { patches: twoPatches, setlists: [], files: 2 };
  const html = SevenLibraryView.renderBody(
    data, { tab: 'patches', patchScope: 'all', search: '' }, []
  );
  // ICON-ONLY, so the accessible name and the tooltip are the only things
  // naming it. Asserted because an unlabelled icon button is invisible to
  // anyone not using a mouse and eyes.
  assert.ok(/data-reveal/.test(html), 'the button is rendered');
  assert.ok(/aria-label="Open library folder"/.test(html), 'it has an accessible name');
  assert.ok(/title="Open the library folder in Finder"/.test(html), 'and a tooltip');
});
