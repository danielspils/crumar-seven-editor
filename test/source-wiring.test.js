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

// ---- The connect path -----------------------------------------------------

test('the connect path offers the SEND PC prompt, and the function exists', () => {
  // This is the test that was missing, and its absence is the whole story:
  // send-pc-prompt.js had NINE passing unit tests covering the decision and
  // the write, and the scenario covered the offline case. All of it stayed
  // green while the only consumer was deleted, because every one of those
  // tests supplies its own inputs. The unit was fine; nothing checked that
  // anything used it.
  //
  // It was called on every connect and defined nowhere — a ReferenceError out
  // of the 'connected' branch, which also skipped connBtn.disabled,
  // backupBtn.hidden and the write-gate banner.
  const src = code(read('app.js'));
  assert.match(src, /maybeOfferSendPc\(s\)/,
    'the status handler still offers the prompt on connect');
  assert.match(src, /(?:async\s+)?function maybeOfferSendPc\s*\(/,
    'and app.js still defines it');
});

test('every function the connect branch calls is defined in app.js', () => {
  // The general form of the same failure, twice over: a scripted edit removed
  // a range and took a passenger, and node --check parses an undefined call
  // happily because it is a runtime error. Narrow on purpose — the names this
  // one branch calls — and cheap enough to keep.
  const src = code(read('app.js'));
  const branch = /if \(s\.state === 'connected'\)[\s\S]*?\n      \} else if \(s\.state === 'connecting'\)/.exec(src);
  assert.ok(branch, "the connected branch is still recognisable");
  const known = new Set(['if', 'return', 'String', 'Number', 'Boolean', 'esc']);
  for (const [, name] of branch[0].matchAll(/(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    if (known.has(name)) continue;
    const defined = new RegExp(
      `(?:(?:async\\s+)?function\\s+${name}\\s*\\(|const\\s+${name}\\s*=|let\\s+${name}\\s*=)`
    ).test(src);
    assert.ok(defined, `app.js calls ${name}() on connect but never defines it`);
  }
});

// ---- The transfer modal's message slot ------------------------------------

test('the transfer walk builds ONE slot with both faces in it', () => {
  // transfer-slot-size.js measures the slot's behaviour, but it builds the
  // body itself — the real walk needs a connected instrument. So this checks
  // the app still builds the same shape. Without it, app.js could go back to
  // two bare paragraphs and the scenario would stay green measuring its own
  // markup.
  const src = code(read('app.js'));
  assert.match(src, /class="tx-slot"/, 'the slot is still there');
  assert.match(src, /data-face="hold"/, 'with the hold face');
  assert.match(src, /data-face="skip"/, 'and the skip face');
  assert.match(src, /auto-advancing/, 'which says the walk is about to move on');
});

test('the hold screen shows the instrument\'s own drawing', () => {
  // ONE PANEL NOW. The hold screen used to be src/panel-mini.js — a second
  // SVG, built in JS, with its own coordinates — and that is how it spent
  // eleven days with no BANK button: two hand-maintained copies and nothing
  // that compared them.
  //
  // hold-panel.js measures the picture, but it builds the panel itself,
  // because the real walk needs a connected instrument. So this is the half
  // that says the WALK still uses it: without it, app.js could go back to a
  // hand-built picture with the scenario green on its own markup — which is
  // exactly the shape the Notes strip failed in.
  const src = code(read('app.js'));
  const walk = /async function transferWalk\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(walk, 'transferWalk is still recognisable');
  assert.match(walk[0], /SevenModalPanel\.buildPanel/,
    'the walk draws the panel from the dashboard artwork');
  assert.match(walk[0], /brackets: false/,
    'without the choosing brackets — nothing is being chosen at a hold');
  assert.match(walk[0], /setStage\(panel, 'hold'\)/,
    "and puts it at the hold stage, which is what shows the HOLD legend");
  assert.doesNotMatch(src, /SevenPanelMini/,
    'and the second drawing is gone from the app entirely');
});

test('the hold screen answers a mistaken press, on a CLICK', () => {
  // hold-fake-button.js measures the behaviour but installs the handler
  // itself — the real walk needs a connected Seven — so this is the half that
  // says the WALK installs it, and installs it on the right event.
  //
  // The event matters as much as the answer. A mouse crosses that panel
  // constantly; on hover the line would change for people who did nothing,
  // which reads as a fault rather than a hint.
  const src = code(read('app.js'));
  const walk = /async function transferWalk\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(walk, 'transferWalk is still recognisable');
  assert.match(walk[0], /panel\.addEventListener\('click'/,
    'the panel answers a click');
  assert.doesNotMatch(walk[0], /panel\.addEventListener\('(?:mouseover|mouseenter|pointerover|pointerenter)'/,
    'and never a hover');
  assert.match(walk[0], /closest\('\[data-mp-preset\]'\)/,
    'only a press on a PRESET — the button they were told to hold');
  // Daniel's copy, both states, unsmoothed: the parenthetical and the
  // exclamation mark are the voice. Pinned so a later tidy-up cannot quietly
  // reword them.
  // Long copy is split across adjacent string literals to fit the line, so
  // the joins come out before matching — otherwise this pins the line WRAPS
  // rather than the sentence, and rewrapping would break it.
  const joined = walk[0].replace(/'\s*\+\s*'/g, '');
  assert.match(joined, /Your Seven lights will run indicating the sound is saved\./,
    'the standing line is his, and says what the instrument does');
  assert.match(joined, /Hold the button on the Seven itself \(not this fake button!\)/,
    'and so is the correction, exclamation mark and all');
});

test('the naming modal names where the patch goes', () => {
  // name-modal-copy.js measures the dialog but builds it itself. This is the
  // half that says the CALLER asks for that heading and that button — and that
  // the emphasis is a WORD rather than markup, which is the property that
  // keeps a patch name from becoming a tag.
  const src = code(read('audition.js'));
  const fn = /async function saveLiveAsNewPatch\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'saveLiveAsNewPatch is still recognisable');
  const joined = fn[0].replace(/'\s*\+\s*'/g, '');
  assert.match(joined, /title: 'Save to Patches tab'/, 'the heading names the tab');
  assert.match(joined, /em: 'Patches'/, 'and emphasises the word, not a span of HTML');
  assert.match(joined, /confirmLabel: 'Save as new patch'/, 'the button carries the action');

  // The other caller of the same helper writes to the same place, so no path
  // is left saying something different. Checked rather than assumed: it was
  // the one thing that could have made one heading right and another wrong.
  const app = code(read('app.js'));
  assert.match(app, /title: 'Name this patch'/,
    'generateFromInstrument keeps its own heading');
  assert.match(app, /library\.generateFromSound\(/,
    'and writes through generateFromSound, which also makes a library patch');

  // askForName must not grow an HTML door. The modal escapes its title on
  // purpose — patch names go through there elsewhere.
  assert.doesNotMatch(app, /titleHtml/, 'no titleHtml option exists to pass markup through');
});

test('every path that writes a new patch says so the same way', () => {
  // Two save paths behaved differently for no decided reason: saving an edited
  // BACKUP RECORD showed a dialog, "Save as new patch" showed a toast. The
  // history is unambiguous — the dialog landed 2026-08-14 with a rationale,
  // and saveLiveAsNewPatch was written a week later in 3333776, a long careful
  // commit that says nothing at all about what happens after a save succeeds.
  // Never deliberate. Found by Daniel using it.
  const src = code(read('audition.js'));
  for (const name of ['saveLiveAsNewPatch', 'saveLiveToLibrary']) {
    const fn = new RegExp(`async function ${name}\\(([\\s\\S]*?)\\n  \\}`).exec(src);
    assert.ok(fn, `${name} is still recognisable`);
    assert.match(fn[0], /announceSaved\(/, `${name} announces the save`);
  }

  // IT ARRIVES BEFORE IT SPEAKS. The reveal has to happen before the dialog
  // opens, or the player dismisses it and finds they went nowhere — which is
  // the ordering the deleted link existed to work around.
  const announce = /function announceSaved\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(announce, 'announceSaved is still recognisable');
  const revealAt = announce[0].indexOf('revealPatch');
  const openAt = announce[0].indexOf('SevenModal.open');
  assert.ok(revealAt > -1 && openAt > -1 && revealAt < openAt,
    'it reveals the patch BEFORE opening the dialog');

  // And the link is gone from the app, not merely unused: it pointed at where
  // the player now already is.
  assert.doesNotMatch(src, /data-goto-patch/, 'no "go to your new patch" link survives');
  assert.doesNotMatch(code(read('app.js')), /data-goto-patch/, 'and none in app.js');
});

test('the summary knows which flow it is ending', () => {
  // transfer-summary.test.js proves the WORDING. This proves the runner still
  // hands it the two facts it decides on, and that app.js still asks it rather
  // than building the body inline again.
  const runner = code(read('transfer-runner.js'));
  const finish = /\n  finish\(error\) \{([\s\S]*?)\n  \}/.exec(runner);
  assert.ok(finish, 'finish() is still recognisable');
  assert.match(finish[0], /setlistIndex: st\.setlistIndex/,
    'the report carries which flow it was');
  assert.match(finish[0], /const single = st\.setlistIndex === null/,
    'and decides it on the runner\'s own field, never on a count');
  assert.match(finish[0], /name: single &&/, 'the single send names its patch');
  assert.match(finish[0], /preset: single &&/, 'and its preset');

  const app = code(read('app.js'));
  assert.match(app, /SevenTransferSummary\.body\(report\)/, 'app.js asks the module');
  assert.match(app, /SevenTransferSummary\.title\(report\)/, 'for both halves');
  assert.doesNotMatch(app, /preset\$\{report\.total === 1/,
    'and does not still build the body itself');
});

test('a face is hidden by CLASS, never by `hidden`', () => {
  // `hidden` is display: none, which is what let the modal shrink and grow
  // through a bank send. The slot only holds its height if the hidden face
  // keeps its box.
  const src = code(read('app.js'));
  const walk = /async function transferWalk\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(walk, 'transferWalk is still recognisable');
  assert.match(walk[0], /classList\.toggle\('is-off'/,
    'faces are toggled with is-off');
  assert.doesNotMatch(walk[0], /\.hidden = (?:true|false)/,
    'and nothing in the walk hides a message by removing it from the layout');
});

// ---- The destination chooser ----------------------------------------------

test('the send flow chooses on the panel, not on generic buttons', () => {
  // Three screens became one. The scenario drives the panel's real state
  // functions and clicks its real hit rects, but it builds the modal body
  // itself — reaching the real one needs a connected instrument — so this
  // pins that the app still builds that shape.
  const src = code(read('app.js'));
  assert.match(src, /chooseDestination\(entry\)/, 'sendPatchToSlot uses the chooser');
  assert.match(src, /SevenModalPanel\.buildPanel/, 'which draws the panel from the dashboard artwork');
  // Scoped to the SINGLE-PATCH path. "Select which bank to send" still exists
  // for the SETLIST send, which is a different flow and deliberately
  // untouched — asserting against the whole file would have demanded a change
  // nobody asked for.
  const single = /async function sendPatchToSlot\(entry\)[\s\S]*?\n  \}/.exec(src);
  assert.ok(single, 'sendPatchToSlot is still recognisable');
  assert.doesNotMatch(single[0], /SevenModal\.choose/,
    'the single-patch send no longer asks with generic buttons');
});

test('NEXT is gated on a real destination, Bank 1 excluded', () => {
  // Advancing with half a destination should not be possible, and Bank 1 is
  // not a destination at all — the button says so as well as the message.
  const src = code(read('app.js'));
  assert.match(src, /nextBtn\.disabled = !\(bank && bank !== 1 && preset\)/,
    'the button is disabled unless a sendable bank AND a preset are chosen');
  assert.match(src, /return ok && bank && bank !== 1 && preset \? \{ bank, preset \} : null/,
    'and the same rule guards what the chooser returns');
});

test('a whole-bank send chooses on the panel too', () => {
  // The last generic chooser in the send path. bank-chooser.js measures the
  // panel, but it builds the modal itself — sendSetlist refuses without a
  // connected Seven — so this is the half that says the APP still uses it.
  const src = code(read('app.js'));
  const fn = /async function chooseBank\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'chooseBank exists');
  assert.match(fn[0], /SevenModalPanel\.buildPanel/, 'it draws the panel from the artwork');
  assert.match(fn[0], /brackets: \['bank'\]/, 'with only the bank bracket — one question is asked');
  assert.match(fn[0], /setStage\(svg, bank \? 'row' : 'bank'\)/,
    'and the row stage once a bank is chosen');
  assert.match(src, /const bank = await chooseBank\(name\)/,
    'and sendSetlist uses it');
  assert.doesNotMatch(src, /SevenModal\.choose\({\s*\n\s*title: 'Send to Seven'/,
    'the four generic bank buttons are gone from the send path');
});

test('both choosers give the keyboard somewhere to start', () => {
  // Measured before this existed: activeElement was EMPTY when either chooser
  // opened. The modal focuses its action button and the gating then disables
  // it, so focus evaporated and a keyboard user had nothing at all.
  //
  // The panel scenario asserts what focusControl and bindKeys DO. This asserts
  // that the two dialogs call them — which is the half a scenario building its
  // own modal can never see.
  const src = code(read('app.js'));
  for (const [name, re] of [
    ['chooseDestination', /async function chooseDestination\(([\s\S]*?)\n  \}/],
    ['chooseBank', /async function chooseBank\(([\s\S]*?)\n  \}/],
  ]) {
    const fn = re.exec(src);
    assert.ok(fn, `${name} is still recognisable`);
    assert.match(fn[0], /SevenModalPanel\.focusControl\(svg\)/,
      `${name} puts focus on the bank control`);
    assert.match(fn[0], /SevenModalPanel\.bindKeys\(svg\)/,
      `${name} makes Space press it`);
  }
});

test('the panel follows the instrument as well as the mouse', () => {
  // With Send PC on, a bank or preset pressed on the Seven arrives as a
  // slot-identified Program Change. The picture has to keep up, or it would
  // disagree with the machine in front of the player.
  const src = code(read('app.js'));
  assert.match(src, /ev\.type !== 'program-change'/, 'it listens for panel presses');
  assert.match(src, /midi\.onEvent\(follow\)/, 'and subscribes while the chooser is open');
});
