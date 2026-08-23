'use strict';

// TransferRunner: the only feature that changes what the instrument holds
// after a power cycle. These tests pin the rules that keep it safe — Bank 1
// refused, a missing sound stopping the run BEFORE anything is written,
// nothing advancing without the player, and a report that never claims more
// than the instrument actually told us.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { TransferRunner } = require('../src/transfer-runner');
const { LibraryStore } = require('../src/library-store');
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schema', 'seven-1.37.json'), 'utf8')
);

const params = (v) => Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(v, p.max)]));

// A stand-in for the instrument: it answers a Program Change with the same
// unsolicited 0x45 ("current-sound") the real Seven broadcasts on every recall,
// which is what the runner gates the load on. `deaf: true` swallows the PC and
// answers nothing, the way a pulled cable does.
function fakeMidi({ sounds, connected, deaf = false, sendPc = 1 }) {
  const midi = new EventEmitter();
  midi.state = connected ? 'connected' : 'disconnected';
  // glb[3] is Send PC. The runner borrows it when it is off, because the hold
  // detection cannot see anything without it.
  midi.globals = { glb: { 3: sendPc } };
  midi.sendPcWrites = [];
  midi.restored = 0;
  midi.setSendPc = async (v) => { midi.sendPcWrites.push(v); midi.globals.glb[3] = v; };
  midi.restoreSendPc = async () => { midi.restored += 1; midi.globals.glb[3] = sendPc; };
  midi.soundTable = { sounds: sounds.map((name, id) => ({ id, name })) };
  midi.recalled = [];
  // What each slot currently holds, as the device's burst fingerprint. The
  // recall broadcast carries it; so does the broadcast after a store, which is
  // the whole basis of hold detection.
  midi.slotContents = new Map();
  midi.burst = (program) => {
    // THE SOUND IT WAS TOLD TO BROADCAST. This was hardcoded to 0, so
    // `burstSoundId` — a parameter fakeWithSlot has always accepted — did
    // nothing, and no test could reach the runner's sound comparison at all.
    // Same shape as FakeSeven answering 64 for every parameter: a fixture that
    // cannot express the thing under test (2026-08-23).
    const soundId = midi.burstSoundId === undefined ? 0 : midi.burstSoundId;
    midi.emit('event', { type: 'current-sound', soundId });
    midi.emit('event', {
      type: 'recall-burst',
      program,
      soundId,
      fingerprint: midi.slotContents.get(program) || `slot-${program}`,
    });
  };
  midi.sendProgramChange = (program) => {
    midi.recalled.push(program);
    if (deaf) return;
    setImmediate(() => midi.burst(program));
  };
  return midi;
}

function setup({ sounds = ['Tine Piano', 'Clavi Piano'], connected = true, deaf = false, sendPc = 1 } = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-transfer-')), 'Library');
  const store = new LibraryStore(dir, schema, {
    banks: [{ patches: [
      { name: 'Alpha', soundName: 'Tine Piano', params: params(64) },
      { name: 'Beta', soundName: 'Clavi Piano', params: params(20) },
    ] }],
  });
  // Content on purpose: a real library starts empty since 2026-08-17, when
  // seeded demo patches turned out to be sendable to the instrument.
  store.seedDemoLibrary();
  const entries = store.list().patches;
  const midi = fakeMidi({ sounds, connected, deaf, sendPc });
  const sent = [];
  const sender = {
    sentCount: 0,
    send: async (patch) => { sent.push(patch); sender.sentCount++; return { sent: 1 }; },
  };
  return { store, midi, sender, sent, entries, dir };
}

const readPatchFile = (store, file) =>
  JSON.parse(fs.readFileSync(path.join(store.dir, file), 'utf8')).patches[0];

function setlistWith(store, refs) {
  store.createSetlist('Gig');
  const index = store.readSetlists().findIndex((s) => s.name === 'Gig');
  refs.forEach((ref, slot) => { if (ref) store.assignSlot(index, slot, ref); });
  return index;
}

test('Bank 1 is refused — it holds the factory presets', () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const r = new TransferRunner({ midi, store, sender }).preflight(list, 1);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /factory presets/);
});

test('a sound this instrument lacks blocks the run before anything is sent', () => {
  const { store, midi, sender, entries, sent } = setup({ sounds: ['Tine Piano'] }); // no Clavi
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  const plan = runner.preflight(list, 2);

  assert.strictEqual(plan.ok, false, 'the plan is not ok');
  assert.strictEqual(plan.blocked.length, 1);
  assert.match(plan.blocked[0].reason, /has no .Clavi Piano./);
  assert.strictEqual(runner.start(list, 2).started, undefined, 'start refuses the same plan');
  assert.deepStrictEqual(sent, [], 'nothing reached the instrument');
});

