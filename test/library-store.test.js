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

// THE RULE IS SYMMETRIC, and it was only half-applied. namedPatches leaves
// backup records out of the set being SEARCHED — a record can carry a borrowed
// name identical to the patch it was named after — but rename() ran the check
// no matter WHAT was being renamed, so renaming a record onto a patch's name
// was refused. Every row in the bank view is a record, so that refusal was
// reachable there and nowhere else (found 2026-08-18).
test('records and patches are separate namespaces, in both directions', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const patch = byName(store, 'Alpha');

  // Turn Beta into a capture of Bank 2 Preset 4, which is how list() reads a
  // record: a bank number in the origin, never a stored `kind`.
  const beta = byName(store, 'Beta');
  const parsed = store.readFile(beta.file);
  parsed.library.patches[beta.patchIndex].origin = { bank: 2, preset: 4 };
  fs.writeFileSync(path.join(store.dir, beta.file), JSON.stringify(parsed.library, null, 2));
  const record = entries(store).find((e) => e.file === beta.file);
  assert.strictEqual(record.origin.kind, 'backup', 'the fixture really is a record');

  // A RECORD may take a name one of your patches holds.
  store.rename(record.file, record.patchIndex, 'Alpha');
  const both = entries(store).filter((e) => e.name === 'Alpha');
  assert.strictEqual(both.length, 2, 'the record and the patch both answer to Alpha');
  assert.strictEqual(both.filter((e) => e.origin.kind === 'backup').length, 1);
  assert.strictEqual(both.filter((e) => e.origin.kind !== 'backup').length, 1);

  // And a PATCH may take a name a record holds — the half that already worked.
  // rename returns the file it ended up in: renaming moves single-patch files.
  const moved = store.rename(patch.file, patch.patchIndex, 'Bank 2 Preset 4');
  const again = entries(store).find((e) => e.file === moved);
  assert.strictEqual(again.name, 'Bank 2 Preset 4');
});

// NAMES ARE COMPARED THROUGH ONE NORMALISED KEY: NFC, trimmed, internal
// whitespace collapsed, case-folded. Each of these four is a pair of tiles that
// look alike on screen, which is the whole point of the rule.
//
// The stored name is never touched — what the user typed is what the library
// shows. Only the comparison folds.
test('names that look alike collide, whatever their case, spacing or unicode form', () => {
  const cases = [
    ['case', 'alpha'],
    ['case', 'ALPHA'],
    ['trailing space', 'Alpha '],
    ['leading space', ' Alpha'],
    ['both ends', '   Alpha   '],
    ['doubled internal space', 'Al  pha'],   // against a stored "Al pha"
    // Contains an I, which is where locale-sensitive folding diverges: under
    // Turkish rules "I" lowercases to a DOTLESS i and this pair would stop
    // colliding. The rule must answer the same on every machine.
    ['dotted I', 'ALPHA I'],
  ];
  for (const [what, typed] of cases) {
    const { store } = freshStore();
    store.seedDemoLibrary();
    if (what === 'doubled internal space') {
      const a = byName(store, 'Alpha');
      store.rename(a.file, a.patchIndex, 'Al pha');
    }
    if (what === 'dotted I') {
      const a = byName(store, 'Alpha');
      store.rename(a.file, a.patchIndex, 'Alpha i');
    }
    const beta = byName(store, 'Beta');
    assert.throws(
      () => store.duplicate(beta.file, beta.patchIndex, typed),
      (err) => err.code === 'NAME_TAKEN',
      `${what}: “${typed}” should collide`
    );
  }
});

// THE ONE THAT SETTLED THE DESIGN. These two strings are different byte
// sequences that render as identical pixels, so allowing one and refusing the
// other could never be explained to anybody.
test('NFC and NFD spellings of one name collide', () => {
  const NFC = 'Caf\u00e9';        // é as a single code point
  const NFD = 'Cafe\u0301';       // e + combining acute
  assert.notStrictEqual(NFC, NFD, 'the fixture really is two different strings');

  const { store } = freshStore();
  store.seedDemoLibrary();
  const a = byName(store, 'Alpha');
  store.rename(a.file, a.patchIndex, NFC);
  const beta = byName(store, 'Beta');

  assert.throws(
    () => store.duplicate(beta.file, beta.patchIndex, NFD),
    (err) => err.code === 'NAME_TAKEN'
  );
  // And the STORED name is the one that was typed, byte for byte — the key is
  // for comparing, never for writing.
  assert.strictEqual(entries(store).find((e) => /^Caf/.test(e.name)).name, NFC);
});

