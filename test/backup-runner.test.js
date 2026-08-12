'use strict';

// BackupRunner against a fake instrument. This is the code that decides
// whether a patch is safe on disk, so the rules worth pinning are the strict
// ones: a slot that does not answer aborts the whole run rather than being
// skipped, a dropped reply is retried, unchanged slots are not duplicated but
// ARE re-stamped, and a partial run says so in the setlist name.

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BackupRunner } = require('../src/backup-runner');
const { LibraryStore } = require('../src/library-store');
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schema', 'seven-1.37.json'), 'utf8')
);

// A Seven that recalls instantly and answers every read, unless told not to.
class FakeSeven extends EventEmitter {
  constructor({ deafSlot = null, dropOnce = null, soundId = 0 } = {}) {
    super();
    this.state = 'connected';
    this.soundTable = { sounds: schema.sounds.map(({ id, name }) => ({ id, name })) };
    this.globals = { glb: [0, 1, 1, 1, 0, 1, 0, 1, 0] }; // glb[3] = Send PC on
    this.lastPanelProgram = null;
    this.sentPrograms = [];
    this.deafSlot = deafSlot;
    this.dropOnce = dropOnce;
    this.dropped = new Set();
    this.soundId = soundId;
    this.reads = 0;
  }

  sendProgramChange(program) {
    this.sentPrograms.push(program);
    if (program === this.deafSlot) return; // never broadcasts: the run must abort
    // The instrument answers a recall with an unsolicited 0x45.
    setImmediate(() => this.emit('event', { type: 'current-sound', soundId: this.soundId }));
  }

  async readParamValue(id) {
    this.reads++;
    if (this.dropOnce === id && !this.dropped.has(id)) {
      this.dropped.add(id);
      throw new Error('timeout waiting for 0x23');
    }
    return { id, key: schema.parameters.find((p) => p.id === id).key, value: 64 };
  }

  async readGlobals() {
    return { tun: 440, glb: this.globals.glb, wfp: '[wfp redacted]' };
  }
}

function freshStore() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-backup-')), 'Library');
  // An empty fixture: the run itself is what should create patches here.
  return new LibraryStore(dir, schema, { banks: [] });
}

const setlistNames = (store) => store.readSetlists().map((s) => s.name);

test('a full run writes 32 slots and four dated setlists', async () => {
  const midi = new FakeSeven();
  const store = freshStore();
  const runner = new BackupRunner({ midi, store, schema });
  const done = await runner.run();

  assert.strictEqual(done.ok, true);
  assert.strictEqual(done.slots, 32);
  assert.strictEqual(done.created, 32, 'every slot is new on an empty library');
  assert.strictEqual(done.partial, false);
  assert.deepStrictEqual(midi.sentPrograms.slice(0, 32), [...Array(32).keys()],
    'slots are recalled 0..31 in order');

  const dated = setlistNames(store).filter((n) => /^Bank [1-4] setlist \(\d{4}-\d{2}-\d{2}\)$/.test(n));
  assert.strictEqual(dated.length, 4, `four clean setlist names, got: ${setlistNames(store)}`);
});

test('a slot that never answers ABORTS the run — it is never skipped', async () => {
  const midi = new FakeSeven({ deafSlot: 5 });
  const store = freshStore();
  const runner = new BackupRunner({ midi, store, schema });
  const done = await runner.run();

  assert.strictEqual(done.ok, false);
  assert.match(done.error, /no recall broadcast/);
  assert.strictEqual(done.slots, 5, 'it stops at the silent slot rather than continuing past it');
  const written = setlistNames(store).filter((n) => n.startsWith('Bank '));
  assert.ok(written.length > 0 && written.every((n) => n.includes('partial')),
    `a partial run labels every setlist it wrote: ${written}`);
});

test('a dropped parameter reply is retried, not fatal', async () => {
  const midi = new FakeSeven({ dropOnce: 7 });
  const store = freshStore();
  const done = await new BackupRunner({ midi, store, schema }).run();
  assert.strictEqual(done.ok, true, 'one dropped reply does not end the run');
  assert.strictEqual(done.slots, 32);
});

test('a second run of unchanged slots creates nothing and re-stamps everything', async () => {
  const midi = new FakeSeven();
  const store = freshStore();
  await new BackupRunner({ midi, store, schema }).run();
  const filesAfterFirst = store.list().patches.map((e) => e.file).sort();

  const again = await new BackupRunner({ midi, store, schema }).run();
  assert.strictEqual(again.created, 0, 'identical slots are not written twice');
  assert.strictEqual(again.unchanged, 32);
  assert.deepStrictEqual(store.list().patches.map((e) => e.file).sort(), filesAfterFirst,
    'no duplicate files appear');

  // Unchanged still means CONFIRMED: every patch carries a fresh verified stamp.
  const stamped = store.list().patches.every((e) => !!e.origin.date);
  assert.ok(stamped, 'every slot reports a date after a re-run');
});

test('cancelling stops early and the setlists say partial', async () => {
  const midi = new FakeSeven();
  const store = freshStore();
  const runner = new BackupRunner({ midi, store, schema });
  runner.on('event', (ev) => {
    if (ev.type === 'backup-progress' && ev.n === 3) runner.cancel();
  });
  const done = await runner.run();

  assert.strictEqual(done.cancelled, true);
  assert.ok(done.slots >= 3 && done.slots < 32, `stopped early, got ${done.slots} slots`);
  const written = setlistNames(store).filter((n) => n.startsWith('Bank '));
  assert.ok(written.length > 0 && written.every((n) => n.includes('partial')),
    `a cancelled run labels every setlist it wrote: ${written}`);
});

test('the run returns the instrument to where it started, when it can', async () => {
  const midi = new FakeSeven();
  midi.lastPanelProgram = 9; // the panel told us: Bank 2, Preset 2
  const store = freshStore();
  const done = await new BackupRunner({ midi, store, schema }).run();
  assert.strictEqual(midi.sentPrograms[midi.sentPrograms.length - 1], 9,
    'the last thing sent is the slot the player was on');
  assert.strictEqual(done.restored, true);
});

test('with no known prior slot it does not guess', async () => {
  const midi = new FakeSeven(); // lastPanelProgram stays null
  const store = freshStore();
  const done = await new BackupRunner({ midi, store, schema }).run();
  assert.strictEqual(done.restored, false);
  assert.strictEqual(midi.sentPrograms[midi.sentPrograms.length - 1], 31,
    'it is left on the last slot read, which is what the dialog promised');
});

test('the globals snapshot is written with wfp already redacted', async () => {
  const midi = new FakeSeven();
  const store = freshStore();
  const done = await new BackupRunner({ midi, store, schema }).run();
  assert.ok(done.globalsFile, 'a snapshot is written');
  const raw = fs.readFileSync(path.join(store.dir, done.globalsFile), 'utf8');
  assert.match(raw, /\[wfp redacted\]/);
  assert.ok(!/password|passphrase/i.test(raw));
});

test('refuses to run without a connection', async () => {
  const midi = new FakeSeven();
  midi.state = 'disconnected';
  await assert.rejects(new BackupRunner({ midi, store: freshStore(), schema }).run(), /not connected/);
});
