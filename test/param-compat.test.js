'use strict';

// The write gate: does the instrument have the parameter map this build knows?
// Pure comparison, so every case below runs without hardware — including the
// ones no instrument in this room can produce (a 104-parameter unit).

const test = require('node:test');
const assert = require('node:assert');

const {
  compareParamTables, unreadableVerdict, blockMessage, CONSEQUENCE,
} = require('../src/param-compat');

const P = (id, key, label = key, max = 127) => ({ id, key, label, max });
const APP = [P(0, 'pno_lvl', 'Level'), P(1, 'pno_atk', 'Attack'), P(2, 'rev_lv', 'Reverb')];

test('identical tables match and say nothing', () => {
  const v = compareParamTables(APP, APP.map((p) => ({ ...p })));
  assert.equal(v.ok, true);
  assert.equal(v.summary, '');
  assert.equal(blockMessage(v), '');
});

test('order does not matter — the tables are compared by id', () => {
  const v = compareParamTables(APP, [...APP].reverse().map((p) => ({ ...p })));
  assert.equal(v.ok, true);
});

test('fewer parameters on the device blocks, and says the two counts', () => {
  const v = compareParamTables(APP, APP.slice(0, 2));
  assert.equal(v.ok, false);
  assert.equal(v.deviceCount, 2);
  assert.equal(v.appCount, 3);
  assert.deepEqual(v.missing, [2]);
  assert.equal(v.summary, 'This instrument reports 2 parameters; the app knows 3.');
});

test('the count sentence is the one Daniel specified', () => {
  const app = Array.from({ length: 110 }, (_, i) => P(i, `k${i}`));
  const v = compareParamTables(app, app.slice(0, 104));
  assert.match(v.summary, /^This instrument reports 104 parameters; the app knows 110\./);
});

test('same count, different key at an id — blocks and names the id', () => {
  const dev = APP.map((p) => ({ ...p }));
  dev[1] = P(1, 'pno_dec', 'Decay');
  const v = compareParamTables(APP, dev);
  assert.equal(v.ok, false);
  assert.deepEqual(v.renamed, [{ id: 1, app: 'pno_atk', device: 'pno_dec' }]);
  assert.equal(
    v.summary,
    'This instrument calls parameter 1 “pno_dec”; the app expects “pno_atk”.'
  );
});

test('several renames are counted, not listed to death', () => {
  const dev = [P(0, 'a'), P(1, 'b'), P(2, 'c')];
  const v = compareParamTables(APP, dev);
  assert.equal(v.renamed.length, 3);
  assert.match(v.summary, /2 more names differ\./);
});

test('a label difference is reported and does NOT block', () => {
  const dev = APP.map((p) => ({ ...p }));
  dev[0] = P(0, 'pno_lvl', 'Volume');
  const v = compareParamTables(APP, dev);
  assert.equal(v.ok, true);
  assert.deepEqual(v.labelDrift, [{ id: 0, key: 'pno_lvl', app: 'Level', device: 'Volume' }]);
});

test('a max difference is reported and does NOT block', () => {
  const dev = APP.map((p) => ({ ...p }));
  dev[2] = P(2, 'rev_lv', 'Reverb', 100);
  const v = compareParamTables(APP, dev);
  assert.equal(v.ok, true);
  assert.deepEqual(v.maxDrift, [{ id: 2, key: 'rev_lv', app: 127, device: 100 }]);
});

test('an extra parameter on the device blocks too', () => {
  const v = compareParamTables(APP, [...APP, P(3, 'new_thing')]);
  assert.equal(v.ok, false);
  assert.deepEqual(v.extra, [3]);
});

test('an unreadable table is treated exactly like a mismatch', () => {
  const v = unreadableVerdict('no answer for parameter 22');
  assert.equal(v.ok, false);
  assert.equal(
    v.summary,
    "The instrument's parameter table could not be read (no answer for parameter 22)."
  );
});

test('the block message is what differs, then what it costs', () => {
  const v = compareParamTables(APP, APP.slice(0, 2));
  assert.equal(blockMessage(v), `${v.summary} ${CONSEQUENCE}`);
});
