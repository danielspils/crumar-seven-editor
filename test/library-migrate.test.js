'use strict';

// THE HIGHEST-CONSEQUENCE UNTESTED FUNCTION IN THE REPO, until now.
//
// `migrateLegacyLibrary` carries an owner's whole library across the folder
// rename 1.0.0 made necessary. It is a DATA MIGRATION: it runs once, it runs
// on a real library, and a mistake is discovered after it has already
// happened. It was verified by hand exactly once — 62 files across, original
// untouched — and guarded by nothing for three months. The failure mode is
// somebody's patches.
//
// AGAINST A REAL TEMPORARY DIRECTORY, not a fake fs. What is most worth
// asserting is what `cpSync` actually does, and a fake that cannot move a
// file cannot express the bug where this moves one — the shape CLAUDE.md
// calls "a fixture that cannot express the thing under test".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { migrateLegacyLibrary, LEGACY_APP_DIR } = require('../src/library-migrate.js');

// A pair of app-support folders side by side, the way the real ones sit:
//   <root>/Crumar Seven Editor/Library        the old one
//   <root>/This Seven Goes to Eleven/Library  the new one
function makeWorld({ legacyFiles = null, destFiles = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-migrate-'));
  const userDataDir = path.join(root, 'This Seven Goes to Eleven');
  fs.mkdirSync(userDataDir, { recursive: true });
  const legacyLib = path.join(root, LEGACY_APP_DIR, 'Library');
  const destLib = path.join(userDataDir, 'Library');

  if (legacyFiles) {
    fs.mkdirSync(legacyLib, { recursive: true });
    for (const [name, body] of Object.entries(legacyFiles)) {
      const abs = path.join(legacyLib, name);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
  }
  if (destFiles) {
    fs.mkdirSync(destLib, { recursive: true });
    for (const [name, body] of Object.entries(destFiles)) {
      fs.writeFileSync(path.join(destLib, name), body);
    }
  }
  return { root, userDataDir, legacyLib, destLib };
}

const read = (p) => fs.readFileSync(p, 'utf8');
const listed = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : null);

test('it carries the whole library across, subfolders and all', () => {
  const w = makeWorld({
    legacyFiles: {
      'tine.sevenlib.json': '{"name":"Tine"}',
      'clav.sevenlib.json': '{"name":"Clav"}',
      'setlists.json': '[]',
      'sub/nested.sevenlib.json': '{"name":"Nested"}',
    },
  });
  const r = migrateLegacyLibrary({ userDataDir: w.userDataDir });
  assert.strictEqual(r.ran, true, `it ran (${r.reason || ''})`);
  assert.deepStrictEqual(listed(w.destLib),
    ['clav.sevenlib.json', 'setlists.json', 'sub', 'tine.sevenlib.json']);
  assert.strictEqual(read(path.join(w.destLib, 'tine.sevenlib.json')), '{"name":"Tine"}');
  assert.strictEqual(read(path.join(w.destLib, 'sub', 'nested.sevenlib.json')),
    '{"name":"Nested"}', 'a nested file came across too — the copy is recursive');
});

// RULE 2, AND THE ONE MOST LIKELY TO BE BROKEN BY A TIDY-UP. `cpSync` ->
// `renameSync` looks like a harmless simplification and would delete the only
// copy of somebody's library if anything about the destination were wrong.
test('COPY, NEVER MOVE — the old folder survives untouched', () => {
  const w = makeWorld({ legacyFiles: { 'a.sevenlib.json': '{"a":1}' } });
  migrateLegacyLibrary({ userDataDir: w.userDataDir });
  assert.ok(fs.existsSync(w.legacyLib), 'the old folder is still there');
  assert.deepStrictEqual(listed(w.legacyLib), ['a.sevenlib.json'],
    'with its files still in it');
  assert.strictEqual(read(path.join(w.legacyLib, 'a.sevenlib.json')), '{"a":1}',
    'and their contents unchanged');
});

// RULE 1. If the new folder exists this app has already run, and copying over
// it would overwrite everything done since — which is the owner's CURRENT
// library, not an old one.
test('an existing destination is never touched', () => {
  const w = makeWorld({
    legacyFiles: { 'old.sevenlib.json': '{"from":"old"}' },
    destFiles: { 'mine.sevenlib.json': '{"from":"new"}' },
  });
  const r = migrateLegacyLibrary({ userDataDir: w.userDataDir });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /already exists/);
  assert.deepStrictEqual(listed(w.destLib), ['mine.sevenlib.json'],
    'nothing was added to it');
  assert.strictEqual(read(path.join(w.destLib, 'mine.sevenlib.json')), '{"from":"new"}',
    'and nothing in it was overwritten');
});

