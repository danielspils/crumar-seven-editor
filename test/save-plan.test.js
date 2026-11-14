'use strict';

// THE GUARDS FOR "SAVE WHAT YOU HEAR" (out/save-what-you-hear.md §8).
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

const { saveRows, valuesToWrite, decideSave } = require('../src/save-plan');

// The app's belief and the instrument's reality, deliberately DIFFERENT. A
// fixture where the two agree cannot catch the bug this file exists for: every
// assertion below would pass just as well against the app's own copy.
const APP_BELIEVES = { rho_tp: 1, rho_atk: 2, veq_vol: 3 };
const SEVEN_HOLDS = { rho_tp: 9, rho_atk: 8, veq_vol: 7 };

const rig = (over = {}) => {
  const wrote = [];
  const opts = {
    connected: true,
    savesAsNew: true,
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

test('the overwrite row names the real bank and slot', () => {
  const [hold] = saveRows({ changed: true, slot: { bank: 3, preset: 5 } });
  assert.strictEqual(hold.title, 'Overwrite Bank 3 / Slot 5');
  // It must not read like a save button: the app cannot write a slot at all,
  // so the row can only ask for the hold, and says so on its face.
  assert.match(hold.sub, /Hold the button on the Seven/);
});

// A name printed from a stale belief is an instruction to overwrite something
// the player did not mean — worse than naming nothing.
test('an unknown slot is NOT guessed at', () => {
  const [hold] = saveRows({ changed: true, slot: null });
  assert.strictEqual(hold.title, 'Overwrite the preset on your Seven');
  assert.doesNotMatch(hold.title, /Bank|Slot \d/, 'no number is invented');
});

test('the computer row says the Seven is left alone', () => {
  const rows = saveRows({ changed: true, slot: null });
  const computer = rows.find((r) => r.value === 'computer');
  assert.match(computer.sub, /The Seven is untouched/);
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
// writing it over one would be a second consequence nobody asked for.
test('the hold copy is a new patch even where a save would overwrite', async () => {
  const { opts, wrote } = rig({ ask: async () => 'hold', savesAsNew: false });
  await decideSave(opts);
  assert.strictEqual(wrote[0].meta.asNew, true);
});

test('an ordinary patch still saves over itself when that is the view', async () => {
  const { opts, wrote } = rig({ savesAsNew: false });
  await decideSave(opts);
  assert.strictEqual(wrote[0].meta.asNew, false);
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
