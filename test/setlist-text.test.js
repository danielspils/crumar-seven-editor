'use strict';

// The setlist-as-text formatter. Runs on `npm test` — which is the reason it
// is a module at all: the test glob is "test/*.test.js" and never reaches
// src/app.js, so this logic living in the renderer would be untested.

const test = require('node:test');
const assert = require('node:assert');

const { formatSetlist } = require('../src/setlist-text');

// Local time, constructed locally: the formatter prints the wall clock the
// player is standing in, so the fixture has to be built the same way.
const WHEN = new Date(2026, 7, 18, 16, 12);   // 18 Aug 2026, 4:12 PM

const FULL = {
  name: 'PIKE PLACE — 28 AUG',
  slots: ['Tine Piano', 'Reed Piano', 'Wurli Bark', 'Clav Comp', null, null, null, 'Electric Grand'],
};

test('the setlist’s own name is the first line', () => {
  const out = formatSetlist(FULL, WHEN);
  assert.strictEqual(out.split('\n')[0], 'PIKE PLACE — 28 AUG');
});

// THE POSITION IS THE INFORMATION. Omitting an empty slot renumbers every slot
// after it, so a player reading slot 6 would press the wrong preset.
test('all eight slots appear, in order, with empty ones as dashes', () => {
  const numbered = formatSetlist(FULL, WHEN).split('\n').filter((l) => /^\d+\. /.test(l));
  assert.deepStrictEqual(numbered, [
    '1. Tine Piano',
    '2. Reed Piano',
    '3. Wurli Bark',
    '4. Clav Comp',
    '5. —',
    '6. —',
    '7. —',
    '8. Electric Grand',
  ]);
});

test('a setlist with nothing in it still prints eight slots', () => {
  const numbered = formatSetlist({ name: 'Empty', slots: [] }, WHEN)
    .split('\n').filter((l) => /^\d+\. /.test(l));
  assert.strictEqual(numbered.length, 8);
  assert.ok(numbered.every((l) => /^\d+\. —$/.test(l)), numbered.join(' | '));
});

// The blank lines are structural, not spacing. Without the one after slot 8
// the "Exported …" line sits directly under it and reads as a ninth entry at a
// glance — which is the one misreading that matters on a stage, where somebody
// is counting down a list to find preset 8 (Daniel, 2026-08-19).
test('the name and the timestamp are each separated from the slot block', () => {
  const lines = formatSetlist(FULL, WHEN).split('\n');
  const first = lines.findIndex((l) => /^1\. /.test(l));
  const last = lines.findIndex((l) => /^8\. /.test(l));
  assert.strictEqual(lines[first - 1], '', 'a blank line between the name and slot 1');
  assert.strictEqual(lines[last + 1], '', 'a blank line between slot 8 and the timestamp');
  assert.match(lines[last + 2], /^Exported /);
});

// The timestamp comes IN. A formatter that read the clock itself could not be
// asserted, which would leave the one field that goes stale the moment it is
// pasted as the one field nothing checks.
test('the timestamp reflects the time it was given', () => {
  const out = formatSetlist(FULL, WHEN);
  assert.match(out, /^Exported 18 Aug 2026, 4:12 PM$/m);
  // A different time gives a different line — otherwise the assertion above
  // could be satisfied by a hardcoded string.
  assert.match(
    formatSetlist(FULL, new Date(2026, 0, 2, 9, 5)),
    /^Exported 2 Jan 2026, 9:05 AM$/m
  );
  // Midnight and noon are the two the 12-hour clock gets wrong.
  assert.match(formatSetlist(FULL, new Date(2026, 0, 2, 0, 30)), /12:30 AM/);
  assert.match(formatSetlist(FULL, new Date(2026, 0, 2, 12, 30)), /12:30 PM/);
});

// This gets pasted into other people's apps. A name carrying a newline would
// put its tail on a line of its own, where it reads as another slot.
test('a name that could break the layout still renders on one line', () => {
  const out = formatSetlist({
    name: 'Gig\nSheet',
    slots: ['Rhodes\nMk1', 'Wurli\r\n200A', '  padded  ', '9. Not A Slot', null, null, null, null],
  }, WHEN);
  const numbered = out.split('\n').filter((l) => /^\d+\. /.test(l));
  assert.strictEqual(numbered.length, 8, 'still exactly eight slot lines');
  assert.strictEqual(out.split('\n')[0], 'Gig Sheet', 'the name is one line');
  assert.deepStrictEqual(numbered.slice(0, 4), [
    '1. Rhodes Mk1',
    '2. Wurli 200A',
    '3. padded',
    // A name that looks like a slot number is still just a name on its own
    // line — the number in front of it is the real one.
    '4. 9. Not A Slot',
  ]);
});

// BANK N — the second line, and only when it is known.
test('the bank prints under the name when the setlist has one', () => {
  const lines = formatSetlist({ ...FULL, bank: 3 }, WHEN).split('\n');
  assert.strictEqual(lines[0], 'PIKE PLACE — 28 AUG');
  assert.strictEqual(lines[1], 'BANK 3');
  assert.strictEqual(lines[2], '', 'still a blank line before slot 1');
  assert.match(lines[3], /^1\. /);
});

// A setlist that has never been sent has no honest answer. A blank is better
// than a guess on a sheet somebody reads at a gig.
test('the bank line is omitted entirely when it is not known', () => {
  for (const bank of [undefined, null, 0, '3', NaN]) {
    const body = formatSetlist({ ...FULL, bank }, WHEN);
    assert.ok(!/BANK/.test(body), `no BANK line for ${JSON.stringify(bank)}:\n${body}`);
    assert.strictEqual(body.split('\n')[1], '', 'the name is still followed by a blank line');
  }
});