// Recasing your OWN patch has to keep working, or the rule reads as broken.
// It does, because the check excludes the patch being renamed.
test('renaming a patch to a differently-cased version of its own name is allowed', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const a = byName(store, 'Alpha');
  const moved = store.rename(a.file, a.patchIndex, 'ALPHA');
  assert.strictEqual(entries(store).find((e) => e.file === moved).name, 'ALPHA');
  // …and again, with spacing rather than case.
  const again = store.rename(moved, 0, ' ALPHA ');
  assert.strictEqual(entries(store).find((e) => e.file === again).name, ' ALPHA ',
    'stored exactly as typed');
});

// The message has to name the patch that EXISTS. Type "alpha" while "Alpha" is
// taken and a message quoting "alpha" reads as the app being broken.
test('the refusal quotes the existing name, not the one that was typed', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const beta = byName(store, 'Beta');
  assert.throws(
    () => store.duplicate(beta.file, beta.patchIndex, 'ALPHA'),
    (err) => /already a patch called “Alpha”/.test(err.message)
      && !/ALPHA/.test(err.message)
  );
});

// uniqueName and nextPatchName go through the SAME key, or they offer a name
// the write would then refuse — which is the drift this project has been bitten
// by twice.
test('generated names use the same comparison as the refusal', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const a = byName(store, 'Alpha');

  // A copy exists under a different CASE: the next copy must move past it.
  const first = store.duplicate(a.file, a.patchIndex);          // "Alpha copy"
  store.rename(first.file, 0, 'alpha COPY');
  const second = store.duplicate(a.file, a.patchIndex);
  assert.strictEqual(
    store.readFile(second.file).library.patches[0].name, 'Alpha copy 2',
    'uniqueName must see "alpha COPY" as taking "Alpha copy"'
  );

  // Same for the name offered to a new patch from a sound.
  const b = byName(store, 'Beta');
  store.rename(b.file, b.patchIndex, 'tine  piano');
  assert.strictEqual(store.nextPatchName('Tine Piano'), 'Tine Piano 2');
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

// The other half of the rule: rename is not the only path that sets a name.
// Duplicating out of a backup opens the name prompt, so a person can type a
// name that is already somebody's — and a copy that lands on a taken name is
// the same two-identical-tiles bug arriving by a different door.
test('duplicating onto a typed name another patch already has is refused', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const alphaFile = byName(store, 'Alpha').file;
  const beta = byName(store, 'Beta');

  assert.throws(
    () => store.duplicate(beta.file, beta.patchIndex, 'Alpha'),
    (err) => err.code === 'NAME_TAKEN' && /already a patch called/.test(err.message)
  );

  // The refusal happens BEFORE anything is written: no orphan copy on disk.
  assert.deepStrictEqual(entries(store).map((e) => e.name).sort(), ['Alpha', 'Beta']);
  assert.ok(fs.existsSync(path.join(store.dir, alphaFile)), 'Alpha untouched');
  assert.strictEqual(
    fs.readdirSync(store.dir).filter((f) => f.endsWith('.sevenlib.json')).length, 2,
    'no third patch file was written'
  );
});

// THE BUG DANIEL HIT. Duplicate with no typed name used to land on
// "<name> copy" every single time, so doing it twice produced two patches
// called "Alpha copy" — identical tiles, which is the whole thing this rule
// exists to prevent. A generated name is never refused; it moves up instead.
test('duplicating the same patch repeatedly numbers the copies', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const alpha = byName(store, 'Alpha');

  const made = [
    store.duplicate(alpha.file, alpha.patchIndex),
    store.duplicate(alpha.file, alpha.patchIndex),
    store.duplicate(alpha.file, alpha.patchIndex),
  ];

  const names = made.map((m) => store.readFile(m.file).library.patches[m.patchIndex].name);
  assert.deepStrictEqual(names, ['Alpha copy', 'Alpha copy 2', 'Alpha copy 3']);
  // And they are three separate files, each listed under its own name.
  assert.strictEqual(new Set(made.map((m) => m.file)).size, 3, 'three files');
  assert.deepStrictEqual(
    entries(store).map((e) => e.name).sort(),
    ['Alpha', 'Alpha copy', 'Alpha copy 2', 'Alpha copy 3', 'Beta']
  );
});

