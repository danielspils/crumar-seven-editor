'use strict';

// Patch file format tests (docs/FORMAT.md). Fixtures only — no hardware.
// Runner: Node's built-in test runner (`npm test` → node --test).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = require('../schema/seven-1.37.json');
const { serializeLibrary, parseLibrary, validateLibrary } = require('../src/format/index.js');

const fixturePath = path.join(__dirname, '..', 'fixtures', 'library-roundtrip.json');
const loadFixture = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

test('round-trip: parse(serialize(x)) deep-equals x, including unknown keys', () => {
  const lib = loadFixture();
  // Unknown keys at both levels must survive a serialize/parse cycle.
  lib.futureTopLevel = { anything: [1, 2, 3] };
  lib.patches[0].futurePatchKey = 'kept';
  const { library, report } = parseLibrary(serializeLibrary(lib), { schema });
  assert.deepEqual(library, lib);
  assert.equal(report.errors.length, 0);
  const unknowns = report.unknownKeys.map((u) => u.key);
  assert.ok(unknowns.includes('futureTopLevel'));
  assert.ok(unknowns.includes('futurePatchKey'));
});

test('out-of-range value survives UNCHANGED and produces a warning', () => {
  const lib = loadFixture();
  lib.patches[0].params.rev_lv = 250; // schema max 127
  const { library, report } = parseLibrary(serializeLibrary(lib), { schema });
  assert.equal(library.patches[0].params.rev_lv, 250); // preserved verbatim
  const hit = report.outOfRange.find((o) => o.key === 'rev_lv');
  assert.deepEqual(hit, { patch: 0, key: 'rev_lv', value: 250, max: 127 });
  assert.ok(report.warnings.some((w) => w.includes('rev_lv') && w.includes('250') && w.includes('127')));
});

test('serialize throws when a wfp key is present at any depth', () => {
  const top = loadFixture();
  top.wfp = '00000000';
  assert.throws(() => serializeLibrary(top), /wfp/);

  const deep = loadFixture();
  deep.patches[1].source = { notes: { nested: { wfp: 'secret' } } };
  assert.throws(() => serializeLibrary(deep), /wfp/);

  const clean = loadFixture();
  assert.doesNotThrow(() => serializeLibrary(clean));
});

test('absent param key → warning naming it, library still usable', () => {
  const lib = loadFixture();
  delete lib.patches[0].params.rho_hrd;
  const report = validateLibrary(lib, schema);
  assert.equal(report.errors.length, 0); // usable: warnings, not errors
  assert.deepEqual(report.missingParams, [{ patch: 0, key: 'rho_hrd' }]);
  assert.ok(report.warnings.some((w) => w.includes('rho_hrd')));
});

test('structural errors: wrong format string and non-integer formatVersion', () => {
  const lib = loadFixture();
  lib.format = 'something-else';
  lib.formatVersion = '1';
  const report = validateLibrary(lib, schema);
  assert.ok(report.errors.some((e) => e.includes('format string')));
  assert.ok(report.errors.some((e) => e.includes('formatVersion')));
});

test('parse never throws on invalid JSON; reports it instead', () => {
  const { library, report } = parseLibrary('{ not json');
  assert.equal(library, null);
  assert.ok(report.errors[0].startsWith('invalid JSON'));
});

test('fixture is complete: 32 patches, 110 params each, no schema warnings', () => {
  const lib = loadFixture();
  const report = validateLibrary(lib, schema);
  assert.equal(lib.patches.length, 32);
  assert.equal(report.errors.length, 0);
  assert.equal(report.missingParams.length, 0);
  assert.equal(report.outOfRange.length, 0);
  for (const p of lib.patches) assert.equal(Object.keys(p.params).length, 110);
});