test('preflight describes every slot, including the empty ones', () => {
  const { store, midi, sender, entries } = setup();
  // Assigning an instrument MAKES a patch (2026-08-14), so a setlist holds
  // three patches and a gap — there is no sound-only slot to describe.
  const list = setlistWith(store, [entries[0].file, null, 'sound:Clavi Piano']);
  const plan = new TransferRunner({ midi, store, sender }).preflight(list, 3);

  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.slots[0].action, 'send');
  assert.strictEqual(plan.slots[1].action, 'skip');
  assert.match(plan.slots[1].reason, /left alone/);
  assert.strictEqual(plan.slots[2].action, 'send', 'the instrument is a patch like any other');
  assert.strictEqual(plan.willWrite, 2);
  assert.match(plan.warning, /will be replaced/);
});

// Assigning an instrument writes the patch it means: that model, with the
// effects it comes with, taken off Bank 1 of the player's own instrument.
test('assigning an instrument puts a real patch in the slot', () => {
  const { store, midi, sender } = setup();
  const list = setlistWith(store, ['sound:Clavi Piano']);
  const slot = store.readSetlists()[list].slots[0];
  assert.ok(slot && !slot.startsWith('sound:'), `the slot holds a file (${slot})`);
  const plan = new TransferRunner({ midi, store, sender }).preflight(list, 2);
  assert.strictEqual(plan.slots[0].action, 'send');
});

test('a missing patch file blocks rather than silently skipping', () => {
  const { store, midi, sender } = setup();
  const list = setlistWith(store, ['gone.sevenlib.json']);
  const plan = new TransferRunner({ midi, store, sender }).preflight(list, 2);
  assert.strictEqual(plan.ok, false);
  assert.match(plan.blocked[0].reason, /missing from the library/);
});

test('the walk sends one slot at a time and waits for the player', async () => {
  const { store, midi, sender, sent, entries } = setup();
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);

  const first = await runner.nextSlot();
  assert.strictEqual(first.preset, 1);
  assert.match(first.instruction, /Hold preset 1 on the Seven for three seconds/);
  assert.strictEqual(sent.length, 1, 'only the first patch has been sent');

  const second = await runner.confirmSlot();
  assert.strictEqual(second.preset, 2);
  assert.strictEqual(sent.length, 2, 'the next patch goes only after the player confirms');

  const done = await runner.confirmSlot();
  assert.strictEqual(done.type, 'transfer-done');
  assert.deepStrictEqual(done.confirmed, [1, 2]);
  assert.deepStrictEqual(done.loadedNotConfirmed, []);
});

test('empty slots are stepped over, leaving those presets alone', async () => {
  const { store, midi, sender, sent, entries } = setup();
  const list = setlistWith(store, [null, entries[0].file, null, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 4);

  const first = await runner.nextSlot();
  assert.strictEqual(first.preset, 2, 'the first empty slot is skipped');
  const second = await runner.confirmSlot();
  assert.strictEqual(second.preset, 4);
  const done = await runner.confirmSlot();
  assert.deepStrictEqual(done.confirmed, [2, 4]);
  assert.strictEqual(sent.length, 2);
});

// Trying an instrument silences the chain it lands in. A sound change keeps
// everything else in the buffer, so a Vibraphone arriving through a Clavi
// patch's distortion, wha and pad sounds like the Clavi — which reads as the
// sound not having changed at all (Daniel, 2026-08-13).
// Sending a bare SOUND to one preset is still a thing the app does — the
// picker's Instruments tab, and the carousel. A setlist no longer holds one
// (assigning an instrument writes a patch), so this drives startSlot directly,
// which is the path that survives (Daniel, 2026-08-14).
test('a bare sound sends the sound and silences the effects chain', async () => {
  const { store, midi, sender, sent } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  await runner.nextSlot();
  assert.deepStrictEqual(sent[0], {
    sound: { name: 'Clavi Piano' },
    params: { fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0 },
  });
});

// The master volume is NOT one of them. veq_vol is the output level, and
// moving it on a sound change would be alarming rather than helpful.
test('silencing the chain never touches the master volume', async () => {
  const { store, midi, sender, sent } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  await runner.nextSlot();
  assert.ok(!('veq_vol' in sent[0].params), 'veq_vol is left alone');
  assert.ok(!('veq_byp' in sent[0].params), 'the EQ is left alone');
});

test('stopping partway reports what was stored and what was only loaded', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();      // preset 1 loaded
  await runner.confirmSlot();   // player stored 1, preset 2 loaded
  const done = runner.cancel(); // walked away with 2 in the buffer

  assert.strictEqual(done.cancelled, true);
  assert.deepStrictEqual(done.confirmed, [1]);
  assert.deepStrictEqual(done.loadedNotConfirmed, [2], 'loaded but never confirmed is said out loud');
});

test('a slot advanced by the BUTTON is recorded as the player\'s word', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  const done = await runner.confirmSlot();            // no flag: the button won
  assert.deepStrictEqual(done.confirmed, [1]);
  assert.deepStrictEqual(done.verified, [], 'the instrument showed us nothing');
  assert.match(done.note, /you confirmed the hold/);
  assert.match(done.note, /does not announce a store/);
});

