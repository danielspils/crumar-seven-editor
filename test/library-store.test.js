'use strict';

// LibraryStore against a temp folder. Everything here is a rule the app
// depends on and nothing had covered: renames that move files, setlist slots
// that survive those renames, and the two timestamps that tell "first read"
// apart from "still current".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LibraryStore } = require('../src/library-store');
const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'schema', 'seven-1.37.json'), 'utf8')
);

// A minimal fixture library — enough for ensureSeeded to produce known files.
const fixture = {
  banks: [
    {
      patches: [
        { name: 'Alpha', soundName: 'Tine Piano', params: paramsAll(64) },
        { name: 'Beta', soundName: 'Clavi Piano', params: paramsAll(10) },
      ],
    },
  ],
};

function paramsAll(v) {
  return Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(v, p.max)]));
}

function freshStore() {
  // The directory must NOT exist yet: seeding deliberately skips a folder that
  // is already there, so an empty one stays empty (see getStore in main.js).
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-store-')), 'Library');
  return { dir, store: new LibraryStore(dir, schema, fixture) };
}

const entries = (store) => {
  const listed = store.list();
  return Array.isArray(listed) ? listed : listed.patches;
};
const byName = (store, name) => entries(store).find((e) => e.name === name);
// Seeding also creates a demo setlist, so nothing may assume index 0.
const listIndex = (store, name) => store.readSetlists().findIndex((s) => s.name === name);
const listNamed = (store, name) => store.readSetlists().find((s) => s.name === name);

test('demo content exists only when a test or the dev flag asks for it', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const all = entries(store);
  assert.strictEqual(all.length, 2);
  assert.ok(byName(store, 'Alpha'), 'Alpha is there');
  // Seeded patches must claim "created", never fall back to it.
  assert.strictEqual(byName(store, 'Alpha').origin.kind, 'created');
});

test('rename moves the file and the entry follows', () => {
  const { store, dir } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const before = byName(store, 'Alpha');
  const target = store.rename(before.file, before.patchIndex, 'Rhodes Mk1');
  assert.notStrictEqual(target, before.file, 'the file is renamed too');
  assert.ok(fs.existsSync(path.join(dir, target)));
  assert.ok(!fs.existsSync(path.join(dir, before.file)), 'the old file is gone');
  assert.strictEqual(byName(store, 'Rhodes Mk1').file, target);
});

// This used to assert that renaming onto a taken name was ALLOWED and left
// two patches called "Alpha". That is the thing being outlawed: two patches
// with one name render identically in the picker (2026-08-18).
test('renaming onto a name another patch already has is refused', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const alphaFile = byName(store, 'Alpha').file;
  const beta = byName(store, 'Beta');

  assert.throws(
    () => store.rename(beta.file, beta.patchIndex, 'Alpha'),
    (err) => err.code === 'NAME_TAKEN' && /already a patch called/.test(err.message)
  );

  // Nothing moved: both patches are where they were, under the names they had.
  assert.ok(fs.existsSync(path.join(store.dir, alphaFile)), 'Alpha untouched');
  assert.deepStrictEqual(entries(store).map((e) => e.name).sort(), ['Alpha', 'Beta']);
  assert.strictEqual(entries(store).filter((e) => e.invalid).length, 0);
});

// The guarantee the old test was really about, kept: two DIFFERENT names can
// still slugify to one filename, and the second must not overwrite the first.
test('two different names that slugify alike get different files', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const alphaFile = byName(store, 'Alpha').file;
  const beta = byName(store, 'Beta');
  const target = store.rename(beta.file, beta.patchIndex, 'Alpha!');
  assert.notStrictEqual(target, alphaFile, 'it takes a filename of its own');
  assert.ok(fs.existsSync(path.join(store.dir, alphaFile)), 'the original file survives');
  assert.deepStrictEqual(entries(store).map((e) => e.name).sort(), ['Alpha', 'Alpha!']);
});

test('setlist slots follow a renamed file', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const alpha = byName(store, 'Alpha');
  store.createSetlist('Gig');
  const gig = listIndex(store, 'Gig');
  store.assignSlot(gig, 2, alpha.file);
  const target = store.rename(alpha.file, alpha.patchIndex, 'Renamed');
  assert.strictEqual(listNamed(store, 'Gig').slots[2], target,
    'the slot points at the new filename, not a file that no longer exists');
});

