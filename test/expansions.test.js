'use strict';

// Which sample sets exist, and which this instrument has. The cases that matter
// are the ones where the honest answer is "I don't know": an expansion nobody
// here owns, and an instrument that isn't plugged in.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { classify, kindOf, downloadSize, availableCount } = require('../src/expansions');

const catalogue = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'expansions.json'), 'utf8')
);

// Daniel's own unit, as its sound table reports itself (27 sounds, fingerprint
// 4cf1434f54c9b036, read 2026-08-20 after installing C5, CFX and K8 — before
// that it was 24 sounds, fingerprint 741ecb059575ba38).
//
// INSTALLING RENUMBERS. These ids are positions in an alphabetical list, so
// adding C5 moved CB1898 from 18 to 19 on the SAME instrument. Ids are not
// portable between units and are not stable within one either; nothing is ever
// keyed by them (schema soundsNote).
const HIS_UNIT = [
  'Tine Piano', 'Reed Piano', 'Electric Grand Piano', 'Clavi Piano',
  'DX Synth Piano', 'MKS Synth Piano', 'Vibraphone', 'Acoustic Piano',
  'GSi Grand D', 'Ballad Piano', 'Combo Piano', 'Sampled Tine Piano',
  'Sampled Reed Piano', 'Sampled CP Piano', 'Sampled Clavi Piano',
  'Sampled Vibraphone',
  'Electric Grand 70B XL', 'Venice Grand Breeze', 'Venice Grand C5',
  'Venice Grand CB1898', 'Venice Grand CFX', 'Venice Grand D-274',
  'Venice Grand Open', 'Venice Grand',
  'Venice Upright K8', 'Venice Upright U1 Felt', 'Venice Upright U1',
].map((name, id) => ({ id, name, sampled: id > 7 }));

// A catalogue entry nobody has inspected, and an instrument that HAS the sound
// it supplies. Synthetic on purpose: Daniel now owns all ten real expansions,
// so this state can no longer be produced from the real catalogue — and it is
// the state that shipped a bug to a stranger (Rich Olivieri, 2026-08-19).
// The real ten PLUS one nobody has inspected — the state the catalogue will be
// in the day Crumar ships another, for everyone who does not own it.
const UNCATALOGUED = {
  ...catalogue,
  expansions: [
    ...catalogue.expansions,
    { title: 'Venice Grand Number Eleven', released: '2027-01', downloadMb: 100, sounds: null },
  ],
};
const ELEVENTH = (r) => r.expansions.find((e) => e.title === 'Venice Grand Number Eleven');
const HAS_ELEVEN = [...HIS_UNIT, { id: 27, name: 'Venice Grand Number Eleven', sampled: true }];

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
  const e = ELEVENTH(classify(UNCATALOGUED, HIS_UNIT));
  assert.equal(e.sounds, null, 'no sound names are ever guessed');
  assert.equal(e.status, 'unverified');
});

// THE REGRESSION. An entry with `sounds: null` claims nothing, so the sound it
// supplies is not in `claimed` and lands in `unaccounted` — while the entry
// itself still renders as a catalogue row. The owner then sees the SAME sound
// twice: once as "Installed, not in the catalogue" and once as "Unverified",
// which is the app saying both "you own something I don't recognise" and
// "here's one you don't have" (Rich Olivieri, 2026-08-19).
//
// The old test asserted only that the entry read 'unverified' — true, and not
// the bug. Nothing checked the two halves TOGETHER, which is how this shipped.
//
// It is a fixture rather than a real entry because all ten real ones are now
// catalogued: this can never be reproduced by hand again, and expansion number
// eleven will arrive for someone who does not own it.
test('an uncatalogued expansion is listed twice — the shape Rich saw', () => {
  const r = classify(UNCATALOGUED, HAS_ELEVEN);
  const e = ELEVENTH(r);

  // Half one: the catalogue row, which cannot say installed or missing.
  assert.equal(e.status, 'unverified');
  assert.deepEqual(e.ids, [], 'and it has no id, because nothing matched');

  // Half two: the SAME sound, reported as unaccounted for.
  assert.deepEqual(r.unaccounted, [{ id: 27, name: 'Venice Grand Number Eleven' }]);

  // But the COUNT no longer claims it. "We don't know what is in this" is not
  // "you don't have this", and the header used to say the second — offering a
  // sample set the owner had already installed.
  assert.equal(availableCount(r.expansions), 0, 'nothing uninspected is offered as available');
  assert.equal(r.expansions.length, 11, 'the other ten all matched');
});

// The counterpart: a sound no entry supplies SHOULD be unaccounted, so the fix
// for the above can never be "stop reporting unaccounted sounds".
test('a sound genuinely outside the catalogue is still reported', () => {
  const r = classify(catalogue, [...HIS_UNIT, { id: 27, name: 'Venice Grand Mystery', sampled: true }]);
  assert.deepEqual(r.unaccounted, [{ id: 27, name: 'Venice Grand Mystery' }]);
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
  // Every entry is catalogued now: Daniel owns all ten, and each one's sound
  // names were read off his instrument (2026-08-20). `sounds: null` remains
  // legal — it is what expansion eleven will arrive as — but nothing carries
  // it today, which is why the double-listing fixture above is synthetic.
  const unknown = catalogue.expansions.filter((e) => e.sounds === null).map((e) => e.title);
  assert.deepEqual(unknown, [], 'no entry is uncatalogued');
  for (const e of catalogue.expansions) {
    assert.ok(Array.isArray(e.sounds) && e.sounds.length, `${e.title} names its sounds`);
  }
});

test('ids come from the instrument, and only for what it actually has', () => {
  const r = classify(catalogue, HIS_UNIT);
  // One download, two sounds, two ids — the instrument's own numbering. These
  // moved when C5 and K8 were installed (U1/Felt was [22, 23] on the 24-sound
  // table); the list is alphabetical, so an insert renumbers everything after
  // it on the SAME unit.
  assert.deepEqual(byTitle(r, 'Venice Upright U1/Felt').ids, [25, 26]);
  assert.deepEqual(byTitle(r, 'Venice Grand D-274').ids, [21]);
  assert.deepEqual(byTitle(r, 'Electric Grand 70BXL').ids, [16]);
  // An expansion this unit lacks has NO id, not a made-up one.
  const noD274 = classify(catalogue, HIS_UNIT.filter((x) => x.name !== 'Venice Grand D-274'));
  assert.deepEqual(byTitle(noD274, 'Venice Grand D-274').ids, []);
  // Half a download installed: only the id that exists.
  const half = HIS_UNIT.filter((s) => s.name !== 'Venice Upright U1');
  assert.deepEqual(byTitle(classify(catalogue, half), 'Venice Upright U1/Felt').ids, [25]);
  // Offline there are no ids at all.
  for (const e of classify(catalogue, null).expansions) assert.deepEqual(e.ids, []);
});

test('the available count never includes an expansion nobody has inspected', () => {
  const rows = [
    { status: 'installed' }, { status: 'not-installed' },
    { status: 'partial' }, { status: 'unverified' },
  ];
  // not-installed and partial are real answers about what is missing;
  // unverified is the absence of an answer and is not counted.
  assert.equal(availableCount(rows), 2);
  assert.equal(availableCount([{ status: 'unverified' }]), 0);
  assert.equal(availableCount([]), 0);
  assert.equal(availableCount(null), 0);
});
