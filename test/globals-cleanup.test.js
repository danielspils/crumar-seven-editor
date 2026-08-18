'use strict';

// Cleaning the 1.0 leak out of globals snapshots already on disk. The tests
// that matter are the ones about NOT damaging a file: a snapshot is a record,
// and a cleanup that mangles one is worse than the fragment it removes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cleanup = require('../src/globals-cleanup');

// The real atomic write, so this exercises what the app uses.
const { writeAtomic } = require('../src/library-store');

function workspace(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'globals-cleanup-'));
  const dir = path.join(root, 'Library');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
  }
  return { root, dir, write: writeAtomic };
}

const CLEAN = {
  captured: '2026-08-16T00:00:00Z',
  tun: 440,
  glb: [0, 1, 1, 1, 0, 1, 0, 1, 0],
  wfp: '[wfp redacted]',
};

// "wfp=my;pass" parsed on 1.0: the tail became a key of its own.
const LEAKED = { ...CLEAN, pass: 'the-rest-of-the-password' };

test('an unknown field keeps its key and loses its value', () => {
  const ws = workspace({ 'globals-2026-08-16.json': LEAKED });
  const result = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });

  assert.strictEqual(result.filesChanged, 1);
  assert.strictEqual(result.fieldsRedacted, 1);
  const after = JSON.parse(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8'));
  assert.strictEqual(after.pass, cleanup.REDACTED, 'the value is gone');
  assert.ok('pass' in after, 'the key stays — a field this build does not know is worth noticing');
  assert.ok(!JSON.stringify(after).includes('the-rest-of-the-password'),
    'and the fragment appears nowhere');
});

test('the known fields are untouched', () => {
  const ws = workspace({ 'globals-2026-08-16.json': LEAKED });
  cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  const after = JSON.parse(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8'));
  assert.strictEqual(after.tun, 440);
  assert.deepStrictEqual(after.glb, CLEAN.glb);
  assert.strictEqual(after.wfp, '[wfp redacted]');
  assert.strictEqual(after.captured, CLEAN.captured);
});

// Daniel's own seven snapshots are all of this shape: nothing to do.
test('a clean snapshot is not rewritten at all', () => {
  const ws = workspace({ 'globals-2026-08-16.json': CLEAN });
  const before = fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8');
  const result = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  assert.strictEqual(result.filesChanged, 0);
  assert.strictEqual(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8'), before,
    'byte for byte what it was');
});

test('a file that will not parse is left exactly as it is', () => {
  const broken = '{ "captured": "2026-08-16", "tun": 44';
  const ws = workspace({ 'globals-2026-08-16.json': broken });
  const result = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  assert.strictEqual(result.filesChanged, 0);
  assert.strictEqual(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8'), broken);
});

test('every snapshot in the folder is checked, and nothing else is', () => {
  const ws = workspace({
    'globals-2026-08-09.json': LEAKED,
    'globals-2026-08-16.json': LEAKED,
    'globals-2026-08-12.json': CLEAN,
    'a-patch.sevenlib.json': { patches: [{ name: 'not a snapshot', pass: 'untouched' }] },
    'setlists.json': { setlists: [] },
  });
  const result = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  assert.strictEqual(result.filesChanged, 2, 'both leaked snapshots');
  const patch = fs.readFileSync(path.join(ws.dir, 'a-patch.sevenlib.json'), 'utf8');
  assert.ok(patch.includes('untouched'), 'a patch file is not a globals snapshot');
});

test('it runs once, ever', () => {
  const ws = workspace({ 'globals-2026-08-16.json': LEAKED });
  assert.strictEqual(cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write }).filesChanged, 1);

  fs.writeFileSync(path.join(ws.dir, 'globals-2026-08-17.json'), `${JSON.stringify(LEAKED)}\n`);
  const second = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  assert.strictEqual(second.ran, false);
  const untouched = JSON.parse(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-17.json'), 'utf8'));
  assert.strictEqual(untouched.pass, 'the-rest-of-the-password', 'the marker held');
});

test('a second pass over an already-redacted file changes nothing', () => {
  const ws = workspace({ 'globals-2026-08-16.json': LEAKED });
  cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write });
  const after = fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8');
  const again = cleanup.run({ dir: ws.dir, userDataDir: ws.root, write: ws.write, force: true });
  assert.strictEqual(again.filesChanged, 0, 'the redaction marker is not itself an unknown value');
  assert.strictEqual(fs.readFileSync(path.join(ws.dir, 'globals-2026-08-16.json'), 'utf8'), after);
});
