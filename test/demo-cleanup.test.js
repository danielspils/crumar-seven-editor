'use strict';

// Removing the demo patches 1.0 shipped by mistake — and, more importantly,
// NOT removing anything else. Every test here is a way the cleanup could take
// something that belongs to the user, which is the only failure mode that
// matters: the patches themselves were never theirs, but a patch they touched
// is theirs from that moment on.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { LibraryStore } = require('../src/library-store');
const cleanup = require('../src/demo-cleanup');
const schema = require('../schema/seven-1.37.json');
const fixture = require('../fixtures/sample-library.json');

function seeded() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-cleanup-'));
  const dir = path.join(root, 'Library');
  const store = new LibraryStore(dir, schema, fixture);
  store.seedDemoLibrary();               // the library a 1.0.0 user already has
  const trashed = [];
  const trash = async (abs) => { trashed.push(path.basename(abs)); fs.unlinkSync(abs); };
  return { root, dir, store, trashed, trash };
}

const run = (ctx, opts = {}) =>
  cleanup.run({ store: ctx.store, fixture, userDataDir: ctx.root, trash: ctx.trash, ...opts });

test('an untouched demo library is removed, and says how many', async () => {
  const ctx = seeded();
  const before = ctx.store.list().patches.length;
  const result = await run(ctx);
  assert.strictEqual(before, 32, 'the library 1.0 shipped');
  assert.strictEqual(result.removed, 32);
  assert.strictEqual(ctx.store.list().patches.length, 0, 'nothing left behind');
  assert.ok(result.setlistRemoved, 'and the demo setlist goes with them');
});

// THE CONSTRAINT. Edited, renamed or duplicated means it is theirs.
test('a demo patch the user edited survives', async () => {
  const ctx = seeded();
  const victim = ctx.store.list().patches[0];
  ctx.store.savePatchParams(victim.file, victim.patchIndex, { rho_atk: 3 });

  const result = await run(ctx);
  assert.strictEqual(result.removed, 31, 'the other 31 go');
  assert.strictEqual(result.keptEdited, 1);
  const left = ctx.store.list().patches;
  assert.strictEqual(left.length, 1);
  assert.strictEqual(left[0].file, victim.file, 'and it is the edited one that stayed');
});

test('a demo patch the user renamed survives', async () => {
  const ctx = seeded();
  const victim = ctx.store.list().patches.find((e) => e.name === 'Berlin Grand');
  ctx.store.rename(victim.file, victim.patchIndex, 'My Berlin');

  const result = await run(ctx);
  assert.strictEqual(result.keptEdited, 1);
  const names = ctx.store.list().patches.map((e) => e.name);
  assert.deepStrictEqual(names, ['My Berlin']);
});

test('a demo patch the user put in their own setlist survives', async () => {
  const ctx = seeded();
  const keeper = ctx.store.list().patches[5];
  const mine = ctx.store.createSetlist('My Gig');
  ctx.store.assignSlot(mine, 0, keeper.file);

  const result = await run(ctx);
  assert.strictEqual(result.keptInSetlist, 1);
  assert.ok(ctx.store.list().patches.some((e) => e.file === keeper.file),
    'removing it would have left a hole in something they built');
  const gig = ctx.store.readSetlists().find((s) => s.name === 'My Gig');
  assert.strictEqual(gig.slots[0], keeper.file, 'and their slot still points at it');
});

test('a patch of the user’s own is never touched', async () => {
  const ctx = seeded();
  const made = ctx.store.createPatchFromSound('Tine Piano', { patchName: 'Mine' });
  const result = await run(ctx);
  assert.ok(ctx.store.list().patches.some((e) => e.name === 'Mine'), 'still there');
  assert.strictEqual(result.removed, 32, 'and the 32 demos still went');
  assert.ok(made, 'sanity: the patch was created');
});

test('it runs once, ever', async () => {
  const ctx = seeded();
  const first = await run(ctx);
  assert.strictEqual(first.removed, 32);

  // Seed again, as if the folder were repopulated, and confirm the marker holds.
  ctx.store.seedDemoLibrary();
  const second = await run(ctx);
  assert.strictEqual(second.ran, false, 'the marker stops a second pass');
  assert.strictEqual(second.removed, 0);
  assert.strictEqual(ctx.store.list().patches.length, 32, 'and nothing was touched');
});

test('files go to the trash, not to oblivion', async () => {
  const ctx = seeded();
  await run(ctx);
  assert.strictEqual(ctx.trashed.length, 32, 'every removal went through trash()');
  assert.ok(ctx.trashed.every((f) => f.endsWith('.sevenlib.json')));
});

test('a library it cannot read is left completely alone', async () => {
  const ctx = seeded();
  const broken = { ...ctx.store, list: () => { throw new Error('unreadable'); } };
  const result = await cleanup.run({
    store: broken, fixture, userDataDir: ctx.root, trash: ctx.trash,
  });
  assert.strictEqual(result.ran, false);
  assert.strictEqual(ctx.trashed.length, 0, 'nothing removed');
  assert.strictEqual(ctx.store.list().patches.length, 32, 'library intact');
});
