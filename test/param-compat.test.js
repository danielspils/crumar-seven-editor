'use strict';

// The write gate: does the instrument have the parameter map this build knows?
// Pure comparison, so every case below runs without hardware — including the
// ones no instrument in this room can produce (a 104-parameter unit).

const test = require('node:test');
const assert = require('node:assert');

const {
  compareParamTables, unreadableVerdict, blockMessage, gateParagraphs,
  firmwareVersion, CONSEQUENCE, ASK,
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

// --- the banner ------------------------------------------------------------

const app110 = Array.from({ length: 110 }, (_, i) => P(i, `k${i}`));
const mismatch104 = () => compareParamTables(app110, app110.slice(0, 104));
const FW = 'CRUMAR Seven v.1.22 Build date: Thu May 12 15:43:17 2022';

test('the banner names both firmwares and both counts, all read live', () => {
  const paras = gateParagraphs(mismatch104(), { deviceFirmware: FW, appFirmware: '1.37' });
  assert.equal(paras.length, 3);
  assert.equal(
    paras[0],
    'This Seven is running firmware 1.22. This app was built against 1.37, ' +
    'and this instrument reports 104 parameters where the app knows 110.'
  );
  assert.equal(paras[1], CONSEQUENCE);
  assert.equal(paras[2], ASK);
});

test('the consequence says WHY, and never says the block will lift', () => {
  assert.match(CONSEQUENCE, /hasn’t|hasn't/);
  assert.match(CONSEQUENCE, /verified against this firmware/);
  assert.ok(!/until/i.test(CONSEQUENCE), 'nothing here implies waiting helps');
});

test('the ask is first-person and promises nothing', () => {
  assert.equal(ASK, 'A report gives me what I\'d need to add support for it.');
  assert.ok(!/\bwe\b/i.test(ASK), 'one person, so “me”');
  assert.ok(!/will (fix|add|support)/i.test(ASK), 'no promise of a fix');
});

test('an unreadable firmware string drops that sentence rather than printing a hole', () => {
  for (const bad of ['', null, undefined, 'garbled nonsense with no version']) {
    const paras = gateParagraphs(mismatch104(), { deviceFirmware: bad, appFirmware: '1.37' });
    assert.equal(paras[0], 'This instrument reports 104 parameters where the app knows 110.');
    assert.ok(!/undefined|null|firmware \./i.test(paras.join(' ')), `no hole for ${JSON.stringify(bad)}`);
  }
});

test('firmwareVersion reads the version out of the device’s own string', () => {
  assert.equal(firmwareVersion('CRUMAR Seven v.1.37 Build date: x'), '1.37');
  assert.equal(firmwareVersion('CRUMAR Seven v1.42'), '1.42');
  assert.equal(firmwareVersion('no version here'), null);
  assert.equal(firmwareVersion(''), null);
});

test('a rename is named too, when the counts alone would not explain it', () => {
  const dev = app110.map((p) => ({ ...p }));
  dev[3] = P(3, 'something_else');
  const paras = gateParagraphs(compareParamTables(app110, dev), {
    deviceFirmware: FW, appFirmware: '1.37',
  });
  assert.match(paras[0], /calls parameter 3 “something_else” where the app expects “k3”/);
});

test('the one-line message is the same facts without the ask', () => {
  const v = mismatch104();
  const opts = { deviceFirmware: FW, appFirmware: '1.37' };
  const [lead, consequence] = gateParagraphs(v, opts);
  assert.equal(blockMessage(v, opts), `${lead} ${consequence}`);
  assert.ok(!blockMessage(v, opts).includes(ASK), 'a thrown error does not ask for a favour');
});

test('a matching instrument produces no banner at all', () => {
  const v = compareParamTables(app110, app110.map((p) => ({ ...p })));
  assert.deepEqual(gateParagraphs(v, { deviceFirmware: FW, appFirmware: '1.37' }), []);
  assert.equal(blockMessage(v), '');
});