test('a slot advanced by the INSTRUMENT is recorded as the Seven showing it', async () => {
  // The burst comparison won the race: the runner captured a "before" on its
  // way in and saw the burst after the hold differ. That is the app watching
  // the write land, and the report must not describe it as the player's word.
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  const done = await runner.confirmSlot(true);
  assert.deepStrictEqual(done.confirmed, [1]);
  assert.deepStrictEqual(done.verified, [1], 'and it is a subset of confirmed');
  assert.match(done.note, /The Seven showed/);
  assert.doesNotMatch(done.note, /you confirmed/,
    'the weaker basis is not claimed when the stronger one applies');
});

test('picking a bank moves the instrument to it, before anything is decided', async () => {
  const { store, midi, sender, sent } = setup();
  const r = await new TransferRunner({ midi, store, sender }).selectBank(3);
  assert.deepStrictEqual(r, { ok: true, bank: 3, program: 16 }); // bank 3, preset 1
  assert.deepStrictEqual(midi.recalled, [16]);
  assert.deepStrictEqual(sent, [], 'a recall writes nothing');
});

test('picking a bank refuses Bank 1 and a missing instrument', async () => {
  const { store, midi, sender } = setup();
  assert.match((await new TransferRunner({ midi, store, sender }).selectBank(1)).error, /factory/);
  const off = setup({ connected: false });
  const r = await new TransferRunner({ midi: off.midi, store: off.store, sender }).selectBank(2);
  assert.match(r.error, /not connected/);
  assert.deepStrictEqual(off.midi.recalled, []);
});

test('backing out puts the panel back where it was', async () => {
  const { store, midi, sender } = setup();
  midi.lastPanelProgram = 5; // the player was on bank 1, preset 6
  const runner = new TransferRunner({ midi, store, sender });
  await runner.selectBank(4);
  assert.deepStrictEqual(await runner.releaseBank(), { ok: true, program: 5 });
  assert.deepStrictEqual(midi.recalled, [24, 5]);
  assert.deepStrictEqual(await runner.releaseBank(), { ok: false }, 'releasing twice is a no-op');
});

test('with no known prior slot the panel is left where we put it', async () => {
  const { store, midi, sender } = setup(); // lastPanelProgram undefined: Send PC off
  const runner = new TransferRunner({ midi, store, sender });
  await runner.selectBank(2);
  assert.deepStrictEqual(await runner.releaseBank(), { ok: false });
  assert.deepStrictEqual(midi.recalled, [8], 'no guessed slot is sent');
});

test('once the walk starts, releasing the bank cannot yank the panel back', async () => {
  const { store, midi, sender, entries } = setup();
  midi.lastPanelProgram = 5;
  const runner = new TransferRunner({ midi, store, sender });
  await runner.selectBank(2);
  runner.start(setlistWith(store, [entries[0].file]), 2);
  assert.deepStrictEqual(await runner.releaseBank(), { ok: false });
  assert.deepStrictEqual(midi.recalled, [8]);
});

test('each slot is recalled on the instrument before it is loaded', async () => {
  const { store, midi, sender, sent, entries } = setup();
  const list = setlistWith(store, [entries[0].file, null, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 3);

  await runner.nextSlot();
  // Bank 3, preset 1 is global slot 16 — the panel lands on the bank and the
  // button the modal is about to point at.
  assert.deepStrictEqual(midi.recalled, [16]);
  await runner.confirmSlot();
  assert.deepStrictEqual(midi.recalled, [16, 18], 'the skipped slot is not recalled');
  assert.strictEqual(sent.length, 2);
});

test('the recall comes before the load, never after', async () => {
  const { store, midi, sender, entries } = setup();
  const order = [];
  midi.on('event', (ev) => { if (ev.type === 'current-sound') order.push('recall'); });
  const senderSpy = { send: async (p) => { order.push('send'); return sender.send(p); } };
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender: senderSpy });
  runner.start(list, 2);
  await runner.nextSlot();
  // A recall replaces the edit buffer; the other order would discard the patch.
  assert.deepStrictEqual(order, ['recall', 'send']);
});

test('an unanswered recall stops the walk rather than writing blind', async () => {
  const { store, midi, sender, sent, entries } = setup({ deaf: true });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);

  const done = await runner.nextSlot();
  assert.strictEqual(done.type, 'transfer-done');
  assert.match(done.error, /did not answer the recall for preset 1/);
  assert.deepStrictEqual(sent, [], 'nothing was loaded');
  assert.deepStrictEqual(done.confirmed, []);
});