// A slot holds a PATCH FILE and nothing else. Choosing an instrument used to
// store "sound:NAME" — a second kind of thing every row and every send had to
// special-case — and now writes the patch it means (Daniel, 2026-08-14).
test('assigning an instrument writes a patch and stores its file', () => {
  const { store } = freshStore();
  store.createSetlist('Gig');
  const gig = listIndex(store, 'Gig');
  store.assignSlot(gig, 0, 'sound:Tine Piano');
  const slot = listNamed(store, 'Gig').slots[0];
  assert.ok(slot && !slot.startsWith('sound:'), `the slot holds a file (${slot})`);
  const made = store.list().patches.find((e) => e.file === slot);
  assert.ok(made, 'and that file is in the library');
  assert.strictEqual(made.soundName, 'Tine Piano');
  assert.strictEqual(made.origin.kind, 'created', 'it is a patch you made, not a capture');
});

// EVERY parameter, always. It wrote five keys — the effects-block switches,
// all 0 — which bypassed those blocks and left the other 105 absent from the
// file, so everything inside them was inert (Daniel, 2026-08-14).
const allKeys = () => schema.parameters.map((p) => p.key).sort();

test('a generated patch carries all 110 parameters', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  assert.strictEqual(Object.keys(made.params).length, schema.parameters.length);
  assert.deepEqual(Object.keys(made.params).sort(), allKeys(), 'the key set is the schema\'s');
});

// A MODEL comes from Crumar's Bank 1 preset for that engine — always the same,
// whatever else is in the library (Daniel, 2026-08-16).
test('a modeled sound is built from Bank 1, whole', () => {
  const { store } = freshStore();
  const bank1 = Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(9, p.max)]));
  bank1.rev_sw = 1; bank1.rev_lv = 44;
  const made = store.createPatchFromSound('Tine Piano', {
    factoryDefaults: { sounds: { 'Tine Piano': bank1 } },
  });
  assert.strictEqual(made.source, 'factory');
  assert.strictEqual(made.params.rev_sw, 1);
  assert.strictEqual(made.params.rev_lv, 44);
  assert.deepEqual(Object.keys(made.params).sort(), allKeys());
  const written = JSON.parse(fs.readFileSync(path.join(store.dir, made.file), 'utf8')).patches[0];
  assert.strictEqual(written.origin.source, 'factory', 'the file says where the values came from');
});

// A SAMPLE has no Bank 1 reference — Bank 1 holds no sampled sound — so it is
// a clean slate rather than a guess.
test('a sampled sound is a clean slate with the effects off', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Venice Grand D-274', { factoryDefaults: { sounds: {} } });
  assert.strictEqual(made.source, 'clean');
  for (const sw of ['fx1_sw', 'fx2_sw', 'amp_sw', 'rev_sw', 'pad_sw']) {
    assert.strictEqual(made.params[sw], 0, `${sw} is off`);
  }
  const seeded = schema.parameters.find((p) => p.key === 'rho_atk');
  assert.strictEqual(made.params.rho_atk, Math.min(64, seeded.max), 'the rest take the seed');
  assert.deepEqual(Object.keys(made.params).sort(), allKeys());
});

test('a library capture never changes what a new patch is built from', () => {
  const { store } = freshStore();
  const params = Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(7, p.max)]));
  store.saveBackupPatch({
    name: 'Bank 3 Preset 8 — Tine Piano',
    sound: { name: 'Tine Piano', sampled: false },
    params,
    origin: { bank: 3, preset: 8, soundId: 0 },
    captured: new Date().toISOString(),
  });
  const bank1 = Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(9, p.max)]));
  const made = store.createPatchFromSound('Tine Piano', {
    factoryDefaults: { sounds: { 'Tine Piano': bank1 } },
  });
  assert.strictEqual(made.params.rho_atk, bank1.rho_atk, 'Bank 1, not the capture');
  assert.notStrictEqual(made.params.rho_atk, params.rho_atk);
});

test('the offered name is the sound, then numbered', () => {
  const { store } = freshStore();
  assert.strictEqual(store.nextPatchName('Clavi Piano'), 'Clavi Piano');
  store.createPatchFromSound('Clavi Piano', {
    factoryDefaults: { sounds: {} }, patchName: 'Clavi Piano',
  });
  assert.strictEqual(store.nextPatchName('Clavi Piano'), 'Clavi Piano 2');
  store.createPatchFromSound('Clavi Piano', {
    factoryDefaults: { sounds: {} }, patchName: 'Clavi Piano 2',
  });
  assert.strictEqual(store.nextPatchName('Clavi Piano'), 'Clavi Piano 3');
});

