'use strict';

// THE END OF A SEND, in all three shapes it has.
//
// One modal serves both flows — sendPatchToSlot and sendSetlist go through the
// same walk — so the single-send wording had to be added without touching the
// bank wording. These tests are what say it was.
//
// The third case is the reason any of this is a module. A SETLIST HOLDING ONE
// PATCH is a bank send that happens to write one preset, and it must read as
// one. Anything keyed on a count gets it wrong, and nobody would find that by
// hand: producing it means building a one-slot setlist and writing to a real
// instrument.

const test = require('node:test');
const assert = require('node:assert');

const summary = require('../src/transfer-summary.js');

// A finished report, as transfer-runner's finish() builds it.
const report = (over = {}) => ({
  type: 'transfer-done',
  bank: 3,
  setlistIndex: 0,
  name: null,
  preset: null,
  error: null,
  cancelled: false,
  confirmed: [1],
  alreadyThere: [],
  loadedNotConfirmed: [],
  total: 1,
  ...over,
});

const single = (over = {}) => report({
  setlistIndex: null, name: 'DX Synth Piano', preset: 1, ...over,
});

test('a single send names the patch and the whole destination', () => {
  const html = summary.body(single());
  assert.match(html, /<p class="tx-step-name">DX Synth Piano<\/p>/,
    'the patch is named — the modal never used to say what was sent');
  assert.match(html, /<p class="tx-step-where">Bank 3 · Preset 1<\/p>/,
    'and the destination includes the preset; "Bank 3" alone does not say where');
  assert.doesNotMatch(html, /preset stored|presets stored/,
    'no count: sequence language borrowed from the bank walk, counting to one');
});

test('a whole-bank send is untouched: the count and the bank', () => {
  const html = summary.body(report({ total: 8, confirmed: [1, 2, 3, 4, 5, 6, 7, 8] }));
  assert.match(html, /<p class="tx-step-name">8 of 8 presets stored<\/p>/);
  assert.match(html, /<p class="tx-step-where">Bank 3<\/p>/);
  assert.doesNotMatch(html, /Preset 1<\/p>/, 'a bank send has no single destination to name');
});

test('a ONE-SLOT SETLIST is a bank send, not a single send', () => {
  // THE CASE THE DISCRIMINATOR EXISTS FOR. Every count-based test would pass
  // while this rendered the wrong thing: total is 1, confirmed is 1, and it is
  // still a setlist going to a bank.
  const html = summary.body(report({ setlistIndex: 2, total: 1, confirmed: [4] }));
  assert.match(html, /1 of 1 preset stored/, 'it keeps the count');
  assert.match(html, /<p class="tx-step-where">Bank 3<\/p>/, 'and the bank alone');
  assert.doesNotMatch(html, /· Preset/, 'no single-send destination line');
});

test('the singular is chosen by the COUNT, not by the flow', () => {
  // "1 of 1 preset stored", not "presets" — the one-slot setlist above is the
  // only place this is now reachable, so it is asserted where it lives.
  assert.match(summary.body(report({ setlistIndex: 2, total: 1 })), /1 preset stored/);
  assert.match(summary.body(report({ setlistIndex: 2, total: 2 })), /of 2 presets stored/);
});

test('a single send whose preset already held it says so, and still names it', () => {
  // For a bank, "every slot already matched" replaces the headline. For ONE
  // preset that would be wrong — "Bank 3 already matched" is a claim about
  // eight slots — so the single wording stands and the line below explains.
  const html = summary.body(single({ confirmed: [], alreadyThere: [1] }));
  assert.match(html, /DX Synth Piano/, 'the patch is still named');
  assert.match(html, /Bank 3 · Preset 1/, 'and so is where it was aimed');
  assert.doesNotMatch(html, /already matched/, 'no bank-wide claim from one preset');
  assert.match(html, /Preset 1 already held its patch, so nothing was sent\./);
});

test('a bank where every slot already matched keeps its own headline', () => {
  const html = summary.body(report({
    setlistIndex: 0, total: 8, confirmed: [], alreadyThere: [1, 2, 3, 4, 5, 6, 7, 8],
  }));
  assert.match(html, /Bank 3 already matched — nothing needed storing/);
  assert.doesNotMatch(html, /0 of 8/, '"0 of 8 presets stored" reads as failure when it is not');
});

test('the unconfirmed-hold note survives in both flows', () => {
  // The store-detection distinction: loaded into the buffer, never held.
  for (const r of [single({ confirmed: [], loadedNotConfirmed: [1] }),
    report({ total: 8, confirmed: [1], loadedNotConfirmed: [2] })]) {
    assert.match(summary.body(r),
      /was loaded but you did not confirm the hold/,
      'it is still in the edit buffer rather than saved on the instrument');
  }
});

test('an error is shown above whichever headline applies', () => {
  const html = summary.body(single({ error: 'The Seven stopped answering.' }));
  assert.match(html, /^<p class="tx-note tx-alarm">The Seven stopped answering\.<\/p>/);
  assert.match(html, /DX Synth Piano/, 'and the send still says what it was sending');
  assert.strictEqual(summary.title(single({ error: 'x' })), 'Send stopped');
  assert.strictEqual(summary.title(single({ cancelled: true })), 'Send stopped');
  assert.strictEqual(summary.title(single()), 'Sent to Seven');
});

test('a patch name cannot become markup', () => {
  // Names come off disk. The bank headline is built from numbers; this one is
  // built from a filename.
  const html = summary.body(single({ name: '<img src=x onerror="1">' }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;1&quot;&gt;/);
});

test('setlistIndex must be exactly null to mean "single"', () => {
  // A report from a run that never started carries neither field. Undefined is
  // unknown, and unknown must not render as a single send with no name.
  assert.strictEqual(summary.isSingle(report({ setlistIndex: null })), true);
  assert.strictEqual(summary.isSingle(report({ setlistIndex: 0 })), false);
  assert.strictEqual(summary.isSingle(report({ setlistIndex: undefined })), false);
  assert.strictEqual(summary.isSingle(null), false);
});
