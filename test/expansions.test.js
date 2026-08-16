'use strict';

// Which sample sets exist, and which this instrument has. The cases that matter
// are the ones where the honest answer is "I don't know": an expansion nobody
// here owns, and an instrument that isn't plugged in.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { classify, kindOf, downloadSize } = require('../src/expansions');

const catalogue = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'expansions.json'), 'utf8')
);

// Daniel's own unit, as its sound table reports itself (24 sounds, fingerprint
// 741ecb059575ba38, read 2026-08-15 — the same table the instrument report
// carries).
const HIS_UNIT = [
  'Tine Piano', 'Reed Piano', 'Electric Grand Piano', 'Clavi Piano',
  'DX Synth Piano', 'MKS Synth Piano', 'Vibraphone', 'Acoustic Piano',
  'GSi Grand D', 'Ballad Piano', 'Combo Piano', 'Sampled Tine Piano',
  'Sampled Reed Piano', 'Sampled CP Piano', 'Sampled Clavi Piano',
  'Sampled Vibraphone',
  'Electric Grand 70B XL', 'Venice Grand Breeze', 'Venice Grand CB1898',
  'Venice Grand D-274', 'Venice Grand Open', 'Venice Grand',
  'Venice Upright U1 Felt', 'Venice Upright U1',
].map((name, id) => ({ id, name, sampled: id > 7 }));

const byTitle = (r, title) => r.expansions.find((e) => e.title === title);

test('the three groups follow the instrument’s own id ranges', () => {
  assert.equal(kindOf(0), 'modeled');
  assert.equal(kindOf(7), 'modeled');
  assert.equal(kindOf(8), 'included');
  assert.equal(kindOf(15), 'included');
  assert.equal(kindOf(16), 'expansion');
  assert.equal(kindOf(23), 'expansion');
  const r = classify(catalogue, HIS_UNIT);
  assert.equal(r.modeled.length, 8);
  assert.equal(r.included.length, 8);
  assert.equal(r.modeled[7].name, 'Acoustic Piano');
  assert.equal(r.included[0].name, 'GSi Grand D');
});

test('an expansion this unit has reads as installed', () => {
  const r = classify(catalogue, HIS_UNIT);
  for (const title of [
    'Venice Grand D-274', 'Venice Grand', 'Venice Grand Open',
    'Venice Grand CB1898', 'Venice Grand Breeze',
  ]) {
    assert.equal(byTitle(r, title).status, 'installed', title);
  }
});

test('the download title and the device name differ, and matching uses the device’s', () => {
  // Crumar's page says "Electric Grand 70BXL"; the instrument says
  // "Electric Grand 70B XL". Matching on the title would miss it.
  const r = classify(catalogue, HIS_UNIT);
  const e = byTitle(r, 'Electric Grand 70BXL');
  assert.deepEqual(e.sounds, ['Electric Grand 70B XL']);
  assert.equal(e.status, 'installed');
});

test('one download can supply several sounds, and needs all of them', () => {
  const r = classify(catalogue, HIS_UNIT);
  const u1 = byTitle(r, 'Venice Upright U1/Felt');
  assert.deepEqual(u1.sounds, ['Venice Upright U1 Felt', 'Venice Upright U1']);
  assert.equal(u1.status, 'installed');

  // Only one of the two present: neither installed nor missing.
  const half = classify(catalogue, HIS_UNIT.filter((s) => s.name !== 'Venice Upright U1'));
  assert.equal(byTitle(half, 'Venice Upright U1/Felt').status, 'partial');
});

test('an expansion nobody here owns is UNVERIFIED, never flatly missing', () => {
  const r = classify(catalogue, HIS_UNIT);
  for (const title of ['Venice Grand CFX', 'Venice Upright K8', 'Venice Grand C5']) {
    const e = byTitle(r, title);
    assert.equal(e.sounds, null, `${title} has no guessed sound names`);
    assert.equal(e.status, 'unverified', title);
  }
});