test('a typed name is used, and an empty one falls back to the sound', () => {
  const { store } = freshStore();
  const named = store.createPatchFromSound('Clavi Piano', {
    factoryDefaults: { sounds: {} }, patchName: 'Kitchen Dishes Delay',
  });
  assert.strictEqual(named.name, 'Kitchen Dishes Delay');
  const blank = store.createPatchFromSound('Clavi Piano', {
    factoryDefaults: { sounds: {} }, patchName: '   ',
  });
  assert.strictEqual(blank.name, 'Clavi Piano', 'never an unnamed patch');
});

// A stale choice from a dialog left open must not seed a patch from a capture
// of some OTHER sound.
test('a donor that is not a capture of this sound is refused', () => {
  const { store } = freshStore();
  const other = store.saveBackupPatch({
    name: 'Bank 2 Preset 2 — Reed Piano',
    sound: { name: 'Reed Piano', sampled: false },
    params: Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(9, p.max)])),
    origin: { bank: 2, preset: 2, soundId: 1 },
    captured: new Date().toISOString(),
  });
  const made = store.createPatchFromSound('Tine Piano', { donorFile: other });
  const written = store.readFile(made.file).library.patches[0];
  assert.ok(!written.origin.donor, 'no donor is claimed');
  assert.strictEqual(Object.keys(written.params).length, schema.parameters.length,
    'and it still writes every parameter');
});

// Same input, same output — whatever else is in the library.
test('regenerating the same sound twice produces identical params', () => {
  const { store } = freshStore();
  for (const [bank, preset, v] of [[3, 2, 9], [1, 4, 3], [2, 1, 7]]) {
    store.saveBackupPatch({
      name: `Bank ${bank} Preset ${preset} — Tine Piano`,
      sound: { name: 'Tine Piano', sampled: false },
      params: Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(v, p.max)])),
      origin: { bank, preset, soundId: 0 },
      captured: new Date().toISOString(),
    });
  }
  const a = store.createPatchFromSound('Tine Piano');
  const b = store.createPatchFromSound('Tine Piano');
  assert.notStrictEqual(a.file, b.file, 'two files, so this is not comparing one patch to itself');
  assert.deepEqual(b.params, a.params, 'identical values');
  assert.deepEqual(b.sources, a.sources, 'and from the same places');
});

// The regression the report asked for, kept as a test: a generated patch and a
// device backup of the same sound must have identical key sets.
test('a generated patch has the same key set as a device backup', () => {
  const { store } = freshStore();
  const params = Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(5, p.max)]));
  const file = store.saveBackupPatch({
    name: 'Bank 3 Preset 8 — Clavi Piano',
    sound: { name: 'Clavi Piano', sampled: false },
    params,
    origin: { bank: 3, preset: 8, soundId: 3 },
    captured: new Date().toISOString(),
  });
  const backup = store.readFile(file).library.patches[0];
  const made = store.createPatchFromSound('Clavi Piano');
  const a = Object.keys(backup.params).sort();
  const b = Object.keys(made.params).sort();
  assert.deepEqual(b, a, 'no key is present in one and absent from the other');
});

// The shape matches a device-backed patch: one source of truth for the sound,
// and an origin that does not claim the instrument produced it.
test('a generated patch does not duplicate the sound or claim the instrument', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano');
  const written = store.readFile(made.file).library.patches[0];
  assert.deepEqual(written.sound, { name: 'Tine Piano', sampled: false });
  assert.ok(!('soundName' in written), 'no duplicated soundName');
  assert.ok(!('sampled' in written), 'no duplicated sampled');
  assert.strictEqual(written.origin.kind, 'generated');
  assert.strictEqual(written.origin.generatedFrom, 'Tine Piano');
  assert.ok(!('fromInstrument' in written.origin), 'it does not claim to come from the instrument');
});

// Setlists written by the old build still hold sound refs. They convert once,
// into exactly what an assignment makes today.
test('old sound-only slots migrate to patches', () => {
  const { store } = freshStore();
  store.createSetlist('Legacy');
  const i = listIndex(store, 'Legacy');
  // Write the old shape straight to disk, as an older build would have.
  const setlists = store.readSetlists();
  setlists[i].slots[0] = 'sound:Tine Piano';
  setlists[i].slots[1] = 'sound:Tine Piano';
  store.writeSetlists(setlists);

  store.list(); // the migration runs on read
  const after = listNamed(store, 'Legacy').slots;
  assert.ok(!String(after[0]).startsWith('sound:'), 'the slot holds a file');
  assert.strictEqual(after[0], after[1], 'two slots on one instrument share one patch file');
  assert.strictEqual(store.migrateSoundSlots(), 0, 'and it does not run again');
});