// THE NAMESPACE IS YOUR PATCHES, NOT THE FOLDER. A backup record can carry a
// borrowed name identical to the patch it was named after, so counting records
// would make the first copy taken from a backup arrive as "Alpha copy 2" —
// numbered around a name nothing of yours is using.
test('a backup record sharing the name does not push the copy number up', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  const alpha = byName(store, 'Alpha');

  // Make a real backup record called "Alpha copy": duplicate once, then give
  // that file a slot on the instrument, which is what list() reads as a
  // capture (kind is derived from the bank number, never stored).
  const record = store.duplicate(alpha.file, alpha.patchIndex);
  const parsed = store.readFile(record.file);
  parsed.library.patches[record.patchIndex].origin = { bank: 2, preset: 4 };
  fs.writeFileSync(
    path.join(store.dir, record.file), JSON.stringify(parsed.library, null, 2)
  );
  assert.strictEqual(
    entries(store).find((e) => e.file === record.file).origin.kind, 'backup',
    'the fixture really is a backup record'
  );

  // The next copy takes the name back, because no PATCH of yours holds it.
  const made = store.duplicate(alpha.file, alpha.patchIndex);
  const name = store.readFile(made.file).library.patches[made.patchIndex].name;
  assert.strictEqual(name, 'Alpha copy');
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
  // Extended 2026-08-21: every copy now records the FILE it came from, not
  // only the slot. Copies of ordinary patches recorded nothing at all, so
  // nothing linked a copy back to the file still holding the truth.
  assert.strictEqual(copy.origin.copiedFrom.bank, 2);
  assert.strictEqual(copy.origin.copiedFrom.preset, 4);
  assert.strictEqual(copy.origin.copiedFrom.file, src.file,
    'and which file, so a bad copy can be traced to its original');
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

// ---- Provenance is a RECORD, not a snapshot of right now -------------------
//
// These three pin the rule in CLAUDE.md: current state must not stand in for
// recorded fact. Each one FAILED before the fix that made it pass, and the
// failure was a file on disk carrying a claim nobody could later distinguish
// from truth.

test('a copy inherits the provenance of the patch it came from', () => {
  const { store } = freshStore();
  // Made on a 27-sound unit running a firmware this build has never seen.
  const unit = [...schema.sounds.map((x, i) => ({ id: i, name: x.name })),
    { id: 24, name: 'Venice Grand CFX' }, { id: 25, name: 'Venice Grand C5' },
    { id: 26, name: 'Venice Upright K8' }];
  store.setDeviceSounds({ sounds: unit });
  store.setDeviceFirmware('CRUMAR Seven v.1.42');
  const made = store.createPatchFromSound('Venice Grand CFX', { factoryDefaults: { sounds: {} } });

  // Unplugged, then copied — the ordinary case for somebody organising their
  // library away from the instrument.
  store.setDeviceSounds(null);
  store.setDeviceFirmware(null);
  const dup = store.duplicate(made.file, 0);

  const src = store.readFile(dup.file).library.source;
  assert.strictEqual(src.soundList.length, 27,
    'the copy still says it came from the 27-sound unit');
  assert.strictEqual(src.firmware, 'CRUMAR Seven v.1.42');
  assert.ok(src.soundList.some((x) => x.name === 'Venice Grand CFX'),
    'AND ITS OWN SOUND IS IN ITS OWN LIST — the copy used to claim it came ' +
    'from an instrument that never had the sound the patch is made of');
});

test('a patch made with nothing attached records that there was no instrument', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  const src = store.readFile(made.file).library.source;
  // NOT the schema's 24 sounds and NOT firmware "1.37". There was no
  // instrument; the schema is what this BUILD knows, and writing it here is a
  // phantom unit recorded permanently in somebody's file.
  assert.strictEqual(src.soundList, null, 'no sound list, because no instrument');
  assert.strictEqual(src.firmware, null, 'and no firmware, for the same reason');
  assert.strictEqual(src.schema, 'seven-1.37.json',
    'the SCHEMA is still named — that is a fact about this build and is true');
});

