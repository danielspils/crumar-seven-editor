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
function fakeMidi({ sounds, connected, deaf = false }) {
  const midi = new EventEmitter();
  midi.state = connected ? 'connected' : 'disconnected';
  midi.soundTable = { sounds: sounds.map((name, id) => ({ id, name })) };
  midi.recalled = [];
  midi.sendProgramChange = (program) => {
    midi.recalled.push(program);
    if (deaf) return;
    setImmediate(() => midi.emit('event', { type: 'current-sound', soundId: 0 }));
  };
  return midi;
}

function setup({ sounds = ['Tine Piano', 'Clavi Piano'], connected = true, deaf = false } = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-transfer-')), 'Library');
  const store = new LibraryStore(dir, schema, {
    banks: [{ patches: [
      { name: 'Alpha', soundName: 'Tine Piano', params: params(64) },
      { name: 'Beta', soundName: 'Clavi Piano', params: params(20) },
    ] }],
  });
  const entries = store.list().patches;
  const midi = fakeMidi({ sounds, connected, deaf });
  const sent = [];
  const sender = { send: async (patch) => { sent.push(patch); return { sent: 1 }; } };
  return { store, midi, sender, sent, entries, dir };
}

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
  const list = setlistWith(store, [entries[0].file, null, 'sound:Clavi Piano']);
  const plan = new TransferRunner({ midi, store, sender }).preflight(list, 3);

  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.slots[0].action, 'send');
  assert.strictEqual(plan.slots[1].action, 'skip');
  assert.match(plan.slots[1].reason, /left alone/);
  assert.strictEqual(plan.slots[2].action, 'send-sound');
  assert.strictEqual(plan.willWrite, 2);
  assert.match(plan.warning, /will be replaced/);
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

test('a sound-only slot sends the sound and no parameters', async () => {
  const { store, midi, sender, sent } = setup();
  const list = setlistWith(store, ['sound:Clavi Piano']);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  assert.deepStrictEqual(sent[0], { sound: { name: 'Clavi Piano' }, params: {} });
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

test('the report never claims the instrument confirmed a store', async () => {
  const { store, midi, sender, entries } = setup();
  const list = setlistWith(store, [entries[0].file]);
  const runner = new TransferRunner({ midi, store, sender });
  runner.start(list, 2);
  await runner.nextSlot();
  const done = await runner.confirmSlot();
  assert.match(done.note, /the Seven does not report stores/);
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

test('refuses without a connection', () => {
  const { store, midi, sender, entries } = setup({ connected: false });
  const list = setlistWith(store, [entries[0].file]);
  const r = new TransferRunner({ midi, store, sender }).preflight(list, 2);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not connected/);
});
