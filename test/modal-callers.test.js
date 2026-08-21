'use strict';

// DOES ANYTHING ACTUALLY PASS THESE LABELS?
//
// `.seven-modal-second` and `.seven-modal-deny` render only when
// `secondaryLabel` / `denyLabel` are given. test/ui/scenarios/modal-buttons.js
// clicks both for real and proves they work — and would stay green if every
// caller vanished, because it passes the labels itself.
//
// Each has exactly ONE caller in the whole app. Delete it and the button
// disappears from the product with the component test still passing and
// nothing else to notice: the modal keeps supporting a feature nobody reaches.
// That is the shape this repo has been bitten by three times — a capability
// with no consumer (`sevenAPI.notes.latest`, `midi.auditionSound`,
// `#done-live-btn`) — and it is invisible to any test that does its own setup.
//
// So this asserts the WIRING, by reading the source. Neither file can be
// required here: app.js is a renderer script that expects a DOM, audition.js
// the same. Same technique as the main.js injection check in
// test/library-store.test.js, and the CSS scan in test/css-hazards.test.js.
//
// It is a question about SOURCE, not about hardware. Both call sites need a
// connected Seven to REACH at runtime; neither needs one to be read.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

// Strip comments, so a mention inside a note about the option cannot stand in
// for a real argument — the failure mode where a test passes on prose.
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the transfer step dialog still passes denyLabel', () => {
  // "Stop" during the walk is a step in the task rather than a way out of a
  // dialog, and it is the only thing in the app that renders .seven-modal-deny.
  const src = code(read('app.js'));
  assert.match(src, /denyLabel:\s*'[^']+'/,
    'app.js passes a denyLabel — without it the deny branch of the modal router is dead');
});

test('the unsaved-edits dialog still passes secondaryLabel', () => {
  // "Save a copy" is the only thing in the app that renders
  // .seven-modal-second, and the only reason confirm() can resolve 'secondary'.
  const src = code(read('audition.js'));
  assert.match(src, /secondaryLabel:\s*'[^']+'/,
    'audition.js passes a secondaryLabel — without it the secondary branch is dead');
});

test('the caller that handles the secondary answer still checks for it', () => {
  // The label and the branch that reads its answer are two separate things to
  // lose. A dialog offering "Save a copy" whose caller no longer tests for
  // 'secondary' would fall through to the overwrite path — the answer being a
  // string rather than `true` is the only thing standing between the two.
  const src = code(read('audition.js'));
  assert.match(src, /===\s*'secondary'/,
    "audition.js still branches on the 'secondary' answer");
});
