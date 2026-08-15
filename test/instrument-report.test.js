'use strict';

// The report a stranger's Seven sends home. The tests that matter most are the
// ones about what is NOT in it.

const test = require('node:test');
const assert = require('node:assert');

const { buildReport, reportFileName } = require('../src/instrument-report');
const { compareParamTables } = require('../src/param-compat');

const APP = [
  { id: 0, key: 'pno_lvl', label: 'Level', max: 127 },
  { id: 1, key: 'pno_atk', label: 'Attack', max: 127 },
  { id: 2, key: 'rev_lv', label: 'Reverb', max: 100 },
];
const DEVICE = {
  count: 2,
  fingerprint: 'aaaa1111bbbb2222',
  params: [
    { id: 0, key: 'pno_lvl', label: 'Level', max: 127, group: 'pno', cc: 7, value: 100, flag: 0 },
    { id: 1, key: 'pno_atk', label: 'Attack', max: 127, group: 'pno', cc: -1, value: 64, flag: 1 },
  ],
};
const SOUNDS = {
  fingerprint: 'cccc3333dddd4444',
  sounds: [
    { id: 0, name: 'Tine Piano', sampled: false },
    { id: 1, name: 'Venice Grand D-274', sampled: true },
  ],
};

const build = () => buildReport({
  appVersion: '0.1.0',
  schemaName: 'seven-1.37.json',
  appParamCount: APP.length,
  appFirmware: '1.37',
  firmware: 'CRUMAR Seven v.1.42 Build date: Mon Jan 5 09:00:00 2026',
  soundTable: SOUNDS,
  paramTable: DEVICE,
  verdict: compareParamTables(APP, DEVICE.params),
  created: '2026-08-15T10:00:00.000Z',
});

test('carries the instrument’s own description', () => {
  const r = build();
  assert.equal(r.report, 'crumar-seven-instrument');
  assert.equal(r.firmware, 'CRUMAR Seven v.1.42 Build date: Mon Jan 5 09:00:00 2026');
  assert.equal(r.parameters.count, 2);
  assert.equal(r.parameters.fingerprint, 'aaaa1111bbbb2222');
  // The WHOLE 0x15 reply, field for field — group, cc and flag are half of
  // what a schema entry is, and `value` completes the line the device sent.
  assert.deepEqual(r.parameters.list[1],
    { id: 1, group: 'pno', key: 'pno_atk', label: 'Attack', cc: -1, max: 127, value: 64, flag: 1 });
  assert.deepEqual(Object.keys(r.parameters.list[0]),
    ['id', 'group', 'key', 'label', 'cc', 'max', 'value', 'flag']);
  assert.equal(r.sounds.count, 2);
  assert.equal(r.sounds.list[1].name, 'Venice Grand D-274');
  assert.equal(r.app.version, '0.1.0');
  assert.equal(r.app.schema, 'seven-1.37.json');
  assert.equal(r.app.knownParameters, 3);
});

test('the file says what it diagnoses, so it cannot be read as a fault report', () => {
  const r = build();
  assert.match(r.diagnoses, /firmware whose parameter set differs from the schema/);
  assert.match(r.diagnoses, /not installed expansions/i);
});

test('the parameter table is NOT redacted — a report with holes helps nobody', () => {
  const r = build();
  const json = JSON.stringify(r);
  for (const p of DEVICE.params) assert.ok(json.includes(p.key), `${p.key} is present`);
  assert.ok(json.includes('Attack'), 'labels survive');
});

test('no globals reach the file, whatever the caller passes', () => {
  // The builder takes no globals argument at all. Handing it one — as a
  // careless future caller might — must not put it in the file: that reply
  // carries the instrument's Wi-Fi password in plaintext (Rule 6).
  const r = buildReport({
    appVersion: '0.1.0', schemaName: 's.json', appParamCount: 3,
    firmware: 'fw', soundTable: SOUNDS, paramTable: DEVICE, verdict: null,
    created: '2026-08-15T10:00:00.000Z',
    globals: { tun: 440, glb: [0, 0], wfp: 'hunter2' },
  });
  const json = JSON.stringify(r);
  assert.ok(!json.includes('hunter2'), 'no password');
  assert.ok(!json.includes('wfp'), 'no wfp key at all');
  assert.ok(!json.includes('glb'), 'no globals array');
  assert.equal(r.globals, undefined);
});

test('nothing from the library is included', () => {
  const json = JSON.stringify(build());
  for (const key of ['patches', 'setlists', 'library', 'file']) {
    assert.ok(!json.includes(`"${key}"`), `no ${key}`);
  }
});

test('the difference is stated up front, not left to be diffed out', () => {
  const r = build();
  assert.equal(r.difference.appCount, 3);
  assert.equal(r.difference.deviceCount, 2);
  assert.deepEqual(r.difference.missing, [2]);
  assert.equal(
    r.difference.summary,
    'This Seven reports 2 parameters on firmware 1.42; the app knows 3, built against 1.37.'
  );
  // The banner's consequence belongs to a different reader and stays out.
  const json = JSON.stringify(r);
  assert.ok(!json.includes('Backup and browsing still work'), 'no banner copy in the file');
  assert.ok(!json.includes('A report gives me'), 'and no ask');
});

test('the report’s sentence degrades a clause at a time, never a hole', () => {
  const base = {
    appVersion: '0.1.0', schemaName: 's.json', appParamCount: 3,
    soundTable: SOUNDS, paramTable: DEVICE, created: '2026-08-15T10:00:00.000Z',
    verdict: compareParamTables(APP, DEVICE.params),
  };
  const noFw = buildReport({ ...base, firmware: '', appFirmware: '1.37' });
  assert.equal(noFw.difference.summary,
    'This Seven reports 2 parameters; the app knows 3, built against 1.37.');
  const noSchemaFw = buildReport({
    ...base, firmware: 'CRUMAR Seven v.1.42 Build date: x', appFirmware: null,
  });
  assert.equal(noSchemaFw.difference.summary,
    'This Seven reports 2 parameters on firmware 1.42; the app knows 3.');
  for (const r of [noFw, noSchemaFw]) {
    assert.ok(!/undefined|null/.test(r.difference.summary), 'no hole');
  }
});

test('a report is still buildable with no verdict (an unreadable table)', () => {
  const r = buildReport({
    appVersion: '0.1.0', schemaName: 's.json', appParamCount: 3,
    firmware: 'fw', soundTable: SOUNDS, paramTable: null, verdict: null,
    created: '2026-08-15T10:00:00.000Z',
  });
  assert.equal(r.parameters.count, 0);
  assert.deepEqual(r.parameters.list, []);
  assert.equal(r.difference, null);
});

test('the filename carries the firmware version and the day', () => {
  assert.equal(
    reportFileName('CRUMAR Seven v.1.42 Build date: Mon Jan 5 09:00:00 2026', '2026-08-15T10:00:00.000Z'),
    'seven-instrument-report-1.42-2026-08-15.json'
  );
  assert.equal(
    reportFileName('', '2026-08-15T10:00:00.000Z'),
    'seven-instrument-report-unknown-2026-08-15.json'
  );
});
