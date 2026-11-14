'use strict';

// THE BACKUP GRID: the Seven's own 32 buttons, four banks stacked, lighting as
// a backup run reaches each slot.
//
// `buildGrid` is string-in string-out like the rest of src/modal-panel.js, so
// the whole of it is reachable here without a window. What ISN'T reachable is
// how it looks and what the lights do — that is
// test/ui/scenarios/backup-grid.js, which drives a real one in a real window
// and reads the computed colours in both themes. Say which half is which: this
// one runs on `npm test` and in CI; the scenario runs only when somebody types
// the second command.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { buildGrid, paintBackup, GRID_SLOTS } = require('../src/modal-panel.js');
const PANEL = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'seven-panel.svg'), 'utf8'
);

const rows = (grid) => grid.split(/(?=<svg )/).filter((s) => s.startsWith('<svg '));

test('the grid is four rows, one per bank', () => {
  const r = rows(buildGrid(PANEL));
  assert.strictEqual(r.length, 4, `expected four rows, got ${r.length}`);
  for (let i = 0; i < 4; i += 1) {
    assert.match(r[i], new RegExp(`data-bk-bank="${i + 1}"`), `row ${i + 1} says which bank it is`);
  }
});

test('and 32 buttons, eight to a row', () => {
  const grid = buildGrid(PANEL);
  assert.strictEqual((grid.match(/data-bk-preset="/g) || []).length, GRID_SLOTS);
  for (const row of rows(grid)) {
    const presets = (row.match(/data-bk-preset="(\d)"/g) || [])
      .map((m) => m.slice(-2, -1));
    assert.deepStrictEqual(presets, ['1', '2', '3', '4', '5', '6', '7', '8']);
  }
});

// THE ONE THE PREFIX EXISTS FOR, and the reason this module prefixes at all.
//
// Four copies of the drawing in one document means four copies of every id —
// and a duplicate id does not fail loudly. `url(#cap-grad)` resolves
// DOCUMENT-WIDE to whichever element came first, so every gradient reference
// in rows 2, 3 and 4 would silently point into row 1. It would even look
// right, because the four gradients are identical; it would stop looking right
// the moment one row needed to differ from another.
//
// Mutation-checked: drop the `prefix` argument from either prefixIds call in
// buildGridRow and this fails with 48 duplicates.
test('every id in the grid is unique, across all four rows', () => {
  const ids = [...buildGrid(PANEL).matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.ok(ids.length > 40, `expected a real drawing, found ${ids.length} ids`);
  assert.deepStrictEqual([...new Set(dupes)], [], 'duplicate ids across the grid');
});

test('and every reference resolves inside its own row', () => {
  for (const row of rows(buildGrid(PANEL))) {
    const bank = (row.match(/data-bk-bank="(\d)"/) || [])[1];
    const ids = new Set([...row.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...row.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((m) => m[1]);
    assert.ok(refs.length, `row ${bank} references something`);
    const stray = refs.filter((r) => !ids.has(r));
    assert.deepStrictEqual(stray, [], `row ${bank} points at ids it does not define`);
    for (const id of ids) {
      assert.ok(id.startsWith(`bk${bank}-`), `${id} is not in row ${bank}'s namespace`);
    }
  }
});

// NOTHING IS LIT UNTIL THE RUN LIGHTS IT. The drawing ships with bank 1 and
// preset 1 `on`, which is a plausible resting state for a picture of an
// instrument and a lie about a backup that has read nothing yet.
test('the grid starts dark', () => {
  const grid = buildGrid(PANEL);
  assert.doesNotMatch(grid, /class="led(?: amber)? on"/, 'no LED starts lit');
  assert.doesNotMatch(grid, /class="btn btn-face on"/, 'no cap starts pressed');
});

// Each row carries ONE bank lamp — its own — because four copies of all four
// lamps is sixteen lamps saying nothing. The mark is per-row data, so it is
// made here rather than in the stylesheet, which cannot know which row it is
// looking at.
test('each row marks its own bank lamp and numeral, and only its own', () => {
  for (const row of rows(buildGrid(PANEL))) {
    const bank = (row.match(/data-bk-bank="(\d)"/) || [])[1];
    const lamps = [...row.matchAll(/class="led amber is-own"\s+id="bk\d-led-bank-(\d)"/g)]
      .map((m) => m[1]);
    assert.deepStrictEqual(lamps, [bank], `row ${bank} marks exactly its own lamp`);
    const nums = [...row.matchAll(/class="lbl-sm lbl-bank-num is-own"[^>]*>(\d)</g)]
      .map((m) => m[1]);
    assert.deepStrictEqual(nums, [bank], `row ${bank} marks exactly its own numeral`);
  }
});

// THE LAMPS DO NOT DRIFT DOWN THE PICTURE. In the full drawing the four bank
// lamps are stacked at cy 64, 88, 112 and 136 — right for four lamps in one
// cluster, wrong for ONE lamp in each of four rows, where it put every row's
// lamp at a different height. Seen in a screenshot of both themes before it
// was fixed; the kind of thing only a rendered picture shows, which is why the
// number it was fixed to is pinned here rather than left to the eye.
test('every row shows its lamp at the same height, beside the caps', () => {
  const ys = rows(buildGrid(PANEL)).map((row) => {
    const lamp = /class="led amber is-own"[^/]*cy="(\d+)"/.exec(row);
    const num = /class="lbl-sm lbl-bank-num is-own"[^>]*y="(\d+)"/.exec(row);
    assert.ok(lamp && num, 'the row has a lamp and a numeral');
    return [Number(lamp[1]), Number(num[1])];
  });
  assert.strictEqual(new Set(ys.map((p) => p[0])).size, 1,
    `all four lamps on one line (${ys.map((p) => p[0]).join(', ')})`);
  assert.strictEqual(new Set(ys.map((p) => p[1])).size, 1, 'and all four numerals');
  // Between the top and bottom of a cap (y 60-144), so it reads as a label for
  // the row rather than as something floating above or below it.
  assert.ok(ys[0][0] > 60 && ys[0][0] < 144, `and beside the caps (cy ${ys[0][0]})`);
});

// The instrument has ONE bank button. Four of them is a column of identical
// blank caps taking a sixth of the width to say nothing — which is what the
// first screenshot showed. The crop starts after it.
test('the bank button is not repeated four times', () => {
  const grid = buildGrid(PANEL);
  assert.doesNotMatch(grid, /id="bk\d-btn-bank"/, 'no bank button in the rows');
  const lefts = rows(grid).map((r) => Number((r.match(/viewBox="([\d.]+)/) || [])[1]));
  for (const x of lefts) {
    assert.ok(x > 740, `the crop starts right of the bank bezel, which ends at 740 (x ${x})`);
    assert.ok(x < 776, `and left of the lamp, which starts at 776 (x ${x})`);
  }
});

// THE LIGHT-MODE HAZARD, pinned. Cropping to the two sections drops
// `.panel-bg` — one rect at the top of the full drawing, outside both — and
// without it the panel's white legends land on the dialog's own background.
// That is invisible on the dark palette and was found on the light one.
test('every row brings its own backdrop, matching its own crop', () => {
  for (const row of rows(buildGrid(PANEL))) {
    const view = (row.match(/viewBox="([^"]+)"/) || [])[1].split(/\s+/).map(Number);
    const bg = row.match(/<rect class="panel-bg" x="([\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    assert.ok(bg, 'the row has a backdrop');
    assert.deepStrictEqual(bg.slice(1, 5).map(Number), view,
      'and it covers exactly what the row crops to');
  }
});

// Row 1 reaches up for the preset numerals and the BANK legend; rows 2-4 start
// below them, because the numbering does not change down a column.
test('only the top row keeps the numerals above the caps', () => {
  const tops = rows(buildGrid(PANEL))
    .map((r) => Number((r.match(/viewBox="[\d.]+ ([-\d.]+)/) || [])[1]));
  assert.ok(tops[0] < 30, `row 1 reaches above the numerals at y 30 (y ${tops[0]})`);
  for (const y of tops.slice(1)) {
    assert.ok(y > 30, `rows 2-4 start below them (y ${y})`);
    assert.ok(y < 56, 'and above the bezels at y 56');
  }
});

test('an unreadable drawing gives nothing, rather than a broken picture', () => {
  assert.strictEqual(buildGrid(''), '');
  assert.strictEqual(buildGrid(null), '');
});

// ---- paintBackup -----------------------------------------------------------
//
// The DOM half, against the smallest fake that can express the thing under
// test: a grid of 32 groups with a `.led` and a `.btn-face` each, and a lamp
// per row. The real one is the scenario; what matters here is the mapping from
// (saved, current) to which lights are on, which is arithmetic and belongs in
// a test that runs on every commit.
function fakeGrid() {
  // Written out rather than cleverly, so the fake cannot be the thing that is
  // wrong: a plain object per node with a real toggle.
  const node = (classes) => {
    const set = new Set(classes);
    return {
      set,
      classList: {
        toggle: (n, on) => (on ? set.add(n) : set.delete(n)),
        contains: (n) => set.has(n),
      },
    };
  };
  const slots = [];
  const lamps = [];
  const bankRows = [];
  for (let b = 1; b <= 4; b += 1) {
    const lamp = node(['led', 'amber', 'is-own']);
    lamps.push(lamp);
    const row = node(['bk-row']);
    row.querySelector = (q) => (q === '.led.amber.is-own' ? lamp : null);
    bankRows.push(row);
  }
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const led = node(['led']);
    const face = node(['btn', 'btn-face']);
    slots.push({ led, face, bank: Math.floor(i / 8) + 1, preset: (i % 8) + 1 });
  }
  return {
    slots,
    lamps,
    querySelector(sel) {
      const slot = /\[data-bk-bank="(\d)"\] \[data-bk-preset="(\d)"\]/.exec(sel);
      if (slot) {
        const hit = slots.find(
          (s) => s.bank === Number(slot[1]) && s.preset === Number(slot[2])
        );
        return hit ? { querySelector: (q) => (q === '.led' ? hit.led : hit.face) } : null;
      }
      const row = /^\[data-bk-bank="(\d)"\]$/.exec(sel);
      if (row) return bankRows[Number(row[1]) - 1];
      return null;
    },
    lit: () => slots.map((s) => s.led.classList.contains('on')),
    pressed: () => slots.map((s) => s.face.classList.contains('on')),
    banksLit: () => lamps.map((l) => l.classList.contains('on')),
    // The numeral is CSS off the row's own class, so what the fake can see of
    // it is the class. The colours themselves are the scenario's job.
    banksCurrent: () => bankRows.map((r) => r.classList.contains('is-current')),
  };
}

const count = (arr) => arr.filter(Boolean).length;

test('a run in progress lights what it has reached, and presses the one in hand', () => {
  const g = fakeGrid();
  paintBackup(g, { saved: 11, current: 11 });   // slot 12 of 32, 0-based 11
  assert.strictEqual(count(g.lit()), 12, 'twelve lit: eleven finished plus the one being read');
  assert.deepStrictEqual(g.pressed().map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [11]);
  assert.deepStrictEqual(g.banksLit(), [false, true, false, false], 'bank 2 lamp follows the run');
  // The numeral comes up with the lamp, from the same call: "the active row's
  // number lit and its lamp". Two things that must never be settable apart.
  assert.deepStrictEqual(g.banksCurrent(), [false, true, false, false],
    'and bank 2 is the row marked current, which is what lights its numeral');
});

// A TYPICAL RUN IS MOSTLY "UNCHANGED" — the backup dedupes by content hash,
// and Daniel's run of 2026-11-13 was 30 unchanged, 2 new. A cell staying dark
// because nothing needed writing would read as a failure, so the grid knows
// nothing about new-versus-unchanged: a slot the run reached is lit.
// DARK NEVER MEANS DONE.
test('all 32 are lit at the end, whatever was actually written', () => {
  const g = fakeGrid();
  paintBackup(g, { saved: 32, current: null });
  assert.strictEqual(count(g.lit()), 32, 'every slot lit');
  assert.strictEqual(count(g.pressed()), 0, 'nothing is being read any more');
  assert.deepStrictEqual(g.banksLit(), [false, false, false, false]);
});

// The slot in flight when a run aborts was lit as `current` and never saved.
// Its light goes out when the final count arrives — correct, and the only time
// a light ever retracts.
test('an aborted run retracts the light on the slot it never finished', () => {
  const g = fakeGrid();
  paintBackup(g, { saved: 11, current: 11 });
  assert.strictEqual(count(g.lit()), 12);
  paintBackup(g, { saved: 11, current: null });
  assert.strictEqual(count(g.lit()), 11, 'the unfinished slot goes dark');
});

test('nothing is lit before the first slot is reached', () => {
  const g = fakeGrid();
  paintBackup(g, { saved: 0, current: null });
  assert.strictEqual(count(g.lit()), 0);
});

test('painting a grid that is not there does nothing rather than throwing', () => {
  assert.doesNotThrow(() => paintBackup(null, { saved: 4, current: 4 }));
});