test('an expansion whose sounds are known and absent IS not-installed', () => {
  const without = HIS_UNIT.filter((s) => s.name !== 'Venice Grand D-274');
  const r = classify(catalogue, without);
  assert.equal(byTitle(r, 'Venice Grand D-274').status, 'not-installed');
});

test('a sound the catalogue does not claim gets its own line', () => {
  const withMystery = [...HIS_UNIT, { id: 24, name: 'Venice Grand Nobody Knows', sampled: true }];
  const r = classify(catalogue, withMystery);
  assert.deepEqual(r.unaccounted, [{ id: 24, name: 'Venice Grand Nobody Knows' }]);
  // And a matched sound never appears there.
  assert.equal(classify(catalogue, HIS_UNIT).unaccounted.length, 0);
});

test('offline there is no installed/missing state at all', () => {
  const r = classify(catalogue, null);
  assert.equal(r.connected, false);
  assert.equal(r.modeled.length, 0, 'no instrument, so no instrument sounds');
  assert.equal(r.included.length, 0);
  assert.equal(r.expansions.length, catalogue.expansions.length, 'the catalogue still lists');
  for (const e of r.expansions) {
    assert.equal(e.status, 'unknown', `${e.title} claims nothing`);
  }
  assert.deepEqual(r.unaccounted, []);
});

test('names match with different spacing or case, since the two sources drift', () => {
  const odd = HIS_UNIT.map((s) => (
    s.name === 'Venice Grand D-274' ? { ...s, name: '  venice  grand  D-274 ' } : s
  ));
  assert.equal(byTitle(classify(catalogue, odd), 'Venice Grand D-274').status, 'installed');
});

test('sizes are printed as the download sizes they are, never converted or summed', () => {
  assert.equal(downloadSize(354.09), '354.09 Mb');
  assert.equal(downloadSize(248.5), '248.50 Mb');
  assert.equal(downloadSize(null), '—');
});

test('the catalogue file itself is complete and honest', () => {
  assert.equal(catalogue.expansions.length, 10);
  assert.match(catalogue.note, /DOWNLOAD sizes/);
  assert.match(catalogue.note, /NOT measured/);
  for (const e of catalogue.expansions) {
    assert.ok(e.title && e.released && typeof e.downloadMb === 'number', e.title);
    assert.ok(e.sounds === null || Array.isArray(e.sounds), `${e.title} is names or null`);
  }
  // Exactly the three Daniel does not own carry null.
  const unknown = catalogue.expansions.filter((e) => e.sounds === null).map((e) => e.title);
  assert.deepEqual(unknown.sort(), ['Venice Grand C5', 'Venice Grand CFX', 'Venice Upright K8']);
});

test('ids come from the instrument, and only for what it actually has', () => {
  const r = classify(catalogue, HIS_UNIT);
  // One download, two sounds, two ids — the instrument's own numbering.
  assert.deepEqual(byTitle(r, 'Venice Upright U1/Felt').ids, [22, 23]);
  assert.deepEqual(byTitle(r, 'Venice Grand D-274').ids, [19]);
  assert.deepEqual(byTitle(r, 'Electric Grand 70BXL').ids, [16]);
  // Not installed and unverified expansions have NO id, not a made-up one.
  assert.deepEqual(byTitle(r, 'Venice Grand CFX').ids, []);
  const without = HIS_UNIT.filter((s) => s.name !== 'Venice Grand D-274');
  assert.deepEqual(byTitle(classify(catalogue, without), 'Venice Grand D-274').ids, []);
  // Half a download installed: only the id that exists.
  const half = HIS_UNIT.filter((s) => s.name !== 'Venice Upright U1');
  assert.deepEqual(byTitle(classify(catalogue, half), 'Venice Upright U1/Felt').ids, [22]);
  // Offline there are no ids at all.
  for (const e of classify(catalogue, null).expansions) assert.deepEqual(e.ids, []);
});
