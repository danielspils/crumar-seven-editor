'use strict';

// THE GUARDS FOR "SAVE WHAT YOU HEAR" (docs/save-what-you-hear.md §8).
//
// The thing being defended is a sentence: what the file says is what the
// instrument was holding. Everything here is a way that sentence can quietly
// stop being true — the app's own copy going in instead, half a read going in,
// a parameter the device never reported being filled in from memory.
//
// None of it is reachable from a UI scenario, because a live session needs the
// cable and the failures worth catching are the ones where the cable goes
// away. So the decision lives in src/save-plan.js, injected, and this runs in
// `npm test` on every commit.

const test = require('node:test');
const assert = require('node:assert');

const fs = require('node:fs');
const path = require('node:path');
const {
  saveRows, rowsHtml, valuesToWrite, decideSave, BANK1_LOCKED,
} = require('../src/save-plan');

// The app's belief and the instrument's reality, deliberately DIFFERENT. A
// fixture where the two agree cannot catch the bug this file exists for: every
// assertion below would pass just as well against the app's own copy.
const APP_BELIEVES = { rho_tp: 1, rho_atk: 2, veq_vol: 3 };
const SEVEN_HOLDS = { rho_tp: 9, rho_atk: 8, veq_vol: 7 };

const rig = (over = {}) => {
  const wrote = [];
  const opts = {
    connected: true,
    ask: async () => 'computer',
    holdScreen: async () => true,
    readBuffer: async () => ({ params: { ...SEVEN_HOLDS }, missing: [] }),
    appParams: () => ({ ...APP_BELIEVES }),
    write: async (params, meta) => { wrote.push({ params, meta }); return true; },
    ...over,
  };
  return { opts, wrote };
};

// ---- Which rows the dialog offers ------------------------------------------

test('the overwrite row is ABSENT when nothing has changed', () => {
  const rows = saveRows({ changed: false, slot: { bank: 3, preset: 5 } });
  assert.deepStrictEqual(rows.map((r) => r.value), ['computer'],
    'there is no slot to overwrite, so offering to is an instruction to do nothing');
});

test('the overwrite row is PRESENT when something has changed', () => {
  const rows = saveRows({ changed: true, slot: { bank: 3, preset: 5 } });
  assert.deepStrictEqual(rows.map((r) => r.value), ['hold', 'computer']);
});

test('the overwrite row names the real bank and preset', () => {
  const [hold] = saveRows({ changed: true, slot: { bank: 3, preset: 5 } });
  // PRESET, and a ·, because that is the instrument's own word and the app's
  // in nine other places. The spec said "Slot"; the spec was corrected.
  assert.strictEqual(hold.title, 'Overwrite Bank 3 · Preset 5');
  // It must not read like a save button: the app cannot write a preset at all,
  // so the row can only ask for the hold, and says so on its face.
  assert.match(hold.sub, /Holding the button on the Seven/);
  // AND NOT "confirm" — the word reverses the row's whole point, since there
  // is nothing the app did for the player to approve. Asserted apart from the
  // string above so a later reword cannot quietly bring it back.
  assert.doesNotMatch(hold.sub, /confirm/i);
});

// A name printed from a stale belief is an instruction to overwrite something
// the player did not mean — worse than naming nothing.
test('an unknown slot is NOT guessed at', () => {
  const [hold] = saveRows({ changed: true, slot: null });
  assert.strictEqual(hold.title, 'Overwrite the preset on your Seven');
  assert.doesNotMatch(hold.title, /Bank|Slot \d/, 'no number is invented');
});

// ---- Bank 1 is not a destination -------------------------------------------
//
// The Seven refuses a store into Bank 1 (owner-confirmed on hardware
// 2026-08-13). A hardware run of switch-patch-guard offered
// "Overwrite Bank 1 · Preset 1" anyway, which would have sent the player to
// hold a button for three seconds while the instrument declined — a save they
// would have had every reason to think had worked, in the one feature built
// because that exact loss happened twice.
// DESTINATIONS ONLY. Since 2026-11-15 the list can also carry a NOTE, which
// is not somewhere a patch can go — so the question "what is offered" is asked
// of the rows that offer something.
const destinations = (rows) => rows.filter((r) => r.kind !== 'note').map((r) => r.value);

