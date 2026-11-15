'use strict';

// HAS ANYTHING ACTUALLY CHANGED SINCE THIS PATCH LOADED?
//
// The save button asks this. It used to ask a `dirty` flag set the moment any
// control was touched — which meant turning a knob up and back left the button
// showing, claiming an edit that no longer existed. A flag cannot answer this
// question; only a comparison can.
//
// THE BASELINE IS WHAT THE APP SENT, not the raw file. Sending clamps each
// value to the schema max, so a file holding an out-of-range value is not what
// the instrument received. Comparing against the file would show drift the
// instant such a patch loaded, with nobody having touched anything — a second
// and wronger channel for a condition the format layer already warns about
// (Daniel, 2026-08-21).

const test = require('node:test');
const assert = require('node:assert');
const { hasDrift } = require('../src/drift.js');

const base = { rho_atk: 64, rho_hrd: 30, veq_trb: 12 };

test('nothing touched, no drift', () => {
  assert.strictEqual(hasDrift({ baseline: base, live: { ...base } }), false);
});

test('a changed value is drift', () => {
  assert.strictEqual(hasDrift({ baseline: base, live: { ...base, rho_atk: 95 } }), true);
});

test('A VALUE PUT BACK IS NOT DRIFT — the case a dirty flag gets wrong', () => {
  // Turn it up, turn it back. Nothing has changed, so nothing may claim it has.
  let live = { ...base, rho_atk: 95 };
  assert.strictEqual(hasDrift({ baseline: base, live }), true, 'up: drift');
  live = { ...live, rho_atk: 64 };
  assert.strictEqual(hasDrift({ baseline: base, live }), false, 'and back: none');
});

test('a clamped value never registers as drift', () => {
  // The file said 200, the schema max is 127, so 127 is what the instrument
  // was given. The baseline is the sent value, so the two agree.
  assert.strictEqual(hasDrift({ baseline: { p: 127 }, live: { p: 127 } }), false);
});

test('changing the sound is drift, even with every value equal', () => {
  assert.strictEqual(hasDrift({
    baseline: base, live: { ...base },
    baselineSound: 'Tine Piano', liveSound: 'Clavi Piano',
  }), true);
});

test('the same sound is not drift', () => {
  assert.strictEqual(hasDrift({
    baseline: base, live: { ...base },
    baselineSound: 'Tine Piano', liveSound: 'Tine Piano',
  }), false);
});

test('a key present in one side and not the other is drift', () => {
  assert.strictEqual(hasDrift({ baseline: base, live: { rho_atk: 64, rho_hrd: 30 } }), true,
    'a value that vanished');
  assert.strictEqual(hasDrift({ baseline: base, live: { ...base, extra: 1 } }), true,
    'and one that appeared');
});

test('no baseline means no claim', () => {
  // Nothing was sent, so there is nothing to have drifted FROM. Answering true
  // here would put a save button on a patch nobody has touched.
  assert.strictEqual(hasDrift({ baseline: null, live: { ...base } }), false);
  assert.strictEqual(hasDrift({ baseline: base, live: null }), false);
});

test('values are compared as numbers, not as strings', () => {
  // The device echoes numbers; a file may hold "64". "64" !== 64 would be a
  // permanent phantom drift on any patch that round-tripped through JSON oddly.
  assert.strictEqual(hasDrift({ baseline: { p: 64 }, live: { p: '64' } }), false);
});

// ---- A VALUE READ FROM THE INSTRUMENT IS NOT AN EDIT ----------------------
//
// REPRODUCES BANK 3 · PRESET 5, measured on hardware 2026-11-15. Exactly one
// of 110 parameters differed — zd6_br, backup record 0, instrument 1 — and
// selecting the slot reported "unsaved changes" within 1.9s, every time,
// touching nothing. Navigating away then asked whether to discard work nobody
// had done.
//
// The session's baseline is seeded from the patch on screen, which for a bank
// slot is the newest BACKUP RECORD. The panel poll reads the instrument and
// writes what it finds into the working copy. One stale parameter in the
// record is all it takes.

const { absorbPanelRead } = require('../src/drift.js');

test('the zd6_br case: a stale backup value is not the player\'s edit', () => {
  // The record said 0; the instrument says 1. Nobody has touched anything.
  const baseline = { zd6_br: 0, zd6_tr: 0 };
  const live = { zd6_br: 0, zd6_tr: 0 };

  const v = absorbPanelRead({
    firstSeen: true, editInFlight: false, current: live.zd6_br, reading: 1,
  });
  assert.strictEqual(v.changed, true, 'the reading differs from what the app believed');
  live.zd6_br = v.param;
  assert.strictEqual(v.baseline, true, 'and the first reading establishes the baseline');
  if (v.baseline) baseline.zd6_br = v.param;

  // THE WHOLE POINT: no drift, so no save bar and no dialog on the way out.
  assert.strictEqual(
    hasDrift({ baseline, live }), false,
    'a slot nobody touched reports no unsaved changes'
  );
});

test('a change AFTER the app has heard the parameter is a real edit', () => {
  // Otherwise the fix would swallow the thing the save bar exists for: a
  // Clavi tab flipped on the instrument is the player editing the sound.
  const baseline = { zd6_br: 1 };
  const live = { zd6_br: 1 };
  const v = absorbPanelRead({
    firstSeen: false, editInFlight: false, current: live.zd6_br, reading: 0,
  });
  live.zd6_br = v.param;
  assert.strictEqual(v.baseline, false, 'the baseline stays where it was');
  assert.strictEqual(hasDrift({ baseline, live }), true, 'so the edit counts');
});

test('a reading that arrives mid-send belongs to the player', () => {
  // A send that has gone out and not been echoed is a value they asked for,
  // so a reading landing on top of it must not become the starting state.
  const v = absorbPanelRead({
    firstSeen: true, editInFlight: true, current: 0, reading: 1,
  });
  assert.strictEqual(v.param, 1, 'the working copy still follows the instrument');
  assert.strictEqual(v.baseline, false, 'but the baseline does not move');
});

test('a reading that matches what the app already believed changes nothing', () => {
  const v = absorbPanelRead({
    firstSeen: true, editInFlight: false, current: 64, reading: 64,
  });
  assert.strictEqual(v.changed, false);
});
