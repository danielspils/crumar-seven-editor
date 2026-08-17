'use strict';

// THE CLICK HANDLER, not the markup. Every other library-view test asserts on
// a string renderBody() returned; none of them touch the router that decides
// what a click means, and that is where four bugs in the assign picker came
// from in one sitting (Daniel, 2026-08-16):
//
//   - cancelling the name prompt left the picker on screen but dead
//   - the picker's "‹ Backups" matched the LIBRARY's .lib-back and closed
//     the whole thing, dropping you out of the setlist as well
//
// Both are state-machine bugs, invisible to a rendering test. The stub below
// is deliberately tiny: the view only needs somewhere to write innerHTML and
// something to hand its click handler to, so a fake element buys real coverage
// of the router without a DOM library in a project that has no dependencies.

const test = require('node:test');
const assert = require('node:assert');

global.window = {
  SevenScrollFade: { watchWithin: () => () => {} },
  SevenSoundArt: { iconFor: (name) => `<svg data-art="${name}"></svg>` },
};
global.CSS = { escape: (s) => s };

const SevenLibraryView = require('../src/library-view.js');

// A click target that answers closest() from a map of selector → element.
// Whatever closest() hands back can be asked again — the handler walks from a
// .patch-name up to its [data-setlist] row — so every hit carries the same map.
const target = (map = {}, classes = []) => {
  const at = (el, own = []) => ({
    ...el,
    dataset: el.dataset || {},
    classList: { contains: (c) => own.includes(c) },
    closest: (sel) => (map[sel] ? at(map[sel], map[sel].classes || []) : null),
  });
  return at({}, classes);
};

const SOUNDS = [
  { name: 'Tine Piano', id: 0, sampled: false },
  { name: 'Sampled Tine Piano', id: 9, sampled: true },
];

// One backup run (four per-bank setlists sharing a runId) and one setlist of
// your own with an empty slot to assign into.
const libraryData = () => {
  const patches = [];
  const setlists = [];
  for (const bank of [1, 2, 3, 4]) {
    const slots = [];
    for (let p = 1; p <= 8; p++) {
      const file = `b${bank}p${p}.sevenlib.json`;
      patches.push({
        file, patchIndex: 0, name: `Bank ${bank} Preset ${p} — Tine Piano`,
        soundName: 'Tine Piano', mtime: 1, origin: { kind: 'captured' },
      });
      slots.push(file);
    }
    setlists.push({ name: `Bank ${bank} setlist (2026-08-15)`, runId: 'run-15', slots });
  }
  setlists.push({ name: 'Maktub', slots: [null, null, null, null, null, null, null, null] });
  return { patches, setlists };
};