test('Bank 1 is never offered as a destination, however changed the patch', () => {
  const rows = saveRows({ changed: true, slot: { bank: 1, preset: 1 } });
  assert.deepStrictEqual(destinations(rows), ['computer'],
    'only the computer, which is genuinely the only place a Bank 1 edit can go');
  assert.ok(!rows.some((r) => /Bank 1/.test(r.title || '')),
    'and Bank 1 is not named as somewhere to overwrite');
});

test('and it says why, in the row’s place', () => {
  // The gap used to be silent: the row vanished and the player was left to
  // work out where the Seven had gone (OPEN FOR DANIEL in docs/COPY.md until
  // 2026-11-15).
  const rows = saveRows({ changed: true, slot: { bank: 1, preset: 1 } });
  const notes = rows.filter((r) => r.kind === 'note');
  assert.strictEqual(notes.length, 1, 'exactly one note');
  assert.strictEqual(notes[0].text, BANK1_LOCKED);
  // IN THE ROW'S PLACE, not appended at the end: it explains the absence, so
  // it belongs where the absence is — above "Save to computer".
  const order = rows.map((r) => (r.kind === 'note' ? 'note' : r.value));
  assert.deepStrictEqual(order, ['note', 'computer']);
  // AND IT IS NOT A CONTROL. No value to answer the dialog with.
  assert.strictEqual(notes[0].value, undefined);
});

test('no note on a bank that CAN be written to', () => {
  const rows = saveRows({ changed: true, slot: { bank: 3, preset: 5 } });
  assert.ok(!rows.some((r) => r.kind === 'note'),
    'the explanation appears only where there is an absence to explain');
  assert.ok(destinations(rows).includes('hold'), 'and the Seven is offered instead');
});

test('the note is rendered as a note, not as a row', () => {
  const html = rowsHtml(saveRows({ changed: true, slot: { bank: 1, preset: 1 } }));
  // THE CONSTANT, NOT ITS SPELLING. This matched a fragment of the sentence
  // as worded on the day it was written and went red when Daniel chose a
  // different wording on 16 Nov 2026. What is load-bearing is that the note
  // carries THE Bank 1 sentence, whatever it currently says.
  assert.ok(html.includes(`<p class="sv-note">${BANK1_LOCKED}</p>`),
    `the note renders the shared Bank 1 sentence — got: ${html}`);
  // The properties that matter are the absences: a dialog of buttons with one
  // unclickable button in it would be worse than either.
  const noteTag = /<p class="sv-note">[^<]*<\/p>/.exec(html)[0];
  assert.ok(!/data-modal-choice/.test(noteTag), 'it cannot answer the dialog');
  assert.ok(!/data-sv/.test(noteTag), 'it names no destination');
  assert.ok(!/<button/.test(noteTag), 'and it is not a button');
});

test('the Bank 1 sentence has ONE definition, shared with the transfer runner', () => {
  // Daniel had written it three times; a fourth phrasing would have been a
  // fourth thing to keep in sync (2026-11-15). This fails if either side
  // starts holding its own copy.
  const runner = require('../src/transfer-runner');
  assert.strictEqual(typeof BANK1_LOCKED, 'string');
  assert.ok(BANK1_LOCKED.length > 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'transfer-runner.js'), 'utf8');
  assert.ok(!src.includes(`'${BANK1_LOCKED}'`),
    'transfer-runner.js no longer holds its own copy of the sentence');
  assert.match(src, /BANK1_LOCKED/, 'it uses the shared one');
  assert.ok(runner, 'and it still loads');
});

