'use strict';

// ASSERTIONS ABOUT SOURCE THAT NO RUNTIME TEST CAN MAKE.
//
// Everything here reads a file as text. That is a last resort, and each case
// says why nothing else reaches it. Two reasons recur:
//
//   - A COMPONENT TEST SUPPLIES ITS OWN INPUTS, so it cannot tell whether
//     anything in the app supplies them too. Delete the only caller and the
//     component test stays green while the feature leaves the product — the
//     shape this repo has been bitten by three times (sevenAPI.notes.latest,
//     midi.auditionSound, #done-live-btn).
//   - THE RENDERER'S IPC SURFACE IS FROZEN. contextBridge deep-freezes what it
//     exposes — measured 2026-08-21: sevenAPI and sevenAPI.library both report
//     Object.isFrozen true, and assigning over a method silently does nothing.
//     So a UI scenario cannot wrap a call to observe that it happened.
//
// Neither reason involves hardware: these are questions about source, and none
// of them needs a Seven attached to answer.

// ---- The two optional modal buttons ---------------------------------------
//
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
  // Either quoting: the label became a template literal on 2026-08-22 when it
  // started naming the patch it would overwrite. What this pins is that a
  // label is passed at all, not how it is written.
  assert.match(src, /secondaryLabel:\s*(?:'[^']+'|`[^`]+`)/,
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

// ---- The library folder button --------------------------------------------

test('the folder button is still wired to library.reveal', () => {
  // test/ui/scenarios/library-reveal.js clicks the real button and separately
  // checks where reveal() would go — but it cannot see that the CLICK is what
  // calls it, because the frozen IPC surface cannot be wrapped and the listener
  // discards the answer. A listener quietly dropped would leave that scenario
  // green: it would still click a button, and still get the right path from its
  // own direct call.
  const src = code(read('app.js'));
  assert.match(src, /libReveal\.addEventListener\('click',[\s\S]{0,120}?library\.reveal\(\)/,
    "#library-reveal's click listener still calls library.reveal()");
});

// ---- The freshness line, in both the places it appears ---------------------

test('a slot read repaints BOTH freshness labels, not just the header', () => {
  // The line appears in the region header and, with the library open, in the
  // collapsed strip. Repainting one and not the other put two claims about the
  // same slots on screen at once (2026-08-21). No UI scenario can catch it
  // without an instrument — reading a slot needs a recall — and the failure is
  // invisible unless the library happens to be open at the time.
  const src = code(read('app.js'));
  const block = /recordSlotSound\(forSlot\.name\)\)\s*\{([\s\S]*?)\}/.exec(src);
  assert.ok(block, 'the slot-read branch is still there');
  assert.match(block[1], /refreshAgeLabels\(\)/,
    'it goes through refreshAgeLabels, which repaints both');
  assert.doesNotMatch(block[1], /updateSevenHead\(\)/,
    'and not the header renderer alone, which is how it drifted');
});

test('refreshAgeLabels really does repaint both', () => {
  // Otherwise the test above pins a name rather than a behaviour.
  const src = code(read('app.js'));
  const fn = /const refreshAgeLabels = \(\) => \{([\s\S]*?)\};/.exec(src);
  assert.ok(fn, 'refreshAgeLabels exists');
  assert.match(fn[1], /updateSevenHead\(\)/);
  assert.match(fn[1], /updateBankStrip\(\)/);
});

test('every function app.js calls in the slot-read path actually exists', () => {
  // renderBanks() was called there for a day and defined nowhere. Node parses
  // it happily — an undefined call is only a ReferenceError at RUNTIME — so
  // both suites stayed green while the branch threw on every slot read, taking
  // the repaint with it. app.js has no unit coverage and the scenario that
  // would have caught it needs an instrument.
  //
  // Cheap guard, narrow on purpose: the names this one branch calls.
  const src = code(read('app.js'));
  const branch = /recordSlotSound\(forSlot\.name\)\)\s*\{([\s\S]*?)\n        \}/.exec(src);
  assert.ok(branch, 'the slot-read branch is still there');
  for (const [, name] of branch[1].matchAll(/(?:^|[^.\w])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    if (name === 'if' || name === 'return') continue;
    const defined = new RegExp(
      `(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*=|let\\s+${name}\\s*=)`
    ).test(src);
    assert.ok(defined, `app.js calls ${name}() in the slot-read path but never defines it`);
  }
});

// ---- The overwrite dialog: the safe path leads ----------------------------

test('the overwrite dialog offers the SEPARATE PATCH as its confirm', () => {
  // Overwrite held the confirm, which in modal.js means it also held focus and
  // Return — so Enter destroyed a patch. Destroying one is unrecoverable and
  // making a second is not, so the safe option is the one that leads.
  //
  // Read from source because reaching this dialog needs a live session, and a
  // live session needs an instrument.
  const src = code(read('audition.js'));
  assert.match(src, /confirmLabel: 'Save as a separate patch'/,
    'the confirm is the non-destructive option');
  assert.match(src, /secondaryLabel: `Overwrite/,
    'and overwrite is the secondary');
});

test('the destructive button names the patch it would overwrite', () => {
  // Daniel met this dialog standing in the Backups tab, saw "Overwrite patch",
  // and could not tell whether a backup was the target. It never could be —
  // but nothing on screen said which patch was.
  const src = code(read('audition.js'));
  assert.match(src, /secondaryLabel: `Overwrite “\$\{target\}”`/,
    'the label interpolates the target name');
});

test('the dialog claims nothing about changes having been made', () => {
  // "save your changes as a copy" narrated an edit that need never have
  // happened — a slot captured off the instrument has no changes.
  const src = code(read('audition.js'));
  const call = /SevenModal\.confirm\(\{[\s\S]*?Save as a separate patch[\s\S]*?\}\)/.exec(src);
  assert.ok(call, 'the dialog is still there');
  assert.doesNotMatch(call[0], /your changes|these edits|you (?:have )?changed/i,
    'the body says what the buttons do, not what the player did');
});

test('the branch reads an INTENT, so swapping the buttons cannot invert it', () => {
  // The old code branched on the modal's raw answer, where 'secondary' meant
  // copy. Moving copy to the confirm would have silently made every save an
  // overwrite. The answer is mapped to an intent first.
  const src = code(read('audition.js'));
  assert.match(src, /intent = answer === 'secondary' \? 'overwrite' : 'copy'/);
  assert.match(src, /if \(intent === 'copy'\)/);
});