// The Seven never says "stored". These pin the only thing that distinguishes a
// three-second hold from a tap: what the burst afterwards CARRIES.
// See captures/store-hold-2026-08-12-notes.md.
test('a hold is detected by the slot broadcasting different contents', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  const seen = [];
  runner.on('event', (ev) => { if (ev.type === 'transfer-stored') seen.push(ev.preset); });
  runner.start(list, 2);
  await runner.nextSlot(); // recalls slot 8, loads preset 1

  // The player holds the button: the preset now holds what we sent, so its
  // next broadcast differs from the one the recall gave us.
  midi.slotContents.set(8, 'the-patch-we-sent');
  midi.burst(8);
  assert.deepStrictEqual(seen, [1]);
});

test('a tap is not a hold — same contents, no claim', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  const seen = [];
  runner.on('event', (ev) => { if (ev.type === 'transfer-stored') seen.push(ev.preset); });
  runner.start(list, 2);
  await runner.nextSlot();

  midi.burst(8); // unchanged fingerprint: the preset was recalled, not written
  assert.deepStrictEqual(seen, [], 'nothing is claimed on ambiguous evidence');
});

test('a burst on another slot is not this slot being stored', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  const seen = [];
  runner.on('event', (ev) => { if (ev.type === 'transfer-stored') seen.push(ev.preset); });
  runner.start(list, 2);
  await runner.nextSlot();

  midi.slotContents.set(11, 'something-else');
  midi.burst(11); // the player wandered off to preset 4
  assert.deepStrictEqual(seen, []);
});

test('the detector is disarmed once the walk is over', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  const seen = [];
  runner.on('event', (ev) => { if (ev.type === 'transfer-stored') seen.push(ev.preset); });
  runner.start(list, 2);
  await runner.nextSlot();
  await runner.confirmSlot(); // finishes: nothing left to send

  midi.slotContents.set(8, 'changed-later');
  midi.burst(8);
  assert.deepStrictEqual(seen, [], 'a preset edited after the run is not our business');
});

test('Send PC is borrowed when it is off, and given back at the end', async () => {
  const { store, midi, sender, entries } = setup({ sendPc: 0 });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);

  await runner.nextSlot();
  assert.deepStrictEqual(midi.sendPcWrites, [1], 'turned on for the run');
  assert.strictEqual(midi.restored, 0, 'still borrowed mid-walk');

  await runner.confirmSlot(); // finishes
  assert.strictEqual(midi.restored, 1, 'put back when the run ends');
});

test('Send PC already on is left alone', async () => {
  const { store, midi, sender, entries } = setup({ sendPc: 1 });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  await runner.confirmSlot();
  assert.deepStrictEqual(midi.sendPcWrites, [], 'nothing written');
  assert.strictEqual(midi.restored, 0, 'nothing to restore — we never took it');
});

test('a borrowed Send PC is returned even when the walk is stopped', async () => {
  const { store, midi, sender, entries } = setup({ sendPc: 0 });
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  runner.cancel();
  assert.strictEqual(midi.restored, 1);
});

// One preset from the bank region. It must inherit every rule rather than
// re-implement any of them.
test('a single slot is written through the same walk, with the same rules', async () => {
  const { store, midi, sender, sent, entries } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  const started = runner.startSlot(3, 5, entries[0].file);
  assert.strictEqual(started.started, true);
  assert.strictEqual(started.willWrite, 1);

  const step = await runner.nextSlot();
  assert.strictEqual(step.preset, 5, 'the walk reports the preset it was given');
  assert.strictEqual(step.bank, 3);
  assert.deepStrictEqual(midi.recalled, [20], 'bank 3 preset 5 recalled first');
  assert.strictEqual(sent.length, 1);

  const done = await runner.confirmSlot();
  assert.strictEqual(done.type, 'transfer-done');
  assert.deepStrictEqual(done.confirmed, [5]);
  assert.strictEqual(done.total, 1, 'the seven untouched presets are not counted');
});

// DANIEL'S HYPOTHESIS, PINNED. After Bank 3 presets 2-8 were found holding
// something he never wrote, the natural suspicion was that the single-patch
// send is a bank send with its logic inverted — writing every slot BUT the
// target. This is that question asked directly of the plan and of the walk,
// with the exact arguments he used (Bank 3, preset 1), because a suspicion
// about which slots get written should be answerable without an instrument.
test('a single send touches the target slot and NOTHING else', async () => {
  const { store, midi, sender, sent, entries } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  const started = runner.startSlot(3, 1, entries[0].file);
  assert.strictEqual(started.started, true);

  // THE PLAN. Eight entries, because the walk reports a preset from its
  // position — and exactly one of them is a write.
  assert.strictEqual(started.slots.length, 8);
  const writes = started.slots
    .map((s, i) => ({ i, action: s.action }))
    .filter((s) => s.action === 'send' || s.action === 'send-sound');
  assert.deepStrictEqual(writes, [{ i: 0, action: 'send' }],
    'preset 1 is the only slot the plan writes');
  assert.deepStrictEqual(
    started.slots.filter((_, i) => i !== 0).map((s) => s.action),
    Array(7).fill('skip'),
    'and the other seven are left alone — not the other way round'
  );
  assert.strictEqual(started.willWrite, 1);

  // THE WALK. One recall, one send, and the recall is the target's own
  // program: (3-1)*8 + 0 = 16.
  const step = await runner.nextSlot();
  assert.strictEqual(step.preset, 1);
  assert.strictEqual(step.bank, 3);
  assert.deepStrictEqual(midi.recalled, [16],
    'the instrument is moved to Bank 3 preset 1 and nowhere else');
  assert.strictEqual(sent.length, 1, 'exactly one patch is sent');

  // AND IT ENDS THERE. nextSlot again must finish rather than walk on into the
  // seven it skipped.
  const done = await runner.confirmSlot();
  assert.strictEqual(done.type, 'transfer-done');
  assert.deepStrictEqual(done.confirmed, [1]);
  assert.strictEqual(done.total, 1);
  assert.deepStrictEqual(midi.recalled, [16], 'still only the one recall');
  assert.strictEqual(sent.length, 1, 'and still only the one send');
});