// AN EMPTY destination still counts as existing. The app creates the folder
// on first run before anything is saved, so "it exists but has no files" is
// the state of every new install — and copying into it would be the migration
// running a second time.
test('an empty destination counts as existing — it is the normal new install', () => {
  const w = makeWorld({ legacyFiles: { 'old.sevenlib.json': '{}' }, destFiles: {} });
  const r = migrateLegacyLibrary({ userDataDir: w.userDataDir });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /already exists/);
  assert.deepStrictEqual(listed(w.destLib), [], 'it is still empty');
});

// RULE 3. Most people never had the old folder, so this is the common path
// and it must be silent and harmless.
test('a missing source is a no-op, not an error', () => {
  const w = makeWorld();
  const r = migrateLegacyLibrary({ userDataDir: w.userDataDir });
  assert.strictEqual(r.ran, false);
  assert.strictEqual(r.error, undefined, 'it is not reported as a failure');
  assert.match(r.reason, /no old library folder/);
  assert.strictEqual(fs.existsSync(w.destLib), false,
    'and nothing was created on the way to finding out');
});

// RULE 7: A TEST MUST NEVER WRITE TO THE REAL LIBRARY, and this function is
// one of the few places that could. Every test run and every UI scenario sets
// SEVEN_LIBRARY_DIR, so the override has to short-circuit before any path is
// built — not after.
test('an explicit library directory stops it dead', () => {
  const w = makeWorld({ legacyFiles: { 'old.sevenlib.json': '{}' } });
  const r = migrateLegacyLibrary({
    userDataDir: w.userDataDir,
    libraryOverride: '/somewhere/else',
  });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /explicit library directory/);
  assert.strictEqual(fs.existsSync(w.destLib), false, 'it wrote nothing at all');
});

// RULE 4. The caller runs before the window exists, so a throw here is an app
// that will not open — which is worse than a library that did not move.
// RULE 4. The caller runs before the window exists, so a throw here is an app
// that will not open — which is worse than a library that did not move.
test('a failure cannot stop the app opening, and is reported rather than swallowed', () => {
  const w = makeWorld({ legacyFiles: { 'a.sevenlib.json': '{}' } });
  // A READ-ONLY userData folder, so creating `Library` inside it genuinely
  // fails. The first version of this test wrote a FILE at the destination
  // path instead — which `existsSync` then reports as "already exists", so it
  // returned on the happy branch and never reached the catch at all. It
  // passed, and proved nothing: exactly the shape this file exists to stop.
  fs.chmodSync(w.userDataDir, 0o500);
  let r;
  try {
    assert.doesNotThrow(() => { r = migrateLegacyLibrary({ userDataDir: w.userDataDir }); });
  } finally {
    fs.chmodSync(w.userDataDir, 0o700);   // or the temp dir cannot be cleaned up
  }
  assert.strictEqual(r.ran, false);
  // REPORTED, not swallowed: a quiet false is indistinguishable from a broken
  // one, which is the shape this project keeps getting caught by.
  assert.strictEqual(r.error, true, `it is flagged as an error (${r.reason})`);
  assert.match(r.reason, /^failed: /, 'and the reason carries what went wrong');
  assert.strictEqual(fs.existsSync(w.legacyLib), true,
    'and the old folder is still there to try again from');
});

test('it says WHY it did nothing, every time', () => {
  // A bare false cannot be told from a failure. Each refusal carries its own
  // sentence, and they are distinct — otherwise the log says "did nothing"
  // and the next person has to re-derive which branch they are in.
  const reasons = new Set();
  reasons.add(migrateLegacyLibrary({ userDataDir: null }).reason);
  reasons.add(migrateLegacyLibrary({
    userDataDir: makeWorld().userDataDir, libraryOverride: '/x',
  }).reason);
  reasons.add(migrateLegacyLibrary({ userDataDir: makeWorld().userDataDir }).reason);
  reasons.add(migrateLegacyLibrary({
    userDataDir: makeWorld({ legacyFiles: {}, destFiles: {} }).userDataDir,
  }).reason);
  assert.strictEqual(reasons.size, 4, `four distinct reasons (${[...reasons].join(' | ')})`);
  for (const r of reasons) assert.ok(r && r.length > 5, `"${r}" says something`);
});

test('the legacy folder name is the one that shipped, and cannot drift', () => {
  // It names a directory that exists on other people's disks. Renaming it
  // would make the migration silently find nothing, which looks exactly like
  // an owner who never had the old version.
  assert.strictEqual(LEGACY_APP_DIR, 'Crumar Seven Editor');
});