test('every copy records where it came from, not only copies of backups', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  const dup = store.duplicate(made.file, 0);
  const copy = store.readFile(dup.file).library.patches[0];
  assert.ok(copy.origin.copiedFrom, 'a copy of an ordinary patch is traceable too');
  assert.strictEqual(copy.origin.copiedFrom.file, made.file);
  assert.strictEqual(copy.origin.copiedFrom.patchIndex, 0);
});

test('a copy was created WHEN IT WAS COPIED, not when the original was made', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });

  // Age the original, the way any real library does.
  const file = path.join(store.dir, made.file);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old = new Date(Date.now() - 40 * 864e5).toISOString();
  doc.patches[0].origin.created = old;
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));

  const dup = store.duplicate(made.file, 0);
  const copy = store.readFile(dup.file).library.patches[0];
  assert.notStrictEqual(copy.origin.created, old,
    'a copy made today does not claim to be 40 days old');
  const age = Date.now() - new Date(copy.origin.created).getTime();
  assert.ok(age >= 0 && age < 60000, `the copy was created just now (${age}ms ago)`);

  // The row's date follows, since that is what "Created 5 days ago" reads.
  const listed = entries(store).find((e) => e.file === dup.file);
  assert.ok(Date.now() - new Date(listed.origin.date).getTime() < 60000,
    'and the list agrees, which is what the user actually sees');
});

test('a patch file records the version that actually wrote it', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  const src = store.readFile(made.file).library.source;

  // NOT a literal. Asserting `=== 'crumar-seven-editor 1.4.0'` would pass today
  // and rot at 1.4.1 — the exact failure class CLAUDE.md names, and how the
  // original froze at 0.0.0 for five releases. This asserts the tag tracks
  // whatever the single source says, whatever that value is.
  const version = require('../package.json').version;
  assert.strictEqual(src.app, `crumar-seven-editor ${version}`);
  assert.ok(!/0\.0\.0/.test(src.app), 'and is not the frozen literal it used to be');

  // Injection wins over the default, which is what main.js relies on.
  const other = new LibraryStore(freshStore().dir, schema, fixture, { appVersion: '9.9.9-test' });
  const mine = other.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  assert.strictEqual(other.readFile(mine.file).library.source.app,
    'crumar-seven-editor 9.9.9-test');
});

test('main.js actually injects the version, rather than leaning on the default', () => {
  // A STATIC SOURCE CHECK, and it is here for a specific reason: the default
  // and the injection resolve to the same package.json, so the test above
  // passes just as happily if main.js quietly stops passing appVersion — and
  // then a packaged app writing a version different from the repo's
  // package.json would go unnoticed. This asserts the wiring, not the value.
  //
  // main.js cannot be require()d here: it pulls in Electron. Same approach as
  // test/css-hazards.test.js.
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const call = /new LibraryStore\(([\s\S]*?)\n\s*\);/.exec(main);
  assert.ok(call, 'main.js constructs a LibraryStore');
  assert.match(call[1], /appVersion:\s*app\.getVersion\(\)/,
    'and passes the RUNNING app’s version into it');
});

test('save-as-new writes the LIVE values, not the source file\'s', () => {
  // THE TRAP THIS EXISTS FOR. The naive implementation copies the source file
  // and the edits the button was pressed to preserve are silently discarded —
  // the user watches a patch appear and it is the one they started from.
  const { store } = freshStore();
  const src = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  const original = store.readFile(src.file).library.patches[0];
  const key = Object.keys(original.params)[0];
  const edited = { ...original.params, [key]: (Number(original.params[key]) + 7) };

  const made = store.createPatchFromLive({
    name: 'Tine Piano 2', soundName: 'Tine Piano', params: edited,
  });
  const saved = store.readFile(made.file).library.patches[0];
  assert.strictEqual(Number(saved.params[key]), Number(original.params[key]) + 7,
    'the edited value is what landed on disk');
  assert.notStrictEqual(Number(saved.params[key]), Number(original.params[key]),
    'and it is NOT the source file\'s value');
  // The source is untouched: saving as new never writes back.
  assert.strictEqual(
    Number(store.readFile(src.file).library.patches[0].params[key]),
    Number(original.params[key]), 'the patch it came from is unchanged');
});

