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

const { TransferRunner } = require('../src/transfer-runner');
const { LibraryStore } = require('../src/library-store');
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schema', 'seven-1.37.json'), 'utf8')
);

const params = (v) => Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(v, p.max)]));

function setup({ sounds = ['Tine Piano', 'Clavi Piano'], connected = true } = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-transfer-')), 'Library');
  const store = new LibraryStore(dir, schema, {
    banks: [{ patches: [
      { name: 'Alpha', soundName: 'Tine Piano', params: params(64) },
      { name: 'Beta', soundName: 'Clavi Piano', params: params(20) },
    ] }],
  });
  const entries = store.list().patches;
  const midi = {
    state: connected ? 'connected' : 'disconnected',
    soundTable: { sounds: sounds.map((name, id) => ({ id, name })) },
  };
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

test('refuses without a connection', () => {
  const { store, midi, sender, entries } = setup({ connected: false });
  const list = setlistWith(store, [entries[0].file]);
  const r = new TransferRunner({ midi, store, sender }).preflight(list, 2);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not connected/);
});
