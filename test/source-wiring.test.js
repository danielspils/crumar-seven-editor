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

test('the send flow still passes secondaryLabel', () => {
  // .seven-modal-second renders only when a caller passes a label, and it is
  // the only reason confirm() can ever resolve 'secondary'.
  //
  // IT MOVED (14 Nov 2026). This read audition.js, where the overwrite dialog
  // was the caller, until that dialog was folded into the save modal as a row.
  // The capability is not orphaned — the send flow's "Save edits to new patch"
  // passes one — so the guard follows the surviving caller rather than being
  // deleted. If that one goes too, .seven-modal-second and the whole
  // 'secondary' answer are dead code and this should fail, not be retired.
  const src = code(read('app.js'));
  assert.match(src, /secondaryLabel:\s*(?:'[^']+'|`[^`]+`)/,
    'app.js passes a secondaryLabel — without it the secondary branch is dead');
});

test('the caller that handles the secondary answer still checks for it', () => {
  // The label and the branch that reads its answer are two separate things to
  // lose. A dialog offering a second action whose caller no longer tests for
  // 'secondary' would fall through to the confirm path — the answer being a
  // string rather than `true` is the only thing standing between the two.
  //
  // send-choice.js is where that branch lives now, for the same reason as
  // above. It is also where it belongs: a pure module `npm test` can drive.
  const src = code(read('send-choice.js'));
  assert.match(src, /!==\s*'secondary'|===\s*'secondary'/,
    "send-choice.js still branches on the 'secondary' answer");
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

// ---- One dialog, and the safe path still leads ----------------------------
//
// THE SECOND DIALOG IS GONE (14 Nov 2026). Choosing a save on one of your own
// patches used to open "write these values into X, or keep it and save them as
// a separate patch" — so an ordinary save met two dialogs in a row, which is
// the confusion the save feature exists to remove. Daniel folded it in: the
// question is now a ROW in the save modal, beside the other destinations.
//
// What these guards carry forward is the lesson that dialog had earned, not its
// markup. Overwrite used to hold the confirm button, which in modal.js means it
// held focus and Return too — so pressing Enter destroyed a patch. The new
// dialog has no affirmative button at all, and that is what keeps Enter safe.

test('the save dialog has no affirmative button, so Enter cannot write', () => {
  // With confirmLabel '' there is no .seven-modal-ok, so modal.js puts focus on
  // the way out (`okBtn || .seven-modal-cancel`) and Enter settles the dialog
  // with no row having been picked — which decideSave reads as STAY. Every row
  // therefore takes a deliberate press. Remove this and the destructive choice
  // is one keystroke from an untouched keyboard.
  const src = code(read('audition.js'));
  const open = /SevenModal\.open\(\{[\s\S]*?tone: 'is-save',\s*\}\)/.exec(src);
  assert.ok(open, 'the save dialog is still opened here');
  assert.match(open[0], /confirmLabel: ''/,
    'no affirmative button — the rows are the actions');
});

test('the writer no longer asks its own question', () => {
  // The whole point of folding it in. A dialog left behind in here would put
  // the second question back on exactly the path it was removed from, and it
  // would look like a merge artefact rather than a decision.
  const src = code(read('audition.js'));
  const fn = /async function saveLiveToLibrary\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'saveLiveToLibrary is still recognisable');
  assert.doesNotMatch(fn[0], /SevenModal\.(?:confirm|open)\(/,
    'it writes; it does not ask');
});

test('the writer still refuses a record and a donor on its own', () => {
  // canUpdate() keeps the row off the dialog, so this cannot be reached today.
  // It is checked anyway: the protection used to live in this function, and
  // moving a rule somewhere else is how a rule gets lost. Both tests are named
  // because a Bank 1 patch is ALSO a record, so the donor rule would look
  // redundant right up to the day the record rule changed.
  const src = code(read('audition.js'));
  const fn = /async function saveLiveToLibrary\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'saveLiveToLibrary is still recognisable');
  assert.match(fn[0], /origin\.kind === 'backup'/, 'a backup record is refused');
  assert.match(fn[0], /origin\.bank === 1/, 'and a Bank 1 donor, by its own test');
});

test('the update row is gated on canUpdate, which names all three refusals', () => {
  // The row's precondition. ON THE SEVEN has no file behind a slot; a record is
  // a dated account that must not change; a donor seeds every generated patch
  // of its model. Each is its own line, for the reason above.
  const src = code(read('audition.js'));
  const fn = /function canUpdate\(\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'canUpdate is still recognisable');
  assert.match(fn[1], /lastTouchedDevice/, 'ON THE SEVEN cannot update');
  assert.match(fn[1], /origin\.kind === 'backup'/, 'a record cannot');
  assert.match(fn[1], /origin\.bank === 1/, 'a donor cannot');

  const flow = /async function openSaveFlow\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(flow, 'openSaveFlow is still recognisable');
  assert.match(flow[0], /canUpdate: canUpdate\(\)/,
    'and the dialog asks it rather than deciding for itself');
});

// ---- A saved copy says where it came from (§3) -----------------------------

test('only a bank slot stamps its provenance onto a new patch', () => {
  // The values on screen in Patches came from a FILE. The instrument is still
  // sitting on some preset, so holdSlot() would happily name one — and writing
  // it would be a claim about provenance that is simply untrue, baked into a
  // file where nothing afterwards could tell it from a reading.
  const src = code(read('audition.js'));
  const fn = /function slotProvenance\(\) \{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(fn, 'slotProvenance is still recognisable');
  assert.match(fn[1], /lastTouchedDevice/,
    'it answers only in ON THE SEVEN, where the thing on screen IS a slot');
  assert.match(fn[1], /holdSlot\(\)/,
    'and through holdSlot, so it is gated on Send PC like the on-screen name');
});

test('the new-patch writer is handed that provenance', () => {
  const src = code(read('audition.js'));
  // THE ARGUMENT, NOT THE WHOLE CALL. This matched the entire options object
  // as a literal and went red on 14 Nov when a second option joined it
  // (`reveal`, for the guard path) — a test failing because the line grew,
  // which teaches nobody anything and costs a reader the real question. What
  // is load-bearing is that the writer is handed slotProvenance(), and that
  // is what is asserted.
  assert.match(src, /saveLiveAsNewPatch\(params, \{[^}]*fromSlot: slotProvenance\(\)/,
    'the save flow passes it');
  assert.match(src, /createFromLive\(\{[\s\S]{0,200}?fromSlot,/,
    'and it reaches the store through the IPC call');
});

// ---- A failed Send CC borrow is said where it matters (§5b) ----------------

test('the save modal says a failed borrow, and app.js no longer toasts it', () => {
  // §5b: "say so once in the save modal and carry on." It was built as a toast
  // at the moment of entering the view — true, gone three seconds later, and
  // said while nobody was saving anything. It matters at one moment: a save,
  // where the button may have sat outlined through a panel move.
  const aud = code(read('audition.js'));
  const flow = /async function openSaveFlow\(([\s\S]*?)\n  \}/.exec(aud);
  assert.ok(flow, 'openSaveFlow is still recognisable');
  assert.match(flow[0], /deps\.sendCcFailed/,
    'the dialog asks whether the borrow failed');
  assert.match(flow[0], /\$\{ccNote\}/, 'and renders the answer in its body');

  const app = code(read('app.js'));
  assert.match(app, /sendCcFailed: \(\) => ccFailed/, 'app.js answers it');
  assert.doesNotMatch(app, /toast\([^)]*Send CC/,
    'and does not also toast it — one place, at the moment it applies');
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
  // THE INSTRUCTION MOVED, AND NOTHING IS GIVEN UP BY FOLLOWING IT.
  // The save flow shows the same hold for the same act, so the markup and the
  // handler live in modal-panel.js and both callers use that one copy
  // (out/save-what-you-hear.md §3: "Do not write a second one"). Each half is
  // still pinned — just where its code now is.
  const src = code(read('app.js'));
  const walk = /async function transferWalk\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(walk, 'transferWalk is still recognisable');
  assert.match(walk[0], /SevenModalPanel\.wireHoldHint\(panel, holdLine\)/,
    'the walk wires the shared hint rather than growing its own');
  assert.match(walk[0], /SevenModalPanel\.holdFaceHtml\(\)/,
    'and takes the instruction from the same place');
  assert.doesNotMatch(walk[0], /not this fake button/,
    'the copy is NOT duplicated back into the walk');

  const mp = code(read('modal-panel.js'));
  const hint = /function wireHoldHint\(([\s\S]*?)\n  \}/.exec(mp);
  assert.ok(hint, 'wireHoldHint is still recognisable');
  assert.match(hint[0], /panel\.addEventListener\('click'/,
    'the panel answers a click');
  assert.doesNotMatch(mp, /panel\.addEventListener\('(?:mouseover|mouseenter|pointerover|pointerenter)'/,
    'and never a hover');
  assert.match(hint[0], /closest\('\[data-mp-preset\]'\)/,
    'only a press on a PRESET — the button they were told to hold');
  // Daniel's copy, both states, unsmoothed: the parenthetical and the
  // exclamation mark are the voice. Pinned so a later tidy-up cannot quietly
  // reword them.
  // Long copy is split across adjacent string literals to fit the line, so
  // the joins come out before matching — otherwise this pins the line WRAPS
  // rather than the sentence, and rewrapping would break it.
  const joined = mp.replace(/'\s*\+\s*'/g, '');
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

test('connecting and disconnecting re-list the library', () => {
  // "Is this sound installed" is answered from the connected unit's table,
  // which the STORE learns in the main process — and for an hour after 1.5.1
  // shipped nothing re-listed the library when it did. The app sat connected
  // with "Connect your Seven to see which sounds are installed" still on
  // screen and not one patch flagged (2026-08-23, found in a screenshot).
  //
  // The scenario half is offline-only: offline-no-badge.js pins what the list
  // says with nothing attached, and the connected half needs an instrument.
  // This is what says the transition is wired at all.
  const src = code(read('app.js'));
  const handler = /window\.sevenAPI\.midi\.onEvent\(\(ev\) => \{([\s\S]*?)\n    \}\);/.exec(src);
  assert.ok(handler, 'the status listener is still recognisable');
  assert.match(handler[0], /refreshLibrary\(\)/, 'a status change re-lists the library');
  // ON THE TRANSITION. Status arrives every 3s from the auto-connect tick, and
  // one library.list() is 6.6ms against 54 files — the cost the focus handler
  // in this same file explicitly refuses to spend on a label.
  assert.match(handler[0], /live !== wasConnected/,
    'only when connectedness actually changed, not on every status event');
});

test('the daily ping sends only what main states, and never blocks a launch', () => {
  // telemetry.test.js proves the RULES. This proves the wiring, and three
  // properties that a unit test on a pure module cannot see.
  const src = code(read('main.js'));
  const fn = /async function sendDailyPing\(([\s\S]*?)\n\}/.exec(src);
  assert.ok(fn, 'sendDailyPing is still recognisable');

  // MAIN STATES THE WHOLE PAYLOAD. Nothing from a renderer, nothing from a
  // file, nothing that could carry an identifier.
  assert.match(fn[0], /JSON\.stringify\(\{ platform, version \}\)/,
    'the body is platform and version, and nothing else');
  assert.match(fn[0], /app\.getVersion\(\)/, 'the version comes from the app itself');

  // THE DAY IS CONSUMED ONLY BY A PING THAT LEFT. recordPing has to sit after
  // the await and inside the try — an app that is offline every morning would
  // otherwise never check in at all.
  const tryBlock = /try \{([\s\S]*?)\} catch/.exec(fn[0]);
  assert.ok(tryBlock && /recordPing/.test(tryBlock[1]),
    'recordPing is inside the try, after the send');
  assert.doesNotMatch(/\} catch \{([\s\S]*?)\}/.exec(fn[0])[1], /recordPing/,
    'and never in the catch');

  // IT CANNOT SIT IN FRONT OF THE APP. Deferred, not awaited at startup.
  assert.match(src, /setTimeout\(\s*\(\) => \{\s*sendDailyPing\(\)\.catch\(/,
    'the launch does not wait for a counter, and the promise cannot reject unhandled');
  // The catch must SAY something. A bare `.catch(() => {})` would satisfy the
  // line above while rebuilding the silent-failure shape it exists to prevent.
  assert.match(src, /sendDailyPing\(\)\.catch\(\(err\) => console\.log\(/,
    'and it logs the reason rather than swallowing it');
  assert.doesNotMatch(src, /await sendDailyPing/, 'and never awaits it');

  // THE DEV GATE IS WIRED TO THE REAL THING. `packaged` defaults to true in
  // telemetry.js so a forgotten option can never silence the shipped app — but
  // that default also means a dev run and a correctly-wired one look identical
  // from inside the module. Only reading main.js can tell they are connected.
  // Delete the option and this fails; the unit tests do not (checked).
  assert.match(src, /new Telemetry\(app\.getPath\('userData'\), \{ packaged: app\.isPackaged \}\)/,
    'main passes the real app.isPackaged, not a literal — a dev build must not '
    + 'check in to the production relay');

  // THE OPT-OUT IS REACHABLE. A switch nobody can find is not a choice.
  assert.match(src, /label: 'Send anonymous daily ping'/, 'the menu carries the opt-out');
  assert.match(src, /type: 'checkbox'/, 'as a checkbox that shows its state');
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

test('auditioning a sound claims no destination', () => {
  // The carousel used to run a sound through TransferRunner.startSlot, whose
  // recall replaced the edit buffer and took the player's effects with it.
  // These pin the shape rather than the wording: the carousel must reach the
  // destination-free path, and must NOT reach the walk.
  const app = code(read('app.js'));
  const fn = /async function chosenFromCarousel\(([\s\S]*?)\n  \}/.exec(app);
  assert.ok(fn, 'chosenFromCarousel is still recognisable');
  assert.match(fn[0], /auditionSound\(name\)/,
    'it sends a bare sound with no destination');
  assert.doesNotMatch(fn[0], /transfer\.startSlot/,
    'and never through the transfer walk, whose recall is for a STORE');
  assert.doesNotMatch(fn[0], /transfer\.(next|cancel)\(/,
    'nor its stepping, which exists to notice a hold');
  // AND IT ASKS FOR NO DESTINATION. The gate below required a bank slot for a
  // send that no longer goes near one, which made the carousel unusable from
  // Patches and Backups. Nothing else on that path reads deviceSel.
  assert.doesNotMatch(fn[0], /deviceSel/,
    'auditioning needs no preset selected — it has no destination to need one');
  assert.doesNotMatch(app, /Choose a preset to try an instrument on it/,
    'and the toast that said otherwise is gone');

  // The handler sends the sound ALONE. A params object here would be a second
  // reset on top of the one that was removed.
  const main = code(read('main.js'));
  const h = /ipcMain\.handle\('audition:sound'([\s\S]*?)\n  \}\);/.exec(main);
  assert.ok(h, 'the audition:sound handler exists');
  assert.match(h[0], /params: \{\}/, '0x46 and nothing else');
  assert.doesNotMatch(h[0], /recall|ProgramChange/, 'and no recall on this path');
});

// ── THE GUARD THE LIBRARY VIEW EARNED ─────────────────────────────────
//
// On 2026-08-12 the carousel sat in front of library patches and choosing an
// instrument wrote the new name straight to disk. Five of Daniel's files were
// silently renamed by what he thought was listening: tine-piano-443,
// reed-piano, cp70, funk-clav and rhodes.
//
// The control was taken out of the library view for three weeks. It is back
// (2026-09-08), so the guarantee that made it safe to bring back has to be
// asserted where the damage happened rather than inherited from the audition
// path. THE CONTROL ITSELF MUST NOT BE ABLE TO WRITE.
//
// This is the always-on half: it needs no instrument, so it runs in CI on
// every commit. The gesture, and the file's bytes before and after, are
// covered by test/ui/scenarios/carousel-never-writes.js.
test('choosing an instrument from the carousel cannot write to a file', () => {
  const app = code(read('app.js'));
  const fn = /async function chosenFromCarousel\(([\s\S]*?)\n  \}/.exec(app);
  assert.ok(fn, 'chosenFromCarousel is still recognisable');

  // No write of any shape. saveSound is the one that did the renaming, and the
  // others are named too so a future edit cannot reach disk by a different
  // door and still pass.
  for (const forbidden of ['saveSound', 'saveParams', 'rename', 'duplicate', 'generateFromSound']) {
    assert.doesNotMatch(fn[0], new RegExp(`library\\.${forbidden}\\b`),
      `it must not call library.${forbidden} — browsing sounds may not edit files`);
  }
  // And nothing on the library surface at all, which is the general form of
  // the same rule: this control auditions, and auditioning touches no file.
  assert.doesNotMatch(fn[0], /sevenAPI\.library\./,
    'the carousel reaches no library write surface whatsoever');
});

// ---- The dropdown caret is a shape, not a character ------------------------
//
// WHY THIS IS A SOURCE TEST. The bug is a rendering difference between
// platforms, and this repo's UI suite has never run on Windows — not once. So
// the only suite that could observe the fault cannot be run on the machine
// where the fault appears, and the scenario that measures alignment
// (test/ui/scenarios/picker-caret.js) passed on macOS with the bug in place,
// because the fallback glyph happened to land close enough here.
//
// What is checkable anywhere is the PROPERTY that made it platform-dependent:
// the caret's ink came from a font. '⌄' is U+2304, which no UI text font
// carries, so every platform falls through to a different one and inherits its
// metrics. `.fx-chevron` had already been fixed this way — its rule still says
// "a font glyph's ink sat below centre regardless of box alignment" — and the
// picker kept the character.
//
// This is the automatic half and runs in CI on every commit. The scenario is
// the on-request half; say which is which when reporting coverage.
test('the picker caret is drawn, not typed', () => {
  const src = read('picker.js');
  const caret = /caret\.(textContent|innerHTML|append|appendChild)[\s\S]{0,120}/.exec(src);
  assert.ok(caret, 'the caret still gets its content in a recognisable way');
  assert.match(caret[0], /innerHTML\s*=\s*CARET_SVG/,
    'the caret is filled with the SVG constant');

  const svg = /const CARET_SVG =([\s\S]*?);\n/.exec(src);
  assert.ok(svg, 'CARET_SVG is still defined');
  assert.match(svg[0], /<svg[\s\S]*viewBox="0 0 14 9"/,
    'it is the app-wide chevron geometry, same viewBox as .fx-chevron');
  assert.match(svg[0], /stroke="currentColor"/,
    'and it inherits its colour rather than baking one in');

  // THE MUTATION THIS EXISTS TO CATCH: putting a character back. Any of them —
  // the original U+2304, or the commoner substitutes somebody would reach for.
  for (const glyph of ['\u2304', '\u25BE', '\u25BC', '\u02C5', '\u2228', 'v']) {
    assert.doesNotMatch(src, new RegExp(`caret\\.textContent\\s*=\\s*['"\`]${glyph}`),
      `the caret must not be the character ${JSON.stringify(glyph)} — a font decides where its ink sits`);
  }
});

// ---- The backup grid has a consumer -----------------------------------------
//
// WHY THIS IS A SOURCE TEST. `buildGrid` and `paintBackup` are pure and are
// covered by test/modal-panel.test.js; the picture and its colours are covered
// by test/ui/scenarios/backup-grid.js, which builds its own grid and paints it
// itself. BOTH WOULD STAY GREEN IF NOTHING IN THE APP EVER OPENED ONE — which
// is the exact shape this repo has been bitten by three times
// (sevenAPI.notes.latest, midi.auditionSound, #done-live-btn), and the Notes
// strip spent ten days looking shipped that way.
//
// The failure is also invisible by eye: a backup still works, still finishes,
// still shows "Backup completato!". Only the during view goes missing, and the
// app looks idle for 48 seconds again — which is the thing this was built for.
//
// This is the automatic half and runs in CI on every commit. The scenario is
// the on-request half; say which is which when reporting coverage.
test('something actually opens the backup grid, and paints it from the feed', () => {
  const src = read('app.js');

  assert.match(src, /SevenModalPanel\.buildGrid\(/,
    'app.js builds the grid from the one drawing');
  assert.match(src, /SevenModalPanel\.paintBackup\(/,
    'and paints it');

  // IT OPENS WHEN A RUN STARTS. The grid built in a function nothing calls is
  // the same bug one level up.
  const onStart = /const { started } = await window\.sevenAPI\.midi\.backup\(\);[\s\S]{0,400}/.exec(src);
  assert.ok(onStart, 'the backup button still starts a run in a recognisable way');
  assert.match(onStart[0], /openBackupProgress\(\)/,
    'starting a run opens the during view');

  // IT IS PAINTED FROM backup-progress, in the same branch that writes the
  // connection row — so the picture and the line cannot drift apart.
  const branch = /ev\.type === 'backup-progress'\)\s*{[\s\S]{0,900}?connText\.textContent =[^;]*;/.exec(src);
  assert.ok(branch, 'the backup-progress branch is still recognisable');
  assert.match(branch[0], /showBackupProgress\(ev\)/,
    'backup-progress paints the grid');
  assert.match(branch[0], /ev\.n.*ev\.total/,
    'and the connection row still gets the same numbers from the same event');

  // AND IT CLOSES ON backup-done, having shown the finished grid first. A
  // dialog nothing closes is worse than one nothing opens: it sits over the
  // completion dialog.
  // THE X IS THE ONLY WAY OUT, SO ITS NAME HAS TO CARRY THE MEANING. The
  // dialog renders no affirmative button (Daniel, 2026-11-13: "the 'x' in the
  // upper right takes care of that"), which makes `cancelLabel` the whole of
  // what a keyboard or screen-reader user is told about stopping a 48-second
  // run. The default is 'Close', and reverting to it would be silent: the
  // dialog would look and behave identically.
  const opened = /const openBackupProgress = \(\) => {[\s\S]{0,1400}?\}\);/.exec(src);
  assert.ok(opened, 'openBackupProgress still opens a modal in a recognisable way');
  assert.match(opened[0], /confirmLabel: ''/, 'it asks for no affirmative button');
  assert.match(opened[0], /cancelLabel: 'Cancel backup'/,
    "and the X says it cancels the backup, not 'Close'");
  // Cancelling must still MEAN cancelling — the runner's own cancel, which
  // finishes the slot in flight rather than aborting mid-read.
  assert.match(src, /await window\.sevenAPI\.midi\.cancelBackup\(\);[\s\S]{0,200}bk-where/,
    'leaving the dialog still cancels the run through the runner');

  assert.match(src, /finishBackupProgress\(ev\)/, 'backup-done closes the during view');
  const done = /const showBackupDone = async \(ev\) => {[\s\S]{0,500}/.exec(src);
  assert.ok(done, 'showBackupDone is still recognisable');
  assert.match(done[0], /await finishBackupProgress\(ev\)/,
    'and it is awaited, so the last light is on screen before the dialog goes');
});

// THE COMPLETION DIALOG IS A SEPARATE MOMENT, AND STAYS ONE.
//
// The grid is the DURING view; "Backup completato!" is the AFTER view — a
// deliberate nod to Castelfidardo that Daniel has confirmed he wants kept
// (2026-11-13). The tempting simplification, the next time somebody touches
// this, is to fold the summary into the progress dialog and save a swap. This
// is the note that says not to, in a place that fails rather than in a comment
// somebody reads afterwards.
test('the backup still ends in its own dialog, with its own words', () => {
  const src = read('app.js');
  const summary = /title: ev\.cancelled \? 'Backup cancelled' : '([^']+)'/.exec(src);
  assert.ok(summary, 'the completion dialog still names itself');
  assert.strictEqual(summary[1], 'Backup completato!',
    'and it is still the Castelfidardo one');
  assert.match(src, /backed up<br>to your computer/, 'with the count it has always carried');

  // AND NOT THE DEDUPE SPLIT, which Daniel removed from this dialog on
  // 14 Nov 2026 as unreadable. Pinned from THIS dialog's own body rather than
  // from the whole file: `counts` is still built two lines above for the
  // connection row, so a file-wide match would pass with the sentence back.
  // Comments stripped first, or the note in app.js saying why it went would
  // satisfy the search — a test passing on prose.
  const body = /'Backup completato!',([\s\S]*?)confirmLabel: 'Done'/.exec(code(src));
  assert.ok(body, 'the dialog body is still recognisable');
  //
  // It looks for `counts`, the VARIABLE, not the word "unchanged": the dialog
  // only ever interpolated it, so the sentence can come back in full without
  // the word appearing anywhere inside the body. Asserting on the word is how
  // the assertion this replaces came to pass file-wide while pinning nothing —
  // it was matching the `const counts` line two lines above the dialog.
  assert.doesNotMatch(body[1], /counts/,
    'the announcement carries no unchanged/new split — it says what was backed '
    + 'up and nothing else');

  // The split itself is not deleted. The grid lights an unchanged slot exactly
  // like a new one, so the distinction has to live somewhere; it is the
  // connection row's line.
  assert.match(src, /counts = `\$\{ev\.unchanged\} unchanged, \$\{ev\.created\} new`/,
    'the split is still computed');
  assert.match(src, /connText\.textContent = ev\.cancelled[\s\S]{0,300}\$\{counts\}/,
    'and still shown in the connection row');
});

// ---- Saving what you hear (out/save-what-you-hear.md §8) -------------------
//
// src/save-plan.js holds the decision and test/save-plan.test.js pins it. This
// is the other half: that the APP is wired to that decision, and that the two
// things which live only in markup — the tick box's default and the dialog
// opening before anything moves — are what they have to be.
//
// Both halves run in `npm test`. Nothing here waits for somebody to remember
// to type the second command.

test('the save dialog is driven by the tested decision, not a second copy', () => {
  const src = code(read('audition.js'));
  const flow = /async function openSaveFlow\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(flow, 'openSaveFlow is still recognisable');
  assert.match(flow[0], /SevenSavePlan\.decideSave/,
    'the flow asks save-plan.js what to do');
  assert.match(flow[0], /SevenSavePlan\.rowsHtml\(SevenSavePlan\.saveRows/,
    'and which rows to offer — including whether the overwrite row exists at all');
  // THE READ IS THE INSTRUMENT'S, and it is what gets written. Handing
  // appParams in as `readBuffer` would make every save write the app's copy
  // again with the whole suite green.
  assert.match(flow[0], /readBuffer: \(\) => withBufferRead\(modal\)/,
    'the buffer read comes off the instrument');
  assert.match(code(read('audition.js')), /midi\.readBuffer\(\)/,
    'and withBufferRead goes to the wire for it');
});

// THE TICK BOX IS THE WHOLE PROTECTION against a hold that never happens.
// Unticked it is a step he would skip in exactly the moment he needs it.
test('"Also save a copy to Patches" is ticked by default', () => {
  const src = read('audition.js');
  const hold = /async function runHoldScreen\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(hold, 'runHoldScreen is still recognisable');
  assert.match(hold[0], /class="sv-copy" checked/,
    'the box ships ticked, in the markup, not set afterwards by something that could fail');
  assert.match(hold[0].replace(/'\s*\+\s*'/g, ''),
    /If you walk away without holding the button, the sound is still on your computer\./,
    'and says why it is there');
});

// THE HOLD SCREEN IS A REUSE, not a second telling. Two copies of an
// instruction drift, and the one that drifts is the one being read.
test('the save flow shows the SAME hold instruction as the transfer', () => {
  const src = code(read('audition.js'));
  const hold = /async function runHoldScreen\(([\s\S]*?)\n  \}/.exec(src);
  assert.match(hold[0], /SevenModalPanel\.holdFaceHtml\(\)/,
    'the instruction comes from modal-panel.js');
  assert.match(hold[0], /SevenModalPanel\.wireHoldHint/,
    'and so does the answer to pressing the picture');
  assert.doesNotMatch(src, /Hold for 3 seconds/,
    'audition.js does not write its own copy of the sentence');
});

// NAVIGATING AWAY ASKS FIRST — both doors, and before any state moves.
//
// "Navigating away discards" was settled on 2026-08-12 with a warning
// deliberately deferred "until it bites". It bit: Daniel lost two patches on
// 13 Nov walking out of a patch looking for a save control. The guarantee is
// that confirmLeave comes BEFORE the selection changes, because a confirm
// after the recall is a dialog about work that is already gone.
test('both ways out of an edited patch ask before anything moves', () => {
  const src = code(read('app.js'));

  const lib = /async function selectLibraryEntry\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(lib, 'selectLibraryEntry is still recognisable');
  assert.match(lib[0], /await audition\.confirmLeave\(\)/, 'the library row asks');
  assert.ok(
    lib[0].indexOf('confirmLeave') < lib[0].indexOf('libSelected = entry'),
    'and asks BEFORE it moves the selection'
  );

  // The bank region's slot click. Matched from its own landmark rather than a
  // function name, because it is an inline listener.
  const slot = /listEl\.addEventListener\('click', async \(e\) => \{([\s\S]*?)\n  \}\);/.exec(src);
  assert.ok(slot, 'the slot-row listener is still recognisable');
  assert.match(slot[0], /await audition\.confirmLeave\(\)/, 'the bank slot asks too');
  assert.ok(
    slot[0].indexOf('confirmLeave') < slot[0].indexOf('deviceSel = { bank: bankIndex'),
    'before it moves the device selection — and so before the recall replaces the buffer'
  );
});

// ANSWERING THE GUARD RESOLVES IT — the arrival after a save does not re-ask.
//
// Daniel, 2026-11-14: answer the guard with "Save to computer", name the patch,
// dismiss "Saved to Patches", and the guard is on screen again. Not the first
// one undismissed — a SECOND one, raised by the save's own arrival at the new
// file, which goes through selectLibraryEntry and so through confirmLeave. The
// session is still dirty by design (a copy on disk does not store anything on
// the Seven), so the question was asked again and the answer was already given.
//
// Two separate wires, each with its own mutation, and `test/ui/scenarios/
// leave-guard-resolves.js` drives the real thing — but that needs the
// instrument, so these are the half that runs by itself.
test('the trip to a just-saved patch does not re-ask the leave guard', () => {
  const src = code(read('app.js'));

  const lib = /async function selectLibraryEntry\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(lib, 'selectLibraryEntry is still recognisable');
  assert.match(lib[0], /if \(!opts\.answered && !\(await audition\.confirmLeave\(\)\)\) return;/,
    'an already-answered arrival skips the ASKING');
  // NOT BY CLEARING THE DRIFT, which would be the shortcut and is the one
  // thing this must not do: the buffer genuinely still differs from the stored
  // preset. A flag cleared to quiet a dialog is how a restored value stayed
  // "dirty" once already.
  const reveal = /revealPatch: \(file, patchIndex\) => \{([\s\S]*?)\n    \},/.exec(src);
  assert.ok(reveal, 'revealPatch is still recognisable');
  assert.match(reveal[1], /selectLibraryEntry\(entry, \{ answered: true \}\)/,
    'and the post-save arrival is the one caller that says so');
  assert.doesNotMatch(reveal[1], /baseline|liveEdit|dirty/,
    'the arrival does not touch the live session to get there');
});

// AND FROM THE GUARD THERE IS NO ARRIVAL AT ALL. The click being held up is
// already a request to be somewhere else, so landing on the new file and being
// moved off it again is a flash plus a second 1.3s instrument send for one
// gesture. The Save button keeps the arrival (2026-08-23) — there is nowhere
// else the player was heading from there.
test('a save from the guard does not take you to the new patch', () => {
  const src = code(read('audition.js'));
  const flow = /async function openSaveFlow\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(flow, 'openSaveFlow is still recognisable');
  // BOTH WRITERS, NAMED. A bare /reveal: !fromNav/ passed with the new-patch
  // call site mutated to `reveal: true`, because the OTHER one still matched —
  // a test green while half the thing it guards was gone, caught by mutating
  // it rather than by reading it (2026-11-14).
  assert.match(flow[0], /saveLiveAsNewPatch\(params, \{[^}]*reveal: !fromNav/,
    'a new patch from the guard asks for no arrival');
  assert.match(flow[0], /saveLiveToLibrary\(params, \{[^}]*reveal: !fromNav/,
    'and neither does an update from the guard');
  const announce = /function announceSaved\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(announce, 'announceSaved is still recognisable');
  assert.match(announce[0], /if \(reveal && deps\.revealPatch\)/,
    'and announceSaved honours it rather than revealing regardless');
});

// CLEARING THE TICK BOX IS AN ANSWER, AND IT IS ACCEPTED (14 Nov 2026).
//
// Clearing "Also save a copy to Patches" and pressing Done writes nothing, so
// the flow answers 'stay' — and the next attempt to leave used to raise the
// whole guard again. That made "I will keep it on the Seven" the one answer the
// app would not take: the route through this dialog that could never resolve
// it. Daniel's call — that press is him taking the keeping on, so the next move
// out is TOLD rather than asked.
test('clearing the copy box is remembered, and only for that session', () => {
  const src = code(read('audition.js'));

  const hold = /async function runHoldScreen\(([\s\S]*?)\n  \}/.exec(src);
  assert.ok(hold, 'runHoldScreen is still recognisable');
  assert.match(hold[0], /liveEdit\.holdDeclined = true/,
    'declining the copy is recorded');
  // ON THE SESSION OBJECT, not beside it. A module-level flag needs clearing in
  // six places and one gets forgotten — then declining once disarms the guard
  // for the rest of the run, which is the dangerous version of this change.
  // Hung on liveEdit it dies with the session and there is no clearing code to
  // lose, so nothing here may declare one.
  assert.doesNotMatch(src, /let holdDeclined/,
    'and NOT in a module variable somebody has to remember to clear');

  const fn = /async confirmLeave\(\) \{([\s\S]*?)\n      \}/.exec(src);
  assert.ok(fn, 'confirmLeave is still recognisable');
  assert.match(fn[1], /if \(liveEdit\.holdDeclined\)/,
    'and the next way out is told rather than asked');
  assert.ok(
    fn[1].indexOf('holdDeclined') < fn[1].indexOf('openSaveFlow'),
    'before the guard is reached, or it would ask anyway'
  );
  // `body` MUST BE PASSED. SevenModal.confirm does not default it and
  // paragraphs() stringifies what it is handed, so an omitted body prints the
  // literal word "undefined" under the heading. The wording is Daniel's and may
  // move; that there IS one is what this pins.
  assert.match(fn[1], /title: 'Discarding Edits',\s*\n?\s*body: ["']/,
    'with a body, so the dialog cannot render the word "undefined"');
});

// And it is NOT a toll on browsing. With nothing changed the answer is true
// without drawing anything, which is what kept the 2026-08-12 decision livable.
test('confirmLeave is silent when nothing has changed', () => {
  const src = code(read('audition.js'));
  const fn = /async confirmLeave\(\) \{([\s\S]*?)\n      \}/.exec(src);
  assert.ok(fn, 'confirmLeave is still recognisable');
  assert.match(fn[0], /if \(!liveEdit \|\| !driftNow\(\)\) return true;/,
    'no session or no drift means no dialog at all');
});