test('a single slot refuses Bank 1, a bad preset, and a sound this unit lacks', () => {
  const { store, midi, sender, entries } = setup({ sounds: ['Tine Piano'] }); // no Clavi
  const runner = new TransferRunner({ midi, store, sender });
  assert.match(runner.preflightSlot(1, 3, entries[0].file).error, /factory presets/);
  assert.match(runner.preflightSlot(2, 9, entries[0].file).error, /no preset 9/);
  const missing = runner.preflightSlot(2, 3, entries[1].file); // Beta = Clavi Piano
  assert.strictEqual(missing.ok, false);
  assert.match(missing.blocked[0].reason, /has no .Clavi Piano./);
});

test('a single slot can be a bare sound', async () => {
  const { store, midi, sender, sent } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  await runner.nextSlot();
  assert.deepStrictEqual(sent[0], {
    sound: { name: 'Clavi Piano' },
    params: { fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0 },
  });
});

// The step reports what it sent, so the panel can show the buffer as it now
// IS rather than as the patch file still describes it.
test('a bare-sound step reports the parameters it sent', async () => {
  const { store, midi, sender } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  const step = await runner.nextSlot();
  assert.deepStrictEqual(step.params, { fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0 });
});

test('refuses without a connection', () => {
  const { store, midi, sender, entries } = setup({ connected: false });
  const list = setlistWith(store, [entries[0].file]);
  const r = new TransferRunner({ midi, store, sender }).preflight(list, 2);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not connected/);
});

// A modeled sound arrives with its FACTORY chain, read off Bank 1 — the Wurly
// with its tremolo, the Rhodes dry — rather than wearing whatever the previous
// patch was running (Daniel, 2026-08-13).
test('a modeled sound brings its Bank 1 factory effects', async () => {
  const { store, midi, sender, sent } = setup();
  // A Bank 1 backup for Clavi Piano, with a chain on it.
  store.list = () => ({
    dir: '/tmp', setlists: [],
    patches: [{
      file: 'factory-clavi.sevenlib.json', patchIndex: 0,
      soundName: 'Clavi Piano', origin: { bank: 1, preset: 4 },
    }],
  });
  store.readFile = () => ({
    library: { patches: [{ params: { rev_sw: 1, rev_lv: 40, fx1_sw: 0, veq_vol: 99 } }] },
  });
  store.schema = {
    parameters: [
      { group: 'efx_rev', key: 'rev_sw' }, { group: 'efx_rev', key: 'rev_lv' },
      { group: 'efx_fx1', key: 'fx1_sw' }, { group: 'efx_veq', key: 'veq_vol' },
    ],
  };
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  await runner.nextSlot();
  assert.strictEqual(sent[0].params.rev_sw, 1, 'the factory reverb comes with it');
  assert.strictEqual(sent[0].params.rev_lv, 40, 'at the factory level');
  assert.strictEqual(sent[0].params.fx1_sw, 0, 'and FX1 is explicitly off');
  assert.ok(!('veq_vol' in sent[0].params), 'the master volume is never sent');
});

// With no Bank 1 backup to read, the chain goes off. A dry instrument is a
// better answer than one wearing values we invented.
test('a modeled sound with no factory backup falls back to a silent chain', async () => {
  const { store, midi, sender, sent } = setup();
  store.list = () => ({ dir: '/tmp', setlists: [], patches: [] });
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(2, 1, 'sound:Clavi Piano');
  await runner.nextSlot();
  assert.deepStrictEqual(sent[0].params, {
    fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0,
  });
});