test('clear, move and delete behave', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const alpha = byName(store, 'Alpha');
  store.createSetlist('Gig');
  const gig = listIndex(store, 'Gig');
  store.assignSlot(gig, 0, alpha.file);
  store.moveSlot(gig, 0, 3);
  assert.strictEqual(listNamed(store, 'Gig').slots[3], alpha.file);
  assert.strictEqual(listNamed(store, 'Gig').slots[0], null);
  store.clearSlot(gig, 3);
  assert.strictEqual(listNamed(store, 'Gig').slots[3], null);
  store.deleteSetlist(gig);
  assert.strictEqual(listNamed(store, 'Gig'), undefined, 'the setlist is gone');
  // Deleting a setlist never touches the patches it referenced.
  assert.ok(byName(store, 'Alpha'), 'the patch is still in the library');
});

test('createOrReplaceSetlist replaces the same name instead of stacking', () => {
  const { store } = freshStore();
  store.createOrReplaceSetlist('Backup Bank 1', [null, null]);
  store.createOrReplaceSetlist('Backup Bank 1', ['a.sevenlib.json']);
  const lists = store.readSetlists().filter((x) => x.name === 'Backup Bank 1');
  assert.strictEqual(lists.length, 1);
  assert.strictEqual(lists[0].slots[0], 'a.sevenlib.json');
  assert.strictEqual(lists[0].slots.length, 8, 'slots are padded to eight');
});

test('savePatchParams writes known keys and stamps both dates', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const alpha = byName(store, 'Alpha');
  store.savePatchParams(alpha.file, alpha.patchIndex, { rho_atk: 12, not_a_key: 5 });
  const after = byName(store, 'Alpha');
  assert.strictEqual(after.params.rho_atk, 12);
  assert.ok(!('not_a_key' in after.params), 'a key the schema does not know is refused');
  assert.ok(after.origin.date, 'the entry reports a date');
});

test('verified is preferred over captured for the displayed date', () => {
  const { store, dir } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const alpha = byName(store, 'Alpha');
  assert.ok(alpha, 'the seeded patch is there');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, alpha.file), 'utf8'));
  raw.patches[0].origin = { bank: 1, preset: 1 };
  raw.patches[0].captured = '2026-08-01T10:00:00Z';
  raw.patches[0].verified = '2026-08-09T10:00:00Z';
  fs.writeFileSync(path.join(dir, alpha.file), `${JSON.stringify(raw, null, 2)}\n`);
  const entry = entries(store).find((e) => e.file === alpha.file);
  assert.strictEqual(entry.origin.date, '2026-08-09T10:00:00Z', 'freshness wins');
  assert.strictEqual(entry.origin.captured, '2026-08-01T10:00:00Z', 'first-read is still reported');
});

test('touchVerified marks a patch current without touching its values', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const alpha = byName(store, 'Alpha');
  assert.strictEqual(alpha.origin.kind, 'created', 'a created patch, not a backup');
  const before = { ...alpha.params };
  store.touchVerified(alpha.file, alpha.patchIndex, '2026-08-11T16:00:00Z');
  const after = entries(store).find((e) => e.file === alpha.file);
  assert.deepStrictEqual(after.params, before, 'values are untouched');
  assert.strictEqual(after.origin.date, '2026-08-11T16:00:00Z');
});

test('an unreadable file is reported, not thrown', () => {
  const { store, dir } = freshStore();
  entries(store); // let the store create and seed the folder
  fs.writeFileSync(path.join(dir, 'broken.sevenlib.json'), '{ not json');
  const bad = entries(store).find((e) => e.file === 'broken.sevenlib.json');
  assert.ok(bad && bad.invalid, 'it appears as invalid rather than crashing the list');
});

