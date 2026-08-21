'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { storageLabel } = require('../src/storage-label.js');

test('the word "free" is always there', () => {
  assert.strictEqual(storageLabel('2.5GB'), '2.5GB free');
});

test('A BARE SIZE IS NEVER PRODUCED, whatever comes off the wire', () => {
  // The misreading that got the display deleted in c052079: a number that
  // moves, read as a fixed capacity. It moves because free space moves.
  for (const raw of ['2.5GB', '4.0GB', '512MB', '1.2 GB', '  3.0GB  ']) {
    const out = storageLabel(raw);
    assert.match(out, /free/, `"${raw}" -> "${out}" must say free`);
  }
});

test('nothing read means NO FIELD, not a zero', () => {
  // An absent field says "not asked". A zero would claim a full instrument.
  assert.strictEqual(storageLabel(null), '');
  assert.strictEqual(storageLabel(undefined), '');
  assert.strictEqual(storageLabel(''), '');
  assert.strictEqual(storageLabel('   '), '');
});

test('a firmware that already says "free" is not made to say it twice', () => {
  assert.strictEqual(storageLabel('2.5GB free'), '2.5GB free');
  assert.strictEqual(storageLabel('2.5GB Free'), '2.5GB Free');
});

test('whatever the device says is kept verbatim inside the label', () => {
  // The units are the instrument's own and are never converted — the download
  // sizes in the catalogue are in Mb and mean a different thing entirely.
  assert.match(storageLabel('4.0GB'), /^4\.0GB /);
});
