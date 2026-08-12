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

test('slots hold a sound reference as well as a file', () => {
  const { store } = freshStore();
  store.createSetlist('Gig');
  const gig = listIndex(store, 'Gig');
  store.assignSlot(gig, 0, 'sound:Tine Piano');
  assert.strictEqual(listNamed(store, 'Gig').slots[0], 'sound:Tine Piano');
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