// Bank 1 cannot be WRITTEN to, but trying a sound on one of its presets
// stores nothing — it recalls the slot and loads a sound into the edit
// buffer, which the next recall replaces (Daniel, 2026-08-13).
test('a bare sound is allowed in Bank 1; a patch is not', () => {
  const { store, midi, sender, entries } = setup();
  const runner = new TransferRunner({ midi, store, sender });
  assert.strictEqual(runner.preflightSlot(1, 1, 'sound:Clavi Piano').ok, true,
    'hearing an instrument on a factory preset is allowed');
  const patch = runner.preflightSlot(1, 1, entries[0].file);
  assert.strictEqual(patch.ok, false, 'sending a patch to Bank 1 is still refused');
  assert.match(patch.error, /factory presets/);
});

// Two Sevens can hold different VERSIONS of one sample set under the same
// name, and no opcode reports a version (docs/DEVICE.md §11). The summary says
// so once, where a sampled sound was actually sent — and nowhere else, because
// there is nothing to detect.
test('the report flags a sampled sound only when one was really sent', async () => {
  const { store, midi, sender, entries } = setup();
  // The instrument's own flag is what decides: Clavi Piano modeled, the Venice
  // sampled, exactly as a real table reports them.
  midi.soundTable = {
    sounds: [
      { id: 0, name: 'Tine Piano', sampled: false },
      { id: 1, name: 'Clavi Piano', sampled: false },
      { id: 2, name: 'Venice Grand D-274', sampled: true },
    ],
  };
  const modeledOnly = setlistWith(store, [entries[0].file]);
  const r1 = new TransferRunner({ midi, store, sender });
  r1.start(modeledOnly, 2);
  await r1.nextSlot();
  const done1 = await r1.confirmSlot();
  assert.strictEqual(done1.sampledSent, false, 'modeled engines carry no samples');

  // Now a patch on the sampled sound.
  const file = store.createPatchFromSound('Venice Grand D-274', { factoryDefaults: { sounds: {} } }).file;
  const withSampled = setlistWith(store, [entries[0].file, file]);
  const r2 = new TransferRunner({ midi, store, sender });
  r2.start(withSampled, 3);
  await r2.nextSlot();
  await r2.confirmSlot();
  const done2 = await r2.confirmSlot();
  assert.strictEqual(done2.sampledSent, true);
});

test('a sampled sound loaded but never confirmed still counts — it reached the instrument', async () => {
  const { store, midi, sender } = setup();
  midi.soundTable = { sounds: [{ id: 0, name: 'Venice Grand D-274', sampled: true }] };
  const file = store.createPatchFromSound('Venice Grand D-274', { factoryDefaults: { sounds: {} } }).file;
  const list = setlistWith(store, [file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  const done = await runner.cancel();
  assert.strictEqual(done.sampledSent, true, 'it is in the edit buffer, so the caveat applies');
});

// --- a slot that already holds the patch ------------------------------------
//
// Auto-advance watches for a CHANGE: the Seven never announces a store, so the
// runner compares the recall burst before the write with the one after it. A
// store that changes nothing is therefore invisible — and Daniel hit exactly
// that twice on Bank 3 Preset 6, whose patch came from that slot in the first
// place. The fix is to stop asking for a hold that has nothing to do.

// A fake whose parameters read back as a given patch, and which reports a
// parameter table the way a connected instrument does.
function fakeWithSlot({ sounds, params, soundId = 0 }) {
  const midi = fakeMidi({ sounds, connected: true });
  midi.paramTable = {
    count: schema.parameters.length,
    params: schema.parameters.map((p) => ({ id: p.id, key: p.key })),
  };
  midi.readParamValue = async (id) => {
    const key = schema.parameters.find((p) => p.id === id).key;
    return { id, key, value: params[key] };
  };
  midi.soundTable = { sounds: sounds.map((name, id) => ({ id, name })) };
  midi.burstSoundId = soundId;
  return midi;
}

const fullParams = (v) => Object.fromEntries(schema.parameters.map((p) => [p.key, v]));

// SKIPPING REQUIRES POSITIVE EVIDENCE — every way of failing to establish a
// match must mean "hold", never "already held".
//
// Daniel's restore reported "Bank 3 already matched — nothing needed storing"
// for eight slots, seven holding a different SOUND and differing in 17 to 37
// of 110 parameters. It has not been reproduced and the cause is still
// unknown. These do not encode a cause: they encode that no cause can produce
// that answer, which is the only guarantee worth having while the mechanism is
// open.
//
// Each case is the same slot that genuinely DOES match, with one input
// degraded — so a test that passes for the wrong reason is impossible: remove
// the degradation and it reports already-held.
function alreadyHeld(midi, store, sender, entries) {
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  return runner.nextSlot().then((step) => !!step.alreadyThere);
}

test('the runner records WHY, for every slot it checks', async () => {
  // The half a log module cannot test: that the runner fills it in, with the
  // things that were unrecoverable after the 2026-08-23 failure — the sound it
  // used, whether the lookup resolved, the size the DEVICE reported for its
  // parameter table, and how many were actually compared.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  const lines = [];
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender, log: (r) => lines.push(r) });
  runner.start(list, 2);
  await runner.nextSlot();

  assert.strictEqual(lines.length, 1, 'one line per slot checked');
  const r = lines[0];
  assert.strictEqual(r.bank, 2);
  assert.strictEqual(r.preset, 1);
  assert.strictEqual(r.verdict, 'already-held');
  assert.strictEqual(r.lookup, 'ok');
  assert.strictEqual(r.soundName, 'Tine Piano');
  assert.strictEqual(r.tableSize, schema.parameters.length, "the DEVICE's table size");
  assert.strictEqual(r.compared, Object.keys(patch.params).length, 'and how many it checked');
  assert.ok(r.at && /^\d{4}-\d{2}-\d{2}T/.test(r.at), 'stamped when it happened');
});