test('a malformed setlist entry is dropped, the rest survive', () => {
  const { store, dir } = freshStore();
  store.createSetlist('Good');
  const file = path.join(dir, 'setlists.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.setlists.push({ name: 42, slots: 'nope' });
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.ok(listNamed(store, 'Good'), 'the good setlist survives');
  assert.ok(!store.readSetlists().some((x) => x.name === 42), 'the malformed one is dropped');
});

// Ordering the setlist list: the store stamps `touchedAt` on every act, and
// the view sorts on it. The file's own order never changes — setlists are
// addressed by position, so a reorder that renumbered them would repoint every
// menu and Send button at the wrong list.
test('every setlist act stamps touchedAt, and the file order never moves', () => {
  const { store } = freshStore();
  const a = store.createSetlist('First');
  const b = store.createSetlist('Second');
  const stampOf = (i) => store.readSetlists()[i].touchedAt;

  assert.ok(stampOf(a) && stampOf(b), 'creating stamps both');

  // Backdate first: two stamps taken in the same millisecond are equal, and
  // that is a property of the clock, not of the code being tested.
  const backdate = (i) => {
    const all = store.readSetlists();
    all[i].touchedAt = '2000-01-01T00:00:00.000Z';
    store.writeSetlists(all);
  };

  backdate(a);
  store.assignSlot(a, 0, 'x.sevenlib.json');
  assert.ok(stampOf(a) > '2001', 'assigning re-stamps');
  assert.strictEqual(store.readSetlists()[a].name, 'First', 'still at its own index');

  backdate(b);
  assert.strictEqual(store.touchSetlist(b), true);
  assert.ok(stampOf(b) > '2001', 'opening re-stamps');
  assert.strictEqual(store.touchSetlist(99), false, 'a setlist that is not there');

  assert.deepStrictEqual(
    store.readSetlists().map((s) => s.name), ['First', 'Second'],
    'order in the file is untouched by any of it'
  );
});

test('a backup setlist is stamped when it is written and when it is replaced', () => {
  const { store } = freshStore();
  store.createOrReplaceSetlist('Bank 2 setlist (2026-08-12)', ['a.json']);
  const first = store.readSetlists().find((s) => s.name.startsWith('Bank 2')).touchedAt;
  assert.ok(first, 'a fresh backup record is stamped');
  const all = store.readSetlists();
  all[0].touchedAt = '2000-01-01T00:00:00.000Z';
  store.writeSetlists(all);
  store.createOrReplaceSetlist('Bank 2 setlist (2026-08-12)', ['b.json']);
  const list = store.readSetlists().filter((s) => s.name.startsWith('Bank 2'));
  assert.strictEqual(list.length, 1, 'a same-day re-run replaces rather than stacks');
  assert.ok(list[0].touchedAt > '2001', 're-running the day stamps it again');
  assert.ok(first, 'and it was stamped the first time too');
});

// Changing which SOUND a stored patch names. The name is the patch's portable
// identity — ids differ per instrument — so this is the only safe way to say
// "this patch is a Clavi now".
test('a patch’s sound can be changed without disturbing its parameters', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const entry = store.list().patches[0];
  const before = store.readFile(entry.file).library.patches[entry.patchIndex || 0];
  const params = { ...before.params };

  const r = store.savePatchSound(entry.file, entry.patchIndex || 0, 'Clavi Piano', true);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.previous.name, before.sound.name, 'it reports what it replaced, for undo');

  const after = store.readFile(entry.file).library.patches[entry.patchIndex || 0];
  assert.strictEqual(after.sound.name, 'Clavi Piano');
  assert.strictEqual(after.sound.sampled, true);
  assert.deepStrictEqual(after.params, params, 'settings survive a sound change, as on the device');
  // `verified` is the instrument's word, and the instrument has not spoken
  // since this edit.
  assert.strictEqual(after.verified, before.verified, 'verified is not re-stamped by an app-side edit');
  assert.notStrictEqual(after.captured, undefined);
});

// A copy is a NEW patch, not another capture of the instrument, and the caller
// needs to know where it landed (Daniel, 2026-08-13).
test('duplicate returns where the copy went, and does not claim to be a backup', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  // Give it a patch that IS a backup record, which is the case that mattered:
  // saving edits on one of those always copies now.
  const src = byName(store, 'Alpha');
  const parsed = store.readFile(src.file);
  // As a backup record is actually stored: a bank and preset, no `kind` —
  // that is derived when listing.
  parsed.library.patches[0].origin = { bank: 2, preset: 4 };
  fs.writeFileSync(path.join(store.dir, src.file), JSON.stringify(parsed.library, null, 2));

  const made = store.duplicate(src.file, 0);
  assert.strictEqual(typeof made, 'object', 'returns a location, not a bare filename');
  assert.ok(made.file, 'names the file it wrote');
  assert.strictEqual(made.patchIndex, 0);

  const copy = store.readFile(made.file).library.patches[0];
  assert.ok(copy.origin.created, 'a copy is a patch you made');
  assert.strictEqual(copy.origin.bank, undefined, 'and claims no slot on the instrument');
  assert.deepStrictEqual(copy.origin.copiedFrom, { bank: 2, preset: 4 },
    'but it remembers where it came from');
  // And the LIST must file it away from the bank groups.
  const listed = entries(store).find((e) => e.file === made.file);
  assert.strictEqual(listed.origin.kind, 'created');
});