test('Bank 1 still offers the update row when there is a file to update', () => {
  const rows = saveRows({
    changed: true, slot: { bank: 1, preset: 1 }, canUpdate: true, targetName: 'Reed Piano',
  });
  // The LOCK IS ON THE INSTRUMENT, not on the library. A patch of your own,
  // open while the Seven happens to sit on a Bank 1 preset, is still yours to
  // update — only the hold is impossible.
  assert.deepStrictEqual(destinations(rows), ['update', 'computer']);
  // AND THE NOTE STILL EXPLAINS THE MISSING ONE. Two destinations here rather
  // than one makes the absence easier to miss, not harder, so the sentence is
  // if anything more needed.
  assert.deepStrictEqual(
    rows.map((r) => (r.kind === 'note' ? 'note' : r.value)),
    ['update', 'note', 'computer']
  );
});

// Every other bank is unaffected, so the guard cannot be a blanket refusal
// that happens to pass the test above.
for (const bank of [2, 3, 4]) {
  test(`Bank ${bank} is still offered`, () => {
    const rows = saveRows({ changed: true, slot: { bank, preset: 5 } });
    assert.ok(rows.some((r) => r.value === 'hold'), 'the hold row is there');
    assert.strictEqual(rows[0].title, `Overwrite Bank ${bank} · Preset 5`);
  });
}

// AND AN UNKNOWN SLOT IS STILL OFFERED. With Send PC off the app cannot tell
// which preset the Seven is on, so it cannot rule out Bank 1 — and refusing on
// a maybe would remove the Seven as a destination for everybody with that
// global switched off. Not knowing is not the same as knowing it is locked.
test('an unknown slot is still offered, since Bank 1 cannot be ruled out', () => {
  const rows = saveRows({ changed: true, slot: null });
  assert.ok(rows.some((r) => r.value === 'hold'));
});

test('the computer row says the Seven is left alone', () => {
  const rows = saveRows({ changed: true, slot: null });
  const computer = rows.find((r) => r.value === 'computer');
  assert.match(computer.sub, /The Seven is untouched/);
});

// ---- The update row (Daniel, 14 Nov 2026: fold the second dialog in) --------
//
// Two rows in ON THE SEVEN, three in Patches. The third is the question that
// used to be a SECOND DIALOG behind "save to computer", which is the two-in-a-
// row confusion this feature exists to remove.

test('ON THE SEVEN offers two rows: no file behind a slot to update', () => {
  const rows = saveRows({ changed: true, slot: { bank: 3, preset: 5 }, canUpdate: false });
  assert.deepStrictEqual(rows.map((r) => r.value), ['hold', 'computer']);
});

test('an own patch offers three, update first', () => {
  const rows = saveRows({
    changed: true, slot: { bank: 3, preset: 5 }, canUpdate: true, targetName: 'Reed Piano',
  });
  assert.deepStrictEqual(rows.map((r) => r.value), ['update', 'hold', 'computer']);
});

test('the update row names the patch it would write into', () => {
  const [update] = saveRows({ changed: true, canUpdate: true, targetName: 'Reed Piano' });
  assert.strictEqual(update.title, 'Update “Reed Piano”');
  // Daniel met the dialog this replaces while standing in Backups and could not
  // tell which patch was the target (2026-08-22). The name is the fix, and it
  // has to survive the move.
  assert.match(update.title, /Reed Piano/);
});

test('an unnamed patch does not render an empty pair of quotes', () => {
  const [update] = saveRows({ changed: true, canUpdate: true, targetName: '' });
  assert.strictEqual(update.title, 'Update this patch');
});

// Same rule as the overwrite row above, for the same reason: with nothing
// changed there is nothing to write back, so a row offering to is an
// instruction to do nothing.
test('update is absent when nothing has changed, even where it is allowed', () => {
  const rows = saveRows({ changed: false, canUpdate: true, targetName: 'Reed Piano' });
  assert.deepStrictEqual(rows.map((r) => r.value), ['computer']);
});

