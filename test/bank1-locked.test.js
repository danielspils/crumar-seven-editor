'use strict';

// ONE SENTENCE PER JOB, AND ONE FILE FOR BOTH.
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
//
// SINCE 17 NOV THERE ARE TWO SENTENCES, AND THAT IS NOT A RELAPSE. They do
// two different jobs and the file says which is which:
//
//   BANK1_LOCKED  a REFUSAL. "why did that not work" — shown at the moment
//                 somebody tries. Names the consequence.
//   BANK1_FOOT    a DESCRIPTION. "what is this bank" — sits under Bank 1's
//                 rows whether or not anybody tries anything.
//
// The thing the 16 Nov commit actually ended was two phrasings in two FILES,
// drifting apart with nobody owning either. Both of these are literals in
// save-plan.js and every surface reads them from there, so these tests check
// that property rather than counting sentences — which is why the test below
// is "no surface keeps a private copy" and not "there is exactly one string".
// Each is also pinned to its own role, so the pair cannot be collapsed back
// into one by somebody reading this file as a rule against having two.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));

const WORDING = 'Crumar reserves Bank 1 for its 8 models — they cannot be overwritten.';
const FOOT_WORDING = 'Bank 1 is reserved for Crumar models.';

test('the Bank 1 sentence is Daniel\'s wording, exactly', () => {
  const { BANK1_LOCKED } = require('../src/save-plan');
  assert.strictEqual(BANK1_LOCKED, WORDING);
  // The em dash is an em dash and the 8 is a numeral. Both are easy to lose
  // to an editor being helpful, and both are the wording he chose.
  assert.match(BANK1_LOCKED, /—/, 'an em dash, not a hyphen');
  assert.match(BANK1_LOCKED, /its 8 models/, 'the numeral 8, not "eight"');
  assert.doesNotMatch(BANK1_LOCKED, /can not/, '"cannot", corrected 16 Nov 2026');
});

test('the foot sentence is its own wording, and is a description not a refusal', () => {
  const { BANK1_FOOT, BANK1_LOCKED } = require('../src/save-plan');
  assert.strictEqual(BANK1_FOOT, FOOT_WORDING);
  assert.notStrictEqual(BANK1_FOOT, BANK1_LOCKED,
    'two jobs, two sentences — collapsing them puts a refusal under rows nobody touched');
  // THE DIVIDING LINE, ASSERTED RATHER THAN DESCRIBED. The foot sits there
  // whether or not anybody tried anything, so it may not tell a player what
  // they cannot do. If this sentence ever acquires "cannot", it has stopped
  // being a description and the comment in save-plan.js is no longer true.
  assert.doesNotMatch(BANK1_FOOT, /cannot|can't|overwrit|refus/i,
    'the foot DESCRIBES the bank; the refusal wording is BANK1_LOCKED\'s job');
  assert.match(BANK1_LOCKED, /cannot be overwritten/,
    'and the refusal still names the consequence');
});

test('both are written down once, and every other place reads them', () => {
  // A LITERAL, not a mention. Comments are stripped so the paragraph above
  // a constant explaining what it replaced cannot count as a second copy —
  // which it otherwise would, and the first version of this test failed on
  // exactly that.
  const defines = (text) => files.filter((f) => read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .includes(text));
  assert.deepStrictEqual(defines(WORDING), ['save-plan.js'],
    `the refusal should be a literal in save-plan.js alone, found in: ${defines(WORDING).join(', ')}`);
  assert.deepStrictEqual(defines(FOOT_WORDING), ['save-plan.js'],
    `the foot sentence too, found in: ${defines(FOOT_WORDING).join(', ')}`);
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

  // THE FOOT'S SURFACE. #foot-seven had NO consumer at all between 16 and 17
  // Nov — declared in app.js and referenced nowhere else, the shape CLAUDE.md
  // names as the tell for an unfinished capability. This is the assertion
  // that it has one, and that the one it has reads the shared constant
  // rather than retyping the sentence.
  assert.match(app, /footSeven\.textContent =/,
    '#foot-seven is actually written to — it sat declared and unused for a day');
  assert.match(app, /SevenSavePlan\.BANK1_FOOT/,
    'and the foot reads the shared constant');
  // IT ASKS ots-freshness WHICH BANK IS THE FACTORY'S, rather than testing
  // for 1. One place knows that, and the freshness line above the rows
  // already asks it the same way.
  assert.match(app, /bankIsFactory\(bankIndex\)\s*\n?\s*\?\s*SevenSavePlan\.BANK1_FOOT/,
    'and shows it only on the factory bank, asked rather than hardcoded');
});
