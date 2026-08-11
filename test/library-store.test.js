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