const mountView = (on = {}) => {
  const clicks = [];
  const el = {
    innerHTML: '',
    addEventListener(type, fn) { if (type === 'click') clicks.push(fn); },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const view = SevenLibraryView.createLibraryView({ el, on: { sounds: SOUNDS, ...on } });
  view.update(libraryData());
  const click = async (map, classes) => {
    for (const fn of clicks) await fn({ target: target(map, classes) });
  };
  return { el, click, view };
};

const MAKTUB = 4; // the one setlist that is not part of the backup run

// Open the Maktub setlist and start assigning slot 4. Opening a setlist is a
// single click held for 260ms — the delay is what tells it from the first half
// of the double click that renames one — so the wait is the real path.
const openPicker = async (ui) => {
  await ui.click({ '.seg-btn': { dataset: { tab: 'setlists' } } });
  await ui.click({
    '.patch-name': {},
    '[data-setlist]': { dataset: { setlist: String(MAKTUB) }, classes: ['lib-setlist'] },
  });
  await new Promise((r) => setTimeout(r, 300));
  await ui.click({ '[data-slot-assign]': { dataset: { slotAssign: '3' } } });
};

test('the picker opens over the setlist', async () => {
  const ui = mountView({ openSetlist: () => {} });
  ui.view.reveal(null, null, {}); // no-op; keeps the API honest if it changes
  await openPicker(ui);
  assert.match(ui.el.innerHTML, /pick-overlay/, 'the picker is up');
});

test('cancelling the naming prompt leaves the picker exactly where it was', async () => {
  // assignSlot resolving FALSE is how "you cancelled" reaches the view. This
  // is the bug: the picker cleared its own state before the prompt ran, so a
  // cancel left the overlay on screen with nothing behind it — every tile
  // click fell through and did nothing.
  // Note what this must assert. After the bug, the MARKUP was unchanged — the
  // picker sat there looking perfectly normal — so no assertion about the HTML
  // catches it. What broke was the next click, and that is the assertion.
  const asked = [];
  const ui = mountView({
    assignSlot: async (i, slot, file) => { asked.push({ slot, file }); return false; },
  });
  await openPicker(ui);
  await ui.click({ '[data-pick-mode]': { dataset: { pickMode: 'sounds' } } });
  await ui.click({ '[data-pick-sound]': { dataset: { pickSound: 'Tine Piano' } } });

  assert.match(ui.el.innerHTML, /pick-overlay/, 'the picker is still open');
  assert.match(ui.el.innerHTML, /data-pick-sound/, 'and still showing instruments');

  await ui.click({ '[data-pick-sound]': { dataset: { pickSound: 'Sampled Tine Piano' } } });
  assert.deepStrictEqual(asked, [
    { slot: 3, file: 'sound:Tine Piano' },
    { slot: 3, file: 'sound:Sampled Tine Piano' },
  ], 'the second choice reaches the handler too — the picker is still live');
});

test('a completed assignment closes the picker', async () => {
  // A real assignment ends in refreshLibrary() → update(), which is what
  // repaints the panel without the picker. The stub does the same, because
  // the view deliberately does NOT re-render here itself.
  let ui;
  ui = mountView({ assignSlot: async () => { ui.view.update(libraryData()); return true; } });
  await openPicker(ui);
  await ui.click({ '[data-pick-mode]': { dataset: { pickMode: 'sounds' } } });
  await ui.click({ '[data-pick-sound]': { dataset: { pickSound: 'Tine Piano' } } });
  assert.doesNotMatch(ui.el.innerHTML, /pick-overlay/, 'the picker is gone');
});

test('"‹ Backups" steps back to the run list and stays in the picker', async () => {
  // The picker's own back button carries .lib-back, which the LIBRARY's back
  // branch claimed first: one click closed the picker and left the setlist.
  const ui = mountView();
  await openPicker(ui);
  await ui.click({ '[data-pick-mode]': { dataset: { pickMode: 'backups' } } });
  await ui.click({ '[data-pick-run]': { dataset: { pickRun: 'run-15' } } });
  assert.match(ui.el.innerHTML, /data-pick-file=/, 'inside the run');

  await ui.click({ '.lib-back': {}, '[data-pick-run-back]': {} });
  assert.match(ui.el.innerHTML, /pick-overlay/, 'still in the picker');
  assert.match(ui.el.innerHTML, /data-pick-run=/, 'back at the list of runs');
});

test('inside a run, the picker says WHICH backup you are in', async () => {
  const ui = mountView();
  await openPicker(ui);
  await ui.click({ '[data-pick-mode]': { dataset: { pickMode: 'backups' } } });
  await ui.click({ '[data-pick-run]': { dataset: { pickRun: 'run-15' } } });
  assert.match(ui.el.innerHTML, /pick-run-title/, 'the run is named');
  assert.match(ui.el.innerHTML, /15 Aug Backup/, 'and named as its row was');
});

test('while the picker is up, the library underneath does not answer clicks', async () => {
  // The general form of the "‹ Backups" bug. The picker is an overlay across
  // the panel: anything it does not recognise does nothing, rather than
  // falling through to whatever branch happens to match below.
  const ui = mountView({ deleteSetlist: () => assert.fail('reached the library') });
  await openPicker(ui);
  await ui.click({ '[data-setlist-delete]': { dataset: { setlistDelete: '0' } } });
  assert.match(ui.el.innerHTML, /pick-overlay/, 'the picker is untouched');
});

test('Cancel closes the picker and nothing else', async () => {
  const ui = mountView();
  await openPicker(ui);
  await ui.click({ '.pick-cancel': {} });
  assert.doesNotMatch(ui.el.innerHTML, /pick-overlay/, 'the picker is closed');
  assert.match(ui.el.innerHTML, /lib-setlist-head/, 'and the setlist is still open');
});