// Dragging a slot REORDERS: the patch lands where it was dropped and the ones
// it passes close up behind it. It used to swap the two ends and leave the
// middle untouched (Daniel, 2026-08-14).
test('moving a slot inserts it, shifting the ones it passes', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  store.createSetlist('Order');
  const gig = listIndex(store, 'Order');
  const a = byName(store, 'Alpha');
  const b = byName(store, 'Beta');
  const c = byName(store, 'Gamma') || byName(store, 'Beta');
  store.assignSlot(gig, 0, a.file);
  store.assignSlot(gig, 1, b.file);
  store.assignSlot(gig, 2, c.file);

  // Third patch to the front: the two above it move down one, not sideways.
  store.moveSlot(gig, 2, 0);
  let slots = listNamed(store, 'Order').slots;
  assert.deepEqual(slots.slice(0, 3), [c.file, a.file, b.file]);
  assert.strictEqual(slots.length, 8, 'a setlist is always eight slots');

  // And back: the same move in reverse restores every displaced slot, which
  // is what the undo step relies on.
  store.moveSlot(gig, 0, 2);
  slots = listNamed(store, 'Order').slots;
  assert.deepEqual(slots.slice(0, 3), [a.file, b.file, c.file]);
});

test('moving a slot past an empty one carries the empty with it', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  store.createSetlist('Gaps');
  const gig = listIndex(store, 'Gaps');
  const a = byName(store, 'Alpha');
  store.assignSlot(gig, 3, a.file);
  store.moveSlot(gig, 3, 0);
  const slots = listNamed(store, 'Gaps').slots;
  assert.strictEqual(slots[0], a.file, 'it lands where it was dropped');
  assert.strictEqual(slots[1], null, 'the empties it passed follow behind it');
  assert.strictEqual(slots.length, 8);
});

// ---- hand-placed order ------------------------------------------------------
// Both lists sort by recency until a drag; after one, they hold what you set.

test('a patch order is written, read back, and cleared', () => {
  const { store } = freshStore();
  assert.deepEqual(store.readPatchOrder(), [], 'nothing set means sort yourself');
  store.writePatchOrder(['b.json#0', 'a.json#0']);
  assert.deepEqual(store.readPatchOrder(), ['b.json#0', 'a.json#0']);
  assert.deepEqual(store.list().patchOrder, ['b.json#0', 'a.json#0'], 'and it reaches the renderer');
  store.clearPatchOrder();
  assert.deepEqual(store.readPatchOrder(), [], 'cleared is the same state as never set');
});

test('a setlist order rides on the setlists, leaving the file order alone', () => {
  const { store } = freshStore();
  store.createSetlist('First');
  store.createSetlist('Second');
  store.createSetlist('Third');
  const before = store.readSetlists().map((s) => s.name);
  // Display them back to front.
  const i = (name) => store.readSetlists().findIndex((s) => s.name === name);
  store.writeSetlistOrder([i('Third'), i('Second'), i('First')]);
  const after = store.readSetlists();
  assert.deepEqual(after.map((s) => s.name), before,
    'the array is identity everywhere else and must not move');
  const byOrder = [...after].sort((a, b) => a.order - b.order).map((s) => s.name);
  assert.deepEqual(byOrder, ['Third', 'Second', 'First']);
});

test('a setlist made after an order exists carries none, so it floats', () => {
  const { store } = freshStore();
  store.createSetlist('One');
  store.createSetlist('Two');
  const i = (name) => store.readSetlists().findIndex((s) => s.name === name);
  store.writeSetlistOrder([i('Two'), i('One')]);
  store.createSetlist('Fresh');
  const fresh = store.readSetlists().find((s) => s.name === 'Fresh');
  assert.ok(!Number.isFinite(fresh.order), 'no position means it goes to the top of the list');
});

test('clearing the setlist order strips every position', () => {
  const { store } = freshStore();
  store.createSetlist('One');
  store.createSetlist('Two');
  const i = (name) => store.readSetlists().findIndex((s) => s.name === name);
  store.writeSetlistOrder([i('Two'), i('One')]);
  store.clearSetlistOrder();
  assert.ok(store.readSetlists().every((s) => !Number.isFinite(s.order)));
});

// The reader rebuilds each setlist from scratch, so a field it does not name
// is lost on the next read — which is how the first touchedAt disappeared.
test('order survives a read/write round trip', () => {
  const { store } = freshStore();
  store.createSetlist('Keeps');
  store.writeSetlistOrder([store.readSetlists().findIndex((s) => s.name === 'Keeps')]);
  store.touchSetlist(0); // any other mutation rewrites the file
  const s = store.readSetlists().find((x) => x.name === 'Keeps');
  assert.strictEqual(s.order, 0, 'the position is still there after an unrelated write');
});

