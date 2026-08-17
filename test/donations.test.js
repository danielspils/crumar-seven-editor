'use strict';

// The rules in docs/DONATIONS.md, as assertions. Every one of these exists
// because breaking it turns an ask into nagware, and the failure mode is
// invisible in normal use: you only find out you asked someone a third time
// when they tell you.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Donations } = require('../src/donations.js');

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-08-17T12:00:00Z');

const fresh = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-donations-'));
  let clock = T0;
  const d = new Donations(dir, { now: () => clock });
  return { d, dir, tick: (ms) => { clock += ms; } };
};

test('nothing before the feature existed counts — the state starts empty', () => {
  const { d, dir } = fresh();
  assert.ok(!fs.existsSync(path.join(dir, 'donations.json')), 'no file until asked');
  assert.strictEqual(d.dueShowing(), 1, 'the next qualifying trigger is showing 1');
});

test('two showings, ever', () => {
  const { d, tick } = fresh();
  assert.strictEqual(d.dueShowing(), 1);
  d.recordShown();
  tick(8 * DAY);
  assert.strictEqual(d.dueShowing(), 2);
  d.recordShown();
  tick(400 * DAY);
  assert.strictEqual(d.dueShowing(), 0, 'and never automatically again');
});

test('seven days between showings, and a trigger inside that window is dropped', () => {
  const { d, tick } = fresh();
  d.recordShown();

  tick(DAY);
  assert.strictEqual(d.dueShowing(), 0, 'two backups in one week produce one ask');
  tick(5 * DAY);
  assert.strictEqual(d.dueShowing(), 0, 'still inside the window at six days');
  tick(DAY);
  assert.strictEqual(d.dueShowing(), 2, 'seven days exactly is enough');
});

test('a skipped trigger is not queued — it is gone', () => {
  const { d, tick } = fresh();
  d.recordShown();
  tick(DAY);
  d.dueShowing();              // a trigger inside the window
  d.dueShowing();              // and another
  tick(7 * DAY);
  assert.strictEqual(d.dueShowing(), 2, 'the next one is showing 2, not showings 2 and 3');
});

test('"I already donated" ends it permanently', () => {
  const { d, tick } = fresh();
  d.recordShown();
  d.recordAnswer('already');
  tick(400 * DAY);
  assert.strictEqual(d.dueShowing(), 0);
});

test('"Don\'t ask again" ends it permanently', () => {
  const { d, tick } = fresh();
  d.recordShown();
  d.recordAnswer('never');
  tick(400 * DAY);
  assert.strictEqual(d.dueShowing(), 0);
});

test('donating does not silence the second ask — the cap and the week bound it', () => {
  // Deliberate: someone who gives once may want to be thanked, and there is no
  // receipt callback that could tell us they did. Two showings still cap it.
  const { d, tick } = fresh();
  d.recordShown();
  d.recordAnswer('donate');
  tick(8 * DAY);
  assert.strictEqual(d.dueShowing(), 2);
});

test('"Remind me later" leaves the door open', () => {
  const { d, tick } = fresh();
  d.recordShown();
  d.recordAnswer('later');
  tick(8 * DAY);
  assert.strictEqual(d.dueShowing(), 2);
});

test('the state survives a restart — it is on disk, not in memory', () => {
  const { d, dir, tick } = fresh();
  d.recordShown();
  d.recordAnswer('already');

  const after = new Donations(dir, { now: () => T0 + 400 * DAY });
  assert.strictEqual(after.dueShowing(), 0, 'a fresh instance reads the same answer');
});

test('an unreadable state file means "never asked", not a crash', () => {
  const { d, dir } = fresh();
  fs.writeFileSync(path.join(dir, 'donations.json'), '{ this is not json');
  assert.strictEqual(d.dueShowing(), 1);
});

test('reset clears everything, which is the only way to reach showing 2 today', () => {
  const { d } = fresh();
  d.recordShown();
  d.recordAnswer('never');
  assert.strictEqual(d.dueShowing(), 0);
  d.reset();
  assert.strictEqual(d.dueShowing(), 1);
});
