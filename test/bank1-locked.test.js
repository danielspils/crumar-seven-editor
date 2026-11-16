'use strict';

// ONE SENTENCE FOR ONE FACT.
//
// Bank 1 cannot be stored to, and the app says so in four places: the bank
// tab's lock tooltip, the note in the save dialog where the Seven row would
// be, and the transfer runner's three refusals. Until 16 Nov 2026 those were
// TWO different sentences — "Bank 1 holds the factory presets and cannot be
// written to." in save-plan.js and "Crumar reserves Bank 1 for its 8 models —
// they can not be overwritten." in app.js — which is how an inventory of what
// the app says starts implying there are two rules.
//
// Daniel chose one wording on purpose. These tests exist so that choice
// cannot quietly be un-made by a second variant appearing somewhere.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));

const WORDING = 'Crumar reserves Bank 1 for its 8 models — they cannot be overwritten.';

test('the Bank 1 sentence is Daniel\'s wording, exactly', () => {
  const { BANK1_LOCKED } = require('../src/save-plan');
  assert.strictEqual(BANK1_LOCKED, WORDING);
  // The em dash is an em dash and the 8 is a numeral. Both are easy to lose
  // to an editor being helpful, and both are the wording he chose.
  assert.match(BANK1_LOCKED, /—/, 'an em dash, not a hyphen');
  assert.match(BANK1_LOCKED, /its 8 models/, 'the numeral 8, not "eight"');
  assert.doesNotMatch(BANK1_LOCKED, /can not/, '"cannot", corrected 16 Nov 2026');
});

test('it is written down once, and every other place reads that one', () => {
  const defining = [];
  for (const f of files) {
    const src = read(f);
    // A LITERAL, not a mention. Comments are stripped so the paragraph above
    // a constant explaining what it replaced cannot count as a second copy —
    // which it otherwise would, and the first version of this test failed on
    // exactly that.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (code.includes(WORDING)) defining.push(f);
  }
  assert.deepStrictEqual(defining, ['save-plan.js'],
    `the sentence should be a literal in save-plan.js alone, found in: ${defining.join(', ')}`);
});

test('no older phrasing of the same fact survives anywhere', () => {
  // The two it replaced, and the near-misses most likely to be reintroduced
  // by someone retyping it from memory.
  const stale = [
    'holds the factory presets',
    'can not be overwritten',
    'cannot be written to',
    'eight models',
  ];
  const found = [];
  for (const f of files) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const s of stale) if (code.includes(s)) found.push(`${f}: "${s}"`);
  }
  assert.deepStrictEqual(found, [],
    `an older phrasing of the Bank 1 rule is still in the source: ${found.join(', ')}`);
});

test('the surfaces that state it all read the shared constant', () => {
  // app.js is a renderer script and cannot be required here, so this reads it
  // as text — the same technique the wiring tests use. Without it the
  // constant could be correct while a surface kept a private copy, which is
  // precisely the state this change ended.
  const app = read('app.js').replace(/^\s*\/\/.*$/gm, '');
  assert.match(app, /BANK1_LOCK_TIP = SevenSavePlan\.BANK1_LOCKED/,
    'the bank tab lock tooltip reads the shared constant');

  const runner = read('transfer-runner.js').replace(/^\s*\/\/.*$/gm, '');
  assert.match(runner, /const \{ BANK1_LOCKED \} = require\('\.\/save-plan'\)/,
    'the transfer runner imports it');
  const uses = (runner.match(/BANK1_LOCKED/g) || []).length;
  assert.ok(uses >= 4, `and uses it for each refusal (${uses} references incl. the import)`);

  const plan = read('save-plan.js').replace(/^\s*\/\/.*$/gm, '');
  assert.match(plan, /rows\.push\(\{ kind: 'note', text: BANK1_LOCKED \}\)/,
    'the save dialog renders it as the note in the Seven row\'s place');
});
