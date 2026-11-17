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
// NO FULL STOP (Daniel, 17 Nov 2026). It is a 10px uppercase LABEL sitting
// beside "as of last backup · yesterday", which has no stop either, and a
// period in a line of small caps reads as a speck. BANK1_LOCKED keeps its
// stop: that one appears in dialog bodies and tooltips, where it is prose.
const FOOT_WORDING = 'Bank 1 is reserved for Crumar models';

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

  // THE DESCRIPTION'S SURFACE. It lived in #foot-seven for one day — at the
  // bottom of the pane in 12px green sentence case — and moved to #fresh-line
  // on 17 Nov, beside the freshness caveat it is a sibling of. The assertion
  // is that SOME surface writes it and reads the shared constant to do so;
  // what it must not go back to is being a constant nobody renders.
  assert.match(app, /bank1Note\.textContent = show \? SevenSavePlan\.BANK1_FOOT/,
    'the Bank 1 note is actually written to');
  // AND AS TEXT, not markup. It was innerHTML while it carried a lock glyph
  // (SVG has to go in that way); with the lock gone a string goes in as a
  // string, and nothing in this line needs the parser.
  assert.doesNotMatch(app, /bank1Note\.innerHTML/,
    'as text — there is no glyph to inject any more');
  assert.match(app, /SevenSavePlan\.BANK1_FOOT/,
    'and it reads the shared constant rather than retyping the sentence');
  // IT ASKS ots-freshness WHICH BANK IS THE FACTORY'S, rather than testing
  // for 1. One place knows that, and the freshness caveat beside it already
  // asks the same way.
  assert.match(app, /const show = SevenOtsFreshness\.bankIsFactory\(bankIndex\)/,
    'and shows it only on the factory bank, asked rather than hardcoded');
  // AND IT IS CALLED. A renderer that nothing invokes is the Notes strip
  // again — complete, correct and invisible for ten days.
  assert.match(app, /updateBank1Note\(\)/,
    'and updateFreshLine calls it, so a bank change repaints it');
  // THE CAPS ARE CSS, NOT THE STRING, which is what lets save-plan.js keep
  // the sentence-case literal 65a7969's tests assert character for
  // character. If this ever becomes .toUpperCase() in app.js, those tests
  // still pass while the two sentences have silently diverged on screen.
  assert.doesNotMatch(app, /BANK1_FOOT[^\n]*toUpperCase/,
    'the uppercasing belongs to .fresh in the stylesheet');
});

test('the Bank 1 note wears the freshness line\'s own type rule', () => {
  // READ FROM index.html, because "it looks the same as the freshness line"
  // is only true while both take their type from ONE rule. Copied values
  // would pass a screenshot today and drift the first time one is edited.
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  assert.match(html, /<span id="bank1-note" class="fresh"/,
    'the note carries class="fresh", the same rule #bank-asof uses');
  // AND THE GREEN IS GONE BECAUSE THE POSITION CHANGED, which is what to
  // assert: .foot-slot is var(--action-text), DESIGN.md reserves that for
  // things that DO something, and the only way to wear it is to be in
  // #lib-foot. So the test is that the note is inside #fresh-line — with
  // the freshness caveat — and carries no foot class.
  //
  // The first version of this checked that #foot-seven does not carry
  // `fresh`, which is true and means nothing: it would pass with the
  // sentence still sitting in the foot in green.
  const line = /<div id="fresh-line">[\s\S]*?<\/div>/.exec(html);
  assert.ok(line, '#fresh-line is in the markup');
  assert.match(line[0], /id="bank1-note"/,
    'the note lives in #fresh-line, beside the freshness caveat');
  assert.doesNotMatch(html, /id="bank1-note"[^>]*foot-slot/,
    'and wears no foot class, which is where the green came from');
  // AND IT LEAVES THE LAYOUT WHEN HIDDEN. The invariant is not "a particular
  // rule exists" — it is that NOTHING OVERRIDES `[hidden]`. The span is a
  // plain inline span, so the UA sheet's `[hidden] { display: none }` takes
  // it out of flow by itself; a `display` declaration here would outrank
  // that and leave an empty flex item costing #fresh-line its 12px gap,
  // which moved the caveat 12px between Bank 1 and the rest.
  //
  // So this asserts the PAIR: either no display on #bank1-note, or a display
  // plus the companion [hidden] rule. The first version asserted that the
  // companion rule was present, and once the display it existed for was
  // removed it was pinning a no-op — a rule that does nothing, asserted.
  const hasDisplay = /#bank1-note(?![[\w-])[^{}]*\{[^{}]*display:/.test(html);
  const hasHiddenRule = /#bank1-note\[hidden\][^{}]*\{[^{}]*display:\s*none/.test(html);
  assert.ok(!hasDisplay || hasHiddenRule,
    '#bank1-note has a display declaration but no `[hidden] { display: none }`'
    + ' to go with it — hidden will not take it out of #fresh-line\'s flow,'
    + ' and the freshness caveat will shift between banks');
});
