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