test('save-as-new is a NEW patch, with new-patch provenance', () => {
  const { store } = freshStore();
  const unit = [...schema.sounds.map((x, i) => ({ id: i, name: x.name })),
    { id: 24, name: 'Venice Grand CFX' }];
  store.setDeviceSounds({ sounds: unit });
  store.setDeviceFirmware('CRUMAR Seven v.1.42');

  const made = store.createPatchFromLive({
    name: 'From the buffer', soundName: 'Venice Grand CFX', params: { rho_atk: 40 },
  });
  const doc = store.readFile(made.file).library;
  // Instrument facts recorded the way ANY new patch records them — from what
  // is connected NOW, not inherited from whatever it was edited on top of.
  assert.strictEqual(doc.source.soundList.length, 25);
  assert.strictEqual(doc.source.firmware, 'CRUMAR Seven v.1.42');
  const age = Date.now() - new Date(doc.patches[0].origin.created).getTime();
  assert.ok(age >= 0 && age < 60000, 'created now');
  assert.strictEqual(doc.patches[0].origin.bank, undefined, 'it claims no slot');
});

test('save-as-new offline claims nothing about an instrument', () => {
  const { store } = freshStore();
  const made = store.createPatchFromLive({
    name: 'Made offline', soundName: 'Tine Piano', params: { rho_atk: 40 },
  });
  const src = store.readFile(made.file).library.source;
  assert.strictEqual(src.soundList, null);
  assert.strictEqual(src.firmware, null);
});

test('save-as-new refuses a name already taken', () => {
  const { store } = freshStore();
  store.createPatchFromLive({ name: 'Taken', soundName: 'Tine Piano', params: {} });
  assert.throws(
    () => store.createPatchFromLive({ name: 'taken', soundName: 'Tine Piano', params: {} }),
    /already a patch called/i,
    'and case-folds, like every other name check');
});

// ---- One name rule, and what counts as taken ------------------------------
//
// A patch name is unique among PATCHES. Backup records and the instrument's
// own 32 slots are outside that namespace — they are records of what the Seven
// held, where repeated names are normal (three "DX Synth Piano" in one bank is
// an ordinary thing to own). If those counted, nearly every name would read as
// unavailable.
//
// Both doors enforce it through the SAME function: inline rename, and the
// naming modal's live check (library:nameAvailable calls assertNameFree and
// returns its message verbatim).

test('rename and the naming modal refuse on the same sentence, from one place', () => {
  const { store } = freshStore();
  store.createPatchFromLive({ name: 'Wurly w/ overdrive', soundName: 'Tine Piano', params: {} });
  const other = store.createPatchFromLive({ name: 'Something else', soundName: 'Tine Piano', params: {} });

  let renameErr = null;
  try { store.rename(other.file, 0, 'Wurly w/ overdrive'); } catch (e) { renameErr = e; }
  let checkErr = null;
  try { store.assertNameFree('Wurly w/ overdrive'); } catch (e) { checkErr = e; }

  assert.ok(renameErr && checkErr, 'both refuse');
  assert.strictEqual(renameErr.code, 'NAME_TAKEN');
  assert.strictEqual(checkErr.code, 'NAME_TAKEN');
  assert.strictEqual(renameErr.message, checkErr.message,
    'and say the same thing — the modal shows the store\'s sentence, not a copy');
  assert.match(checkErr.message, /already a patch called .Wurly w\/ overdrive./);
});

test('the message names the EXISTING patch, whatever case was typed', () => {
  const { store } = freshStore();
  store.createPatchFromLive({ name: 'Tine Piano', soundName: 'Tine Piano', params: {} });
  try {
    store.assertNameFree('tine piano');
    assert.fail('should have refused');
  } catch (e) {
    assert.match(e.message, /“Tine Piano”/,
      'quoting what you typed would read as the app being broken');
  }
});

test('the prefill suggests "<name> 2" once a PATCH holds the bare name', () => {
  const { store } = freshStore();
  assert.strictEqual(store.nextPatchName('Tine Piano'), 'Tine Piano',
    'free: the bare name');
  store.createPatchFromLive({ name: 'Tine Piano', soundName: 'Tine Piano', params: {} });
  assert.strictEqual(store.nextPatchName('Tine Piano'), 'Tine Piano 2');
  store.createPatchFromLive({ name: 'Tine Piano 2', soundName: 'Tine Piano', params: {} });
  assert.strictEqual(store.nextPatchName('Tine Piano'), 'Tine Piano 3');
});