// THE CONTRAST IS THE POINT. With update above it, "Save to computer" has to
// say which file it means, or the two rows are the pair of labels Daniel could
// not tell apart in the first place.
test('the computer row distinguishes itself when update sits above it', () => {
  const three = saveRows({ changed: true, canUpdate: true, targetName: 'Reed Piano' });
  const alone = saveRows({ changed: true, canUpdate: false });
  const sub = (rows) => rows.find((r) => r.value === 'computer').sub;
  assert.match(sub(three), /separate/, 'it names the difference');
  assert.notStrictEqual(sub(three), sub(alone),
    'and does not read identically to the two-row case');
});

// ---- What the save actually writes -----------------------------------------

// THE CENTRAL ONE. This is the whole change: the file carries what the
// instrument was holding, not what the app thought it had sent.
test('a save while connected writes the INSTRUMENT\'s values, not the app\'s copy', async () => {
  const { opts, wrote } = rig();
  assert.strictEqual(await decideSave(opts), 'saved');
  assert.strictEqual(wrote.length, 1);
  assert.deepStrictEqual(wrote[0].params, SEVEN_HOLDS);
  assert.notDeepStrictEqual(wrote[0].params, APP_BELIEVES,
    'the fixture must be able to tell these apart, or it proves nothing');
});

test('the same is true of the copy taken at the hold screen', async () => {
  const { opts, wrote } = rig({ ask: async () => 'hold' });
  assert.strictEqual(await decideSave(opts), 'saved');
  assert.deepStrictEqual(wrote[0].params, SEVEN_HOLDS);
  assert.strictEqual(wrote[0].meta.asNew, true,
    'insurance against a hold that does not happen is always a NEW patch');
});

// A copy taken at the hold is insurance, never an edit to the open file —
// writing it over one would be a second consequence nobody asked for. It is
// the ROW that decides now, so a hold cannot inherit "overwrite" from the view
// it was reached from.
test('the hold copy is a new patch wherever it was reached from', async () => {
  const { opts, wrote } = rig({ ask: async () => 'hold' });
  await decideSave(opts);
  assert.strictEqual(wrote[0].meta.asNew, true);
});

// THE ONLY ROW THAT WRITES AN EXISTING FILE. This used to be inferred from the
// view and then confirmed by a second dialog; it is a destination the player
// picks (Daniel, 14 Nov 2026).
test('"update" writes the open patch, and nothing else does', async () => {
  const { opts, wrote } = rig({ ask: async () => 'update' });
  assert.strictEqual(await decideSave(opts), 'saved');
  assert.strictEqual(wrote[0].meta.asNew, false);
  assert.deepStrictEqual(wrote[0].params, SEVEN_HOLDS,
    'and it writes the reading, like every other row');

  for (const answer of ['computer', 'hold']) {
    const r = rig({ ask: async () => answer });
    await decideSave(r.opts);
    assert.strictEqual(r.wrote[0].meta.asNew, true, `${answer} makes a new patch`);
  }
});

// Anything that is not one of the three destinations writes nothing. A fourth
// row added later without teaching decideSave about it must be inert rather
// than falling into whichever branch it resembles.
test('an answer that is not a destination is STAY', async () => {
  const { opts, wrote } = rig({ ask: async () => 'overwrite' });
  assert.strictEqual(await decideSave(opts), 'stay');
  assert.strictEqual(wrote.length, 0);
});

// A PARTIAL READ WRITES NOTHING. Daniel moves the one USB cable between this
// app and his JUNO-X rig, so losing the instrument mid-read is ordinary. A
// patch holding sixty fresh values and fifty stale ones, saved under a name,
// is worse than no file: nothing afterwards can tell it from a real one.
test('a read that could not be finished writes NO file at all', async () => {
  const { opts, wrote } = rig({ readBuffer: async () => null });
  assert.strictEqual(await decideSave(opts), 'stay');
  assert.deepStrictEqual(wrote, [], 'nothing was written');
});

