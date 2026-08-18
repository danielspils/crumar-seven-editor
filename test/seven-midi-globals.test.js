'use strict';

// RULE 6, tested at last. The 0x33 globals reply carries `wfp` — the
// instrument's Wi-Fi password, in plaintext — and parseGlobals is the only
// place it is ever parsed. Everything downstream (the backup's globals
// snapshot, any log, any report) depends on the password not surviving this
// function.
//
// It had NO test until 2026-08-17, and mutation testing is how that surfaced:
// changing `out.wfp = WFP_REDACTED` to `out.wfp = val` left the whole suite
// green, because the fake instrument in backup-runner.test.js returned the
// string '[wfp redacted]' ITSELF. The test that looked like it covered this
// was asserting a value its own fixture hard-coded.
//
// These tests feed a REAL password in and assert it cannot be found anywhere
// in what comes out.

const test = require('node:test');
const assert = require('node:assert');

const { parseGlobals } = require('../src/seven-midi');

const PASSWORD = 'hunter2-correct-horse';

// Not "is the field redacted" but "is the password gone" — the difference
// matters, because a leak can land in a key nobody thought to check.
const leaks = (parsed, secret) => JSON.stringify(parsed).includes(secret);

test('a real password does not survive parseGlobals', () => {
  const parsed = parseGlobals(`tun=440;glb=0,0,0,0,0,0,0,2,0;wfp=${PASSWORD}`);
  assert.strictEqual(parsed.wfp, '[wfp redacted]');
  assert.ok(!leaks(parsed, PASSWORD), 'the password appears nowhere in the result');
  // The rest of the reply still parses — redaction is not refusal.
  assert.strictEqual(parsed.tun, 440);
  assert.deepStrictEqual(parsed.glb, [0, 0, 0, 0, 0, 0, 0, 2, 0]);
});

test('a password containing an = is still gone', () => {
  const parsed = parseGlobals(`tun=440;wfp=a=b=c`);
  assert.strictEqual(parsed.wfp, '[wfp redacted]');
  assert.ok(!leaks(parsed, 'a=b=c'));
});

test('wfp appearing twice leaves nothing behind', () => {
  const parsed = parseGlobals(`wfp=${PASSWORD};tun=440;wfp=${PASSWORD}`);
  assert.strictEqual(parsed.wfp, '[wfp redacted]');
  assert.ok(!leaks(parsed, PASSWORD));
});

test('a reply with no wfp still reads as redacted, never as absent', () => {
  const parsed = parseGlobals('tun=440;glb=1,2,3');
  assert.strictEqual(parsed.wfp, '[wfp redacted]',
    'the field is redacted by default, so a caller cannot mistake absence for safety');
});

// THE ONE THAT MATTERS MOST, because it is the failure the redaction cannot
// see: the reply is split on ';', so a password containing a semicolon breaks
// into a second pair, and the catch-all `out[key] = val` keeps whatever
// follows under a key nobody is watching.
test('a password containing a semicolon does not leak its tail', () => {
  const parsed = parseGlobals('tun=440;wfp=pass;word=secret');
  assert.ok(!leaks(parsed, 'secret'),
    'the fragment after the semicolon must not survive under some other key');
});
