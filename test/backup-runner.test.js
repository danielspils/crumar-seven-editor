'use strict';

// BackupRunner against a fake instrument. This is the code that decides
// whether a patch is safe on disk, so the rules worth pinning are the strict
// ones: a slot that does not answer aborts the whole run rather than being
// skipped, a dropped reply is retried, unchanged slots are not duplicated but
// ARE re-stamped, and a run that stopped says "failed" in the setlist name.

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BackupRunner } = require('../src/backup-runner');
const { parseGlobals } = require('../src/seven-midi');
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
    const p = schema.parameters.find((q) => q.id === id);
    return { id, key: p.key, value: deviceValue(p) };
  }

  // Through the REAL parser, from a reply shaped like the instrument's — with
  // an actual password in it. Returning '[wfp redacted]' directly was the
  // tautology that hid a missing guard for weeks: the snapshot test asserted a
  // string this fixture handed it, so deleting the redaction entirely left the
  // suite green (2026-08-17).
  async readGlobals() {
    return parseGlobals(
      `tun=440;glb=${this.globals.glb.join(',')};wfp=hunter2-correct-horse`
    );
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
  assert.ok(written.length > 0 && written.every((n) => n.includes('failed')),
    `a run that stopped labels every setlist it wrote: ${written}`);
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

test('cancelling stops early and the setlists say failed', async () => {
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
  assert.ok(written.length > 0 && written.every((n) => n.includes('failed')),
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

// --- inherited names -------------------------------------------------------
//
// The Seven stores no preset names, so a name cannot survive a round trip on
// the wire: a transfer sends a sound and 110 values, and the backup afterwards
// would relabel the slot from bank, preset and sound. These tests pin the one
// path by which a name CAN survive — and, just as important, the cases where
// the app must decline to guess one.

// Every slot the fake instrument reports reads back identically (value 64 on
// every parameter), so a patch built the same way matches every slot's
// contents. `name` and `origin` are what each test varies.
// WHAT THIS INSTRUMENT ANSWERS, in one place. The fake used to say 64 for
// every parameter whatever its max, so every patch hashed the same shape and
// the dedupe and name-inheritance tests could not tell one parameter from
// another — they passed for the wrong reason (Daniel, 2026-08-15, fixed
// 2026-08-17). Now each id gets a different value that its own max allows,
// deterministically, and the FIXTURES below derive from the same function so
// the two cannot drift back apart.
const deviceValue = (p) => (p.id * 7) % (p.max + 1);
const deviceParams = () =>
  Object.fromEntries(schema.parameters.map((p) => [p.key, deviceValue(p)]));

// `value` overrides every parameter, for the fixtures that must NOT match what
// the instrument holds — clamped per parameter, since a patch claiming a value
// above a parameter's max is not a patch the app could ever have written.
const libraryPatch = (store, { name, bank, preset, value = null }) => store.saveBackupPatch({
  name,
  origin: { bank, preset, soundId: 0, soundTableFingerprint: 'ffff' },
  sound: { name: schema.sounds[0].name, id: 0 },
  params: value == null
    ? deviceParams()
    : Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(value, p.max)])),
  captured: '2026-08-01T00:00:00Z',
  verified: '2026-08-01T00:00:00Z',
});

const readPatch = (store, file) =>
  JSON.parse(fs.readFileSync(path.join(store.dir, file), 'utf8')).patches[0];

const slotOneOf = (store) => {
  const e = store.list().patches
    .filter((p) => p.origin.kind === 'backup' && p.origin.bank === 1 && p.origin.preset === 1)
    .sort((a, b) => String(b.origin.captured).localeCompare(String(a.origin.captured)))[0];
  return readPatch(store, e.file);
};

test('exactly one library patch with these contents lends its name', async () => {
  const store = freshStore();
  // A patch captured from a DIFFERENT slot, holding what Bank 1 Preset 1 now
  // holds — the shape a transfer leaves behind.
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1 });
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();

  const written = slotOneOf(store);
  assert.strictEqual(written.name, 'Kitchen Dishes Delay', 'the name is borrowed');
  assert.ok(written.nameFrom, 'and the file says so');
  assert.strictEqual(written.nameFrom.name, 'Kitchen Dishes Delay');
  assert.match(written.nameFrom.file, /kitchen-dishes-delay/);
  // The name is borrowed; the origin is NOT.
  assert.strictEqual(written.origin.bank, 1);
  assert.strictEqual(written.origin.preset, 1);
});

test('no match gives the generated name, and no nameFrom', async () => {
  const store = freshStore();
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  const written = slotOneOf(store);
  assert.match(written.name, /^Bank 1 Preset 1 — /);
  assert.strictEqual(written.nameFrom, undefined);
});

test('several matches decline — the app never picks between two names', async () => {
  const store = freshStore();
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1 });
  libraryPatch(store, { name: 'Something Else Entirely', bank: 4, preset: 2 });
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  const written = slotOneOf(store);
  assert.match(written.name, /^Bank 1 Preset 1 — /, 'ambiguity gives the dull name');
  assert.strictEqual(written.nameFrom, undefined);
});

test('the slot’s own older record cannot compete, because it holds other values', async () => {
  const store = freshStore();
  // What a transfer leaves behind: the slot's previous record (different
  // contents, since the slot changed) and the patch that was sent there.
  libraryPatch(store, { name: 'Bank 1 Preset 1 — Tine Piano', bank: 1, preset: 1, value: 20 });
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1 });
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();

  const written = slotOneOf(store);
  assert.strictEqual(written.name, 'Kitchen Dishes Delay');
  assert.ok(written.nameFrom);
});

test('a same-slot record holding the SAME values means nothing is written', async () => {
  const store = freshStore();
  // This is why no same-slot exclusion is needed: dedupe matches first and the
  // run writes nothing, so there is no name to decide.
  libraryPatch(store, { name: 'Bank 1 Preset 1 — Tine Piano', bank: 1, preset: 1 });
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1 });
  const done = await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  assert.ok(done.unchanged >= 1, 'the slot deduped');
  assert.strictEqual(slotOneOf(store).name, 'Bank 1 Preset 1 — Tine Piano');
});

test('a patch with different values lends nothing — it is not that patch any more', async () => {
  const store = freshStore();
  // One parameter edited on the panel is enough: the hash stops matching.
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1, value: 63 });
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  const written = slotOneOf(store);
  assert.match(written.name, /^Bank 1 Preset 1 — /);
  assert.strictEqual(written.nameFrom, undefined);
});

test('an unchanged slot is not renamed — nothing is written at all', async () => {
  const store = freshStore();
  await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  const first = slotOneOf(store);
  // Now offer a name. The second run finds every slot unchanged, so no record
  // is created and no name is inherited: this decides what to CALL a record
  // being written, never what to rename.
  libraryPatch(store, { name: 'Kitchen Dishes Delay', bank: 4, preset: 1 });
  const done = await new BackupRunner({ midi: new FakeSeven(), store, schema }).run();
  assert.strictEqual(done.created, 0, 'nothing changed on the instrument');
  assert.strictEqual(slotOneOf(store).name, first.name, 'the existing record keeps its name');
});