test('a refusal records which input refused', async () => {
  // A verdict with no reason is exactly what cost the day: the app said
  // "already matched" and nothing anywhere said on what basis.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  midi.paramTable = { count: 6, params: midi.paramTable.params.slice(0, 6) };
  const lines = [];
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender, log: (r) => lines.push(r) });
  runner.start(list, 2);
  await runner.nextSlot();
  assert.strictEqual(lines[0].verdict, 'cannot-confirm');
  assert.strictEqual(lines[0].reason, 'table-shorter-than-patch');
  assert.strictEqual(lines[0].tableSize, 6);
  assert.strictEqual(lines[0].patchSize, Object.keys(patch.params).length);
});

test('a slot that DIFFERS names the parameter it stopped on', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const changed = { ...patch.params };
  const key = Object.keys(changed)[7];
  changed[key] = Number(changed[key]) === 1 ? 2 : 1;
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: changed });
  const lines = [];
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender, log: (r) => lines.push(r) });
  runner.start(list, 2);
  await runner.nextSlot();
  assert.strictEqual(lines[0].verdict, 'differs');
  assert.strictEqual(lines[0].reason, 'param');
  assert.match(lines[0].detail, new RegExp(`^${key} held `));
});

test('the control: an untouched match still reports already-held', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), true);
});

test('a SHORT parameter table cannot confirm a match', async () => {
  // The old guard only asked that the patch was not shorter than the table.
  // A table reporting six parameters therefore compared six and skipped the
  // slot on the strength of them.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  midi.paramTable = { count: 6, params: midi.paramTable.params.slice(0, 6) };
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), false,
    'six of 110 parameters is not evidence that a slot holds a patch');
});

test('an unresolvable SOUND cannot confirm a match', async () => {
  // _currentSoundId is a remembered broadcast. If the 0x45 never arrived, or
  // the id is not in the table, there is no sound to compare — and the check
  // used to disappear rather than fail.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  midi.burstSoundId = 99;   // an id no table has
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), false,
    'a sound the app cannot identify is not a sound it may assume matches');
});

test('a MISSING sound table cannot confirm a match', async () => {
  // Taken away after the run starts: preflight legitimately refuses without a
  // table, so this isolates the COMPARISON rather than the plan.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  midi.soundTable = null;
  const step = await runner.nextSlot();
  assert.strictEqual(!!step.alreadyThere, false);
});

test('an UNREADABLE parameter cannot confirm a match', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  // ONE ID, EVERY ATTEMPT. Counting calls instead would be answered by the
  // runner's own retries — attempts two and three would succeed and the slot
  // would be skipped anyway, which is a test that cannot fail.
  const honest = midi.readParamValue;
  const dead = midi.paramTable.params[40].id;
  midi.readParamValue = async (id) => {
    if (id === dead) throw new Error('timeout waiting for 0x23');
    return honest(id);
  };
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), false,
    'one parameter nobody could read is one parameter nobody checked');
});

test('a NON-NUMERIC value cannot confirm a match', async () => {
  // An unparseable reply used to be safe only by accident: NaN !== anything.
  // It is now refused on purpose, and the difference matters the day a reply
  // parses to something that is not a number but IS equal.
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  const honest = midi.readParamValue;
  let n = 0;
  midi.readParamValue = async (id) => {
    n += 1;
    const r = await honest(id);
    return n === 40 ? { ...r, value: undefined } : r;
  };
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), false);
});

test('a reply with no KEY cannot confirm a match', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  const honest = midi.readParamValue;
  let n = 0;
  midi.readParamValue = async (id) => {
    n += 1;
    const r = await honest(id);
    return n === 40 ? { ...r, key: undefined } : r;
  };
  assert.strictEqual(await alreadyHeld(midi, store, sender, entries), false);
});

test('a slot already holding the patch takes no hold, and says so', async () => {
  const { store, midi: _m, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);

  const step = await runner.nextSlot();
  assert.strictEqual(step.alreadyThere, true, 'the slot already holds it');
  assert.strictEqual(step.instruction, 'Preset 1 already holds this patch.');
  assert.strictEqual(sender.sentCount, 0, 'nothing was sent to the instrument');

  const done = await runner.nextSlot();
  assert.strictEqual(done.type, 'transfer-done');
  assert.deepStrictEqual(done.alreadyThere, [1], 'the report says which slots were already right');
  assert.deepStrictEqual(done.confirmed, [], 'and does not claim the player stored anything');
});