// ---- Crumar factory captures are not edited in place -----------------------
// A patch whose origin names bank 1 seeds every generated patch of that model
// (createPatchFromSound). Editing one changes what future generated patches
// are built from, silently. The app duplicates first; the store makes it a
// rule rather than a habit (Daniel, 2026-08-14).

const factoryCapture = (store, sound = 'Tine Piano', preset = 1) => store.saveBackupPatch({
  name: `Bank 1 Preset ${preset} — ${sound}`,
  sound: { name: sound, sampled: false },
  params: Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(64, p.max)])),
  origin: { bank: 1, preset, soundId: 0 },
  captured: new Date().toISOString(),
});

test('saving parameters onto a Bank 1 capture is refused', () => {
  const { store } = freshStore();
  const file = factoryCapture(store);
  assert.throws(
    () => store.savePatchParams(file, 0, { rho_atk: 99 }),
    /factory preset in place/,
    'the store refuses'
  );
  assert.strictEqual(store.readFile(file).library.patches[0].params.rho_atk, 64, 'and nothing moved');
});

test('changing the sound of a Bank 1 capture is refused too', () => {
  const { store } = freshStore();
  const file = factoryCapture(store);
  assert.throws(() => store.savePatchSound(file, 0, 'Clavi Piano', false), /factory preset in place/);
  assert.strictEqual(store.readFile(file).library.patches[0].sound.name, 'Tine Piano');
});

// Only the values are protected. A name is not a value, and a file you no
// longer want is yours to remove.
test('renaming and deleting a Bank 1 capture stay allowed', () => {
  const { store, dir } = freshStore();
  const file = factoryCapture(store);
  const renamed = store.rename(file, 0, 'My Rhodes');
  assert.notStrictEqual(renamed, file, 'the rename went through');
  assert.strictEqual(store.readFile(renamed).library.patches[0].name, 'My Rhodes');
  fs.unlinkSync(path.join(dir, renamed)); // delete is shell.trashItem in the app
  assert.ok(!fs.existsSync(path.join(dir, renamed)));
});

// The copy is a patch of your own: freely editable, and no longer a donor.
test('a duplicate of a Bank 1 capture is editable and loses the origin', () => {
  const { store } = freshStore();
  const file = factoryCapture(store);
  const copy = store.duplicate(file, 0);
  const written = store.readFile(copy.file).library.patches[0];
  assert.ok(!('bank' in written.origin), 'the copy does not claim to be a capture');
  assert.ok(written.origin.created, 'it is a patch you made');
  store.savePatchParams(copy.file, 0, { rho_atk: 99 });
  assert.strictEqual(store.readFile(copy.file).library.patches[0].params.rho_atk, 99, 'and it edits');
});

// The guard must not block a backup RUN, which stamps and rewrites Bank 1
// captures by design.
test('a backup run can still stamp a Bank 1 capture as verified', () => {
  const { store } = freshStore();
  const file = factoryCapture(store);
  const when = new Date().toISOString();
  store.touchVerified(file, 0, when);
  assert.strictEqual(store.readFile(file).library.patches[0].verified, when);
});

// The list is ordered by creation, so the stamp has to exist and has to
// survive every later write (Daniel, 2026-08-14).
test('a new setlist records when it was created, and keeps it', async () => {
  const { store } = freshStore();
  store.createSetlist('Gig');
  const i = listIndex(store, 'Gig');
  const made = listNamed(store, 'Gig');
  assert.ok(made.createdAt, 'createdAt is written');
  assert.ok(made.touchedAt, 'touchedAt is still written too');

  const created = made.createdAt;
  // A real pause. Both stamps come from new Date() inside the store, and when
  // the create and the touch land in the SAME millisecond the two strings are
  // equal and this test fails for a reason that has nothing to do with the
  // behaviour it checks. Seen once on 2026-08-14.
  await new Promise((r) => setTimeout(r, 5));
  store.touchSetlist(i);
  store.renameSetlist(i, 'Gig night two');
  assert.strictEqual(listNamed(store, 'Gig night two').createdAt, created,
    'later writes do not move it');
  assert.notStrictEqual(listNamed(store, 'Gig night two').touchedAt, created,
    'while touchedAt does move');
});

// --- whose sound list decides "missing" ------------------------------------