test('A NAME HELD ONLY BY A BACKUP IS FREE — records are not the namespace', () => {
  const { store } = freshStore();
  store.seedDemoLibrary();
  // A record of Bank 3 Preset 1, stored under the auto-generated slot name and
  // DISPLAYED as "Tine Piano" once the prefix is stripped. Six of these exist
  // in the real library, which is what made this look like a collision.
  store.saveBackupPatch
    ? null
    : null;
  const rec = {
    name: 'Bank 3 Preset 1 — Tine Piano',
    origin: { bank: 3, preset: 1, captured: '2026-08-19T10:00:00Z' },
    sound: { name: 'Tine Piano', id: 0 },
    params: {},
  };
  fs.writeFileSync(path.join(store.dir, 'rec-tine.sevenlib.json'),
    JSON.stringify({
      format: 'crumar-seven-library', formatVersion: 1,
      created: '2026-08-19T10:00:00Z',
      source: { app: 't', firmware: null, schema: 'seven-1.37.json', soundList: null },
      patches: [rec],
    }, null, 2));

  assert.strictEqual(store.nextPatchName('Tine Piano'), 'Tine Piano',
    'the record does not make the name taken');
  assert.doesNotThrow(() => store.assertNameFree('Tine Piano'),
    'and saving under it is allowed');
});

test('a new patch records the instrument it was made on, not the schema', () => {
  const { store } = freshStore();

  // NOTHING ATTACHED: nothing is claimed.
  //
  // INVERTED 2026-08-21. This used to assert that an offline patch records the
  // schema's 24 sounds and firmware "1.37" — a test pinning the bug, stated as
  // an intention, and it would have fought the fix. `source` says which
  // INSTRUMENT a patch came from; offline there was none, and the schema is
  // what this build knows, not a unit anybody owns. On an owner with
  // expansions the old claim was flatly false: their Seven has 27 sounds.
  const offline = JSON.parse(fs.readFileSync(path.join(
    store.dir, store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } }).file
  ), 'utf8'));
  assert.strictEqual(offline.source.soundList, null, 'no instrument, so no sound list');
  assert.strictEqual(offline.source.firmware, null, 'and no firmware');

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

  // Unplugged again: back to claiming nothing, and NOT back to the schema.
  store.setDeviceSounds(null);
  store.setDeviceFirmware(null);
  const after = JSON.parse(fs.readFileSync(path.join(
    store.dir, store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } }).file
  ), 'utf8'));
  assert.strictEqual(after.source.soundList, null,
    'the 16-sound unit is gone and no phantom takes its place');
  assert.strictEqual(after.source.schema, 'seven-1.37.json',
    'what this BUILD knows is still recorded — that part is true offline');
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

// The setlist reader REBUILDS each entry from a named list of fields, so a new
// field that nobody adds to that list is silently dropped on the next write.
// That is how touchedAt was lost once already.
test('a setlist’s bank survives a save and reload', () => {
  const { store } = freshStore();
  store.createSetlist('Long Winters');
  const i = listIndex(store, 'Long Winters');

  assert.strictEqual(store.readSetlists()[i].bank, undefined, 'a new setlist has no bank');
  assert.strictEqual(store.setSetlistBank(i, 3), true);
  assert.strictEqual(store.readSetlists()[i].bank, 3);

  // The round trip that matters: any OTHER write re-serialises every setlist
  // through the normaliser, which is where an unlisted field disappears.
  store.touchSetlist(i);
  store.createSetlist('Something Else');
  assert.strictEqual(listNamed(store, 'Long Winters').bank, 3, 'the bank is still there');

  // Last successful send wins.
  assert.strictEqual(store.setSetlistBank(i, 2), true);
  assert.strictEqual(listNamed(store, 'Long Winters').bank, 2);

  // Bank 1 cannot be stored to, and there is no bank 5.
  assert.strictEqual(store.setSetlistBank(i, 5), false);
  assert.strictEqual(store.setSetlistBank(i, '3'), false);
  assert.strictEqual(listNamed(store, 'Long Winters').bank, 2, 'a refused write changes nothing');
});