test('a slot differing in ONE parameter with no CC is still sent — the hole the fingerprint could not see', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  // rho_hrd has cc -1: invisible to the recall burst, and the whole reason the
  // comparison reads every parameter rather than trusting the fingerprint.
  const drifted = { ...patch.params, rho_hrd: (patch.params.rho_hrd + 1) % 128 };
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: drifted });
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);

  const step = await runner.nextSlot();
  assert.ok(!step.alreadyThere, 'not skipped');
  assert.match(step.instruction, /Hold preset 1/);
  assert.strictEqual(sender.sentCount, 1, 'the patch was sent');
});

test('a short read or a partial patch never skips', async () => {
  const { store, sender, entries } = setup();
  const patch = readPatchFile(store, entries[0].file);
  const midi = fakeWithSlot({ sounds: ['Tine Piano', 'Clavi Piano'], params: patch.params });
  midi.paramTable = null; // no table: no full comparison is possible
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  const step = await runner.nextSlot();
  assert.ok(!step.alreadyThere, 'without a parameter table it asks for the hold');
  assert.match(step.instruction, /Hold preset 1/);
});

// WHERE THE SETLIST NOW LIVES. The bank is passed to preflight and selectBank
// and was never written down, so an exported gig sheet could not say which
// bank to reach for. It is recorded at the END, on success — picking a bank
// and backing out must not stamp anything.
test('a successful transfer records the bank on that setlist', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  assert.strictEqual(store.readSetlists()[list].bank, undefined, 'nothing recorded yet');

  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 3);
  await runner.nextSlot();
  await runner.confirmSlot();
  const done = await runner.confirmSlot();

  assert.strictEqual(done.type, 'transfer-done');
  assert.strictEqual(store.readSetlists()[list].bank, 3, 'the setlist knows its bank');

  // Last successful send wins.
  const again = new TransferRunner({ midi, store, sender });
  again.start(list, 2);
  await again.nextSlot();
  await again.confirmSlot();
  await again.confirmSlot();
  assert.strictEqual(store.readSetlists()[list].bank, 2, 'sending elsewhere moves it');
});

test('a cancelled transfer records nothing', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file, entries[1].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 3);
  await runner.nextSlot();     // preset 1 loaded, nothing stored
  const done = runner.cancel();

  assert.strictEqual(done.cancelled, true);
  assert.strictEqual(store.readSetlists()[list].bank, undefined,
    'walking away from a bank must not claim the setlist is in it');
});

// "Did not error" is not the same as "landed". A run the player walked without
// confirming a single hold stored NOTHING, so the bank does not hold this
// setlist and a sheet saying otherwise sends them to the wrong preset.
test('a completed run that stored nothing records nothing', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 4);
  await runner.nextSlot();          // loaded into the buffer, never confirmed
  const done = runner.cancel();

  assert.deepStrictEqual(done.confirmed, []);
  assert.deepStrictEqual(done.loadedNotConfirmed, [1]);
  assert.strictEqual(store.readSetlists()[list].bank, undefined);
});

// A single-preset send is not a setlist and must never stamp one.
test('sending one preset does not record a bank against any setlist', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.startSlot(3, 5, entries[0].file);
  await runner.nextSlot();
  await runner.confirmSlot();
  assert.strictEqual(store.readSetlists()[list].bank, undefined);
});

// ---- What the report may claim about how a store was established -----------

const { transferNote } = require('../src/transfer-runner.js');

test('all slots seen by the instrument: the note says so, and claims no word', () => {
  const note = transferNote(3, 3);
  assert.match(note, /The Seven showed/);
  assert.doesNotMatch(note, /you confirmed/,
    'claiming the player\'s word was the basis is false when the app watched it land');
});

test('none seen: the note falls back to the player, and says the Seven is silent', () => {
  const note = transferNote(3, 0);
  assert.match(note, /you confirmed the hold/);
  assert.match(note, /does not announce a store/);
  assert.doesNotMatch(note, /The Seven showed/);
});

test('MIXED: both bases are named, with the count', () => {
  // The case the old note could not express at all — it asserted the weaker
  // basis flatly, for every slot, however each one was actually established.
  const note = transferNote(4, 1);
  assert.match(note, /showed 1 of these 4/);
  assert.match(note, /you confirmed the hold/);
});

test('nothing stored: no note at all', () => {
  assert.strictEqual(transferNote(0, 0), '');
});

test('verified can never exceed confirmed', () => {
  // A slot the instrument showed us is also a slot that was confirmed — the
  // renderer calls confirm() either way. If that ever inverted, the note would
  // claim more than happened.
  assert.match(transferNote(2, 5), /The Seven showed/,
    'it degrades to the stronger claim rather than printing "5 of these 2"');
});
