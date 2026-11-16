'use strict';

// The CC map decides which panel announcements the app acts on. It used to be
// built from the schema's `cc` field alone, which is meaningful only where
// `flag` is 1 — see src/cc-map.js and docs/SCHEMA-VS-MANUAL.md §2.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildCcMap } = require('../src/cc-map');

const schema = require('../schema/seven-1.37.json');
const params = schema.parameters;

// The manual's §10.4 fixed map, transcribed. The point of listing it here is
// that the expectation comes from the DOCUMENT rather than from the code
// under test — a map built from the schema and checked against the schema
// would agree with itself however wrong it was.
const MANUAL_CC = {
  7: 'veq_vol', 12: 'veq_bas', 13: 'veq_trb', 14: 'veq_mid', 15: 'veq_mdf',
  16: 'veq_byp', 20: 'fx1_sw', 21: 'fx1_md', 22: 'fx1_dp', 23: 'fx1_sp',
  24: 'fx2_sw', 25: 'fx2_md', 26: 'fx2_dp', 27: 'fx2_sp', 28: 'amp_sw',
  29: 'amp_dr', 30: 'rev_sw', 31: 'pad_sw', 32: 'pad_lv', 33: 'pad_bl',
  91: 'rev_lv', 92: 'rev_dc',
};

test('the map is exactly the 22 CCs the manual documents', () => {
  const map = buildCcMap(params);
  assert.deepStrictEqual(map, MANUAL_CC);
  assert.strictEqual(Object.keys(map).length, 22);
});

test('nothing from the expression pedal leaks in', () => {
  // THE WHOLE POINT. exp_fn (107) reports cc 1, exp_mn (108) reports 0 and
  // exp_mx (109) reports 1 — the only three parameters in the table that use
  // something other than -1 for "no CC". The manual lists the expression
  // pedal as absent from the map entirely.
  const map = buildCcMap(params);
  const leaked = Object.entries(map).filter(([, key]) => /^exp_/.test(key));
  assert.deepStrictEqual(leaked, [],
    `expression-pedal parameters are not CC-assigned: ${JSON.stringify(leaked)}`);
  // And specifically: the two CC numbers they claimed must mean nothing.
  assert.strictEqual(map[0], undefined, 'CC 0 (Bank Select MSB) maps to nothing');
  assert.strictEqual(map[1], undefined, 'CC 1 (Mod Wheel) maps to nothing');
});

test('every mapped parameter carries flag=1, and every flag=1 is mapped', () => {
  const map = buildCcMap(params);
  const byKey = new Map(params.map((p) => [p.key, p]));
  for (const key of Object.values(map)) {
    assert.strictEqual(byKey.get(key).flag, 1, `${key} should be flag=1`);
  }
  const flagged = params.filter((p) => p.flag === 1).map((p) => p.key).sort();
  assert.deepStrictEqual(Object.values(map).sort(), flagged,
    'the map is exactly the flag=1 parameters — no more, no fewer');
});

test('a later id cannot overwrite an earlier one', () => {
  // The old builder was `map[p.cc] = p.key`, so two parameters claiming one
  // CC left whichever came last. That is how CC 1 resolved to exp_mx rather
  // than exp_fn. With the gate there are no duplicates to resolve, and this
  // asserts the absence rather than trusting it.
  const map = buildCcMap(params);
  const seen = new Map();
  for (const p of params) {
    if (p.flag !== 1) continue;
    assert.ok(!seen.has(p.cc), `CC ${p.cc} is claimed by both ${seen.get(p.cc)} and ${p.key}`);
    seen.set(p.cc, p.key);
  }
  assert.strictEqual(seen.size, Object.keys(map).length);
});

test('main.js builds the map through the gate rather than its own loop', () => {
  // main.js cannot be required — it pulls in Electron — so this reads it, the
  // same technique css-hazards.test.js uses. Without it the module could be
  // correct while the handler kept the old inline loop.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /buildCcMap\(getSchema\(\)\.parameters\)/,
    'the handler delegates to buildCcMap');
  assert.doesNotMatch(src, /if \(p\.cc >= 0\) map\[p\.cc\]/,
    'and the old cc-only loop is gone');
});
