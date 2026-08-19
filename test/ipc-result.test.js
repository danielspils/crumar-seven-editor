'use strict';

// The seam that turns a refusal from the main process into an exception.
//
// THIS FILE RUNS ON `npm test` (and therefore in CI). Its companion,
// test/ui/scenarios/rename-undo-taken.js, does NOT: the test script globs
// "test/*.test.js", which never descends into test/ui/. That scenario needs a
// launched window and only runs when someone types `npm run test:ui`. So this
// is the guard that fires automatically; treat the scenario as the one that
// has to be remembered.

const test = require('node:test');
const assert = require('node:assert');

const { throwIfRefused } = require('../src/ipc-result');

// The bug this exists to prevent: `{ ok: false, … }` is truthy, so a caller
// that does not check reads a refusal as a result and carries on. An undo did
// exactly that and reported success while doing nothing (2026-08-18).
test('a refusal is thrown, not returned as something a caller could use', () => {
  assert.throws(
    () => throwIfRefused({ ok: false, error: 'There’s already a patch called “Alpha”.' }, 'NAME_TAKEN'),
    (err) => err.code === 'NAME_TAKEN' && /already a patch called/.test(err.message),
    'the refusal must arrive as an exception carrying the reason'
  );
});

test('a result passes through untouched', () => {
  // rename answers with the filename it ended up writing — a bare string, which
  // is exactly why the union had no marker to test.
  assert.strictEqual(throwIfRefused('alpha.sevenlib.json', 'NAME_TAKEN'), 'alpha.sevenlib.json');
  const obj = { file: 'beta.sevenlib.json', patchIndex: 0 };
  assert.strictEqual(throwIfRefused(obj, 'NAME_TAKEN'), obj);
  assert.strictEqual(throwIfRefused(null), null);
});

// A file dialog answers { ok: false, cancelled: true } when somebody pressed
// Cancel. Nothing went wrong and nobody needs an error about it.
test('a cancellation is not a refusal', () => {
  const cancelled = { ok: false, cancelled: true };
  assert.strictEqual(throwIfRefused(cancelled), cancelled);
});

test('a refusal with no message still throws, with a code', () => {
  assert.throws(() => throwIfRefused({ ok: false }), (err) => err.code === 'REFUSED');
});