test('a patch is missing when the INSTRUMENT lacks its sound, not when the schema does', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();   // this test needs library content
  const file = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } }).file;
  // A sound this build has never heard of — an expansion the schema predates.
  store.savePatchSound(file, 0, 'Nord Lead Expansion', true);

  // Offline: the schema is all there is, and it does not know that sound.
  const offline = entries(store).find((p) => p.file === file);
  assert.strictEqual(offline.missing, true, 'unknown to this build while nothing is attached');

  // An instrument that HAS it: not missing any more.
  store.setDeviceSounds({ sounds: [{ id: 0, name: 'Nord Lead Expansion', sampled: true }] });
  const attached = entries(store).find((p) => p.file === file);
  assert.strictEqual(attached.missing, false, 'the instrument has it, so it is not missing');
  assert.strictEqual(attached.sampled, true, 'and the instrument says it is sampled');

  // An instrument that LACKS a sound the schema knows: missing, though the
  // schema alone would have said otherwise.
  const tine = entries(store).find((p) => p.soundName === 'Tine Piano');
  assert.strictEqual(tine.missing, true, 'this unit does not have Tine Piano');

  // Unplugged: back to the schema.
  store.setDeviceSounds(null);
  const after = entries(store).find((p) => p.soundName === 'Tine Piano');
  assert.strictEqual(after.missing, false, 'the schema knows Tine Piano');
});

test('a new patch records the instrument it was made on, not the schema', () => {
  const { store } = freshStore();

  // Nothing attached: the schema's list is what the app knows.
  const offline = JSON.parse(fs.readFileSync(path.join(
    store.dir, store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } }).file
  ), 'utf8'));
  assert.strictEqual(offline.source.soundList.length, schema.sounds.length);
  assert.strictEqual(offline.source.firmware, schema.firmware || '1.37');

  // A 16-sound unit on a firmware this build has never seen.
  store.setDeviceSounds({
    sounds: Array.from({ length: 16 }, (_, i) => ({ id: i, name: `Sound ${i}`, sampled: false })),
  });
  store.setDeviceFirmware('CRUMAR Seven v.1.42 Build date: Mon Jan 5 09:00:00 2026');
  const made = store.createPatchFromSound('Sound 3', { factoryDefaults: { sounds: {} } });
  const written = JSON.parse(fs.readFileSync(path.join(store.dir, made.file), 'utf8'));
  assert.strictEqual(written.source.soundList.length, 16, 'the unit’s 16, not the schema’s 24');
  assert.deepStrictEqual(written.source.soundList[3], { id: 3, name: 'Sound 3' });
  assert.strictEqual(written.source.firmware, 'CRUMAR Seven v.1.42 Build date: Mon Jan 5 09:00:00 2026');

  // Unplugged again: back to what the app knows, with nothing claiming a device.
  store.setDeviceSounds(null);
  store.setDeviceFirmware(null);
  const after = JSON.parse(fs.readFileSync(path.join(
    store.dir, store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } }).file
  ), 'utf8'));
  assert.strictEqual(after.source.soundList.length, schema.sounds.length);
});

// ---- Interrupted writes ---------------------------------------------------
//
// Every write in the store goes through writeAtomic: temp file, fsync, rename.
// The reason is setlists.json, which holds EVERY setlist in one file — a plain
// writeFileSync truncates before it writes, so an app killed mid-write left
// zero setlists where there had been one, silently (measured 2026-08-17).

test('a write that fails part-way leaves the previous file intact', () => {
  const { dir, store } = freshStore();
  store.createSetlist('Keeper');
  const before = fs.readFileSync(path.join(dir, 'setlists.json'), 'utf8');

  // Fail the write at the moment the bytes are going down — after the target
  // would have been truncated by the old implementation.
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = (target, data) => {
    if (typeof target === 'number') throw new Error('disk full');   // the temp fd
    return realWrite(target, data);
  };
  let threw = false;
  try { store.createSetlist('Doomed'); } catch { threw = true; } finally {
    fs.writeFileSync = realWrite;
  }

  assert.ok(threw, 'the failure surfaced rather than being swallowed');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'setlists.json'), 'utf8'), before,
    'the old setlists.json is byte-for-byte what it was');
  assert.deepStrictEqual(store.readSetlists().map((s) => s.name), ['Keeper'],
    'and it still reads');
});

test('no temp files are left behind, on success or on failure', () => {
  const { dir, store } = freshStore();
  store.createSetlist('One');
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = (target, data) => {
    if (typeof target === 'number') throw new Error('disk full');
    return realWrite(target, data);
  };
  try { store.createSetlist('Two'); } catch { /* expected */ } finally {
    fs.writeFileSync = realWrite;
  }
  const strays = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
  assert.deepStrictEqual(strays, [], 'the temp file was cleaned up');
});
