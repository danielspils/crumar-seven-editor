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

test('seeds a first-run library from the fixture', () => {
  const { store } = freshStore();
  const all = entries(store);
  assert.strictEqual(all.length, 2);
  assert.ok(byName(store, 'Alpha'), 'Alpha is there');
  // Seeded patches must claim "created", never fall back to it.
  assert.strictEqual(byName(store, 'Alpha').origin.kind, 'created');
});

test('rename moves the file and the entry follows', () => {
  const { store, dir } = freshStore();
  const before = byName(store, 'Alpha');
  const target = store.rename(before.file, before.patchIndex, 'Rhodes Mk1');
  assert.notStrictEqual(target, before.file, 'the file is renamed too');
  assert.ok(fs.existsSync(path.join(dir, target)));
  assert.ok(!fs.existsSync(path.join(dir, before.file)), 'the old file is gone');
  assert.strictEqual(byName(store, 'Rhodes Mk1').file, target);
});

test('renaming onto an existing filename does not overwrite it', () => {
  const { store } = freshStore();
  const originalAlphaFile = byName(store, 'Alpha').file;
  const beta = byName(store, 'Beta');
  const target = store.rename(beta.file, beta.patchIndex, 'Alpha'); // collides
  assert.notStrictEqual(target, originalAlphaFile, 'it takes a different filename');
  assert.ok(fs.existsSync(path.join(store.dir, originalAlphaFile)), 'the original file survives');
  // Both patches survive, and both are still readable.
  const names = entries(store).map((e) => e.name).sort();
  assert.deepStrictEqual(names, ['Alpha', 'Alpha']);
  assert.strictEqual(entries(store).filter((e) => e.invalid).length, 0);
});

test('setlist slots follow a renamed file', () => {
  const { store } = freshStore();
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

// The effects it comes with, from Bank 1 of the player's own instrument —
// evidence, not invented defaults.
test('an instrument patch carries its factory effects', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', {
    factoryDefaults: { sounds: { 'Tine Piano': { rev_sw: 1, rev_lvl: 44, fx1_sw: 0 } } },
  });
  assert.deepEqual(made.params, { rev_sw: 1, rev_lvl: 44, fx1_sw: 0 });
});

// No evidence, no guess: a sound Bank 1 never held gets the chain OFF rather
// than numbers borrowed from a different instrument.
test('an instrument with no factory evidence gets a silent chain', () => {
  const { store } = freshStore();
  const made = store.createPatchFromSound('Tine Piano', { factoryDefaults: { sounds: {} } });
  assert.deepEqual(made.params, { fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0 });
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
  const alpha = byName(store, 'Alpha');
  store.savePatchParams(alpha.file, alpha.patchIndex, { rho_atk: 12, not_a_key: 5 });
  const after = byName(store, 'Alpha');
  assert.strictEqual(after.params.rho_atk, 12);
  assert.ok(!('not_a_key' in after.params), 'a key the schema does not know is refused');
  assert.ok(after.origin.date, 'the entry reports a date');
});

test('verified is preferred over captured for the displayed date', () => {
  const { store, dir } = freshStore();
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