test('a failed read at the hold screen writes nothing either', async () => {
  const { opts, wrote } = rig({ ask: async () => 'hold', readBuffer: async () => null });
  assert.strictEqual(await decideSave(opts), 'stay');
  assert.deepStrictEqual(wrote, []);
});

// It must NOT silently fall back to the app's copy, which would turn a lost
// cable into a file that looks exactly like a real reading.
test('a failed read does not quietly fall back to what the app has', async () => {
  const { opts, wrote } = rig({ readBuffer: async () => null });
  await decideSave(opts);
  assert.ok(!wrote.some((w) => JSON.stringify(w.params) === JSON.stringify(APP_BELIEVES)),
    'the app\'s copy must never stand in for a reading that failed');
});

// ---- Offline is not a failure, but it IS a different save -------------------

test('with nothing connected the save writes what the app has, and says which', async () => {
  const v = await valuesToWrite({
    connected: false,
    readBuffer: async () => { throw new Error('must not be asked'); },
    appParams: () => ({ ...APP_BELIEVES }),
  });
  assert.deepStrictEqual(v.params, APP_BELIEVES);
  assert.strictEqual(v.fromInstrument, false,
    'the caller has to be able to tell the two saves apart');
});

test('a connected save is marked as coming from the instrument', async () => {
  const v = await valuesToWrite({
    connected: true,
    readBuffer: async () => ({ params: { ...SEVEN_HOLDS } }),
    appParams: () => ({ ...APP_BELIEVES }),
  });
  assert.strictEqual(v.fromInstrument, true);
});

// Keys the DEVICE did not report travel out to be named, never back-filled
// from the app's copy — that is a partial read wearing a quieter coat.
test('parameters the instrument never reported are carried out as missing', async () => {
  const { opts, wrote } = rig({
    readBuffer: async () => ({ params: { rho_tp: 9 }, missing: ['veq_vol', 'rho_atk'] }),
  });
  await decideSave(opts);
  assert.deepStrictEqual(wrote[0].meta.missing, ['veq_vol', 'rho_atk']);
  assert.strictEqual(wrote[0].params.veq_vol, undefined,
    'absent, not filled in from what the app believed');
});

// ---- Leaving -----------------------------------------------------------------

test('"discard and leave" leaves, and writes nothing', async () => {
  const { opts, wrote } = rig({ ask: async () => 'leave' });
  assert.strictEqual(await decideSave(opts), 'leave');
  assert.deepStrictEqual(wrote, []);
});

// Discarding is the one move here that cannot be walked back, so it takes a
// deliberate press — never an Escape, never a stray click on the backdrop.
test('dismissing the dialog means STAY, not discard', async () => {
  const { opts, wrote } = rig({ ask: async () => null });
  assert.strictEqual(await decideSave(opts), 'stay');
  assert.deepStrictEqual(wrote, []);
});

// The tick box is the whole protection against a hold that never happens. If
// it was cleared deliberately, there is nothing left for the app to do.
test('clearing the tick box writes nothing', async () => {
  const { opts, wrote } = rig({ ask: async () => 'hold', holdScreen: async () => false });
  assert.strictEqual(await decideSave(opts), 'stay');
  assert.deepStrictEqual(wrote, []);
});

test('a write that refuses reports stay rather than claiming a save', async () => {
  const { opts } = rig({ write: async () => false });
  assert.strictEqual(await decideSave(opts), 'stay');
});

// The buffer is not read until a row has been picked: the read costs ~1.3s and
// the dialog has to open instantly.
test('nothing is read from the instrument until a choice is made', async () => {
  let reads = 0;
  const { opts } = rig({
    ask: async () => null,
    readBuffer: async () => { reads++; return { params: {} }; },
  });
  await decideSave(opts);
  assert.strictEqual(reads, 0);
});
