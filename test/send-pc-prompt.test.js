'use strict';

// SEND PC IS OFF — the prompt, and the rule that decides it.
//
// "Send PC" is the instrument's own name for it: glb index 3, listed under
// that name in the manual (docs/DEVICE.md) and shown that way in the
// manufacturer's editor. The player will find it on their panel under that
// name, which is the only reason the modal is worth showing.
//
// With it off, panel recalls carry no Program Change, so the app hears WHICH
// SOUND is playing but never which preset SLOT — it cannot follow the panel,
// and the recall-burst fingerprint never closes.

const test = require('node:test');
const assert = require('node:assert');
const { shouldPrompt, turnOn, SEND_PC_INDEX } = require('../src/send-pc-prompt.js');

test('it is glb index 3', () => {
  assert.strictEqual(SEND_PC_INDEX, 3);
});

test('reads OFF: prompt', () => {
  assert.strictEqual(shouldPrompt({ state: 'connected', sendPc: 0 }), true);
});

test('reads ON: no prompt', () => {
  assert.strictEqual(shouldPrompt({ state: 'connected', sendPc: 1 }), false);
});

test('CANNOT BE READ: no prompt, and no guess', () => {
  // The app must never infer "off" from a default. Off IS the factory setting,
  // which is exactly why assuming it feels safe and is not: a unit whose
  // globals did not answer would be told its setting is off when nobody knows.
  assert.strictEqual(shouldPrompt({ state: 'connected', sendPc: null }), false);
  assert.strictEqual(shouldPrompt({ state: 'connected' }), false);
});

test('not connected: nothing to prompt about', () => {
  assert.strictEqual(shouldPrompt({ state: 'disconnected', sendPc: 0 }), false);
});

// ---- the write -------------------------------------------------------------

test('a confirmed write reports ok', async () => {
  const calls = [];
  const r = await turnOn({
    setGlobal: async (i, v) => { calls.push([i, v]); return { ok: true, index: i, value: v }; },
  });
  assert.deepStrictEqual(calls, [[3, 1]], 'writes 1 to glb 3');
  assert.strictEqual(r.ok, true);
});

test('A WRITE THAT DID NOT TAKE IS NOT SUCCESS', async () => {
  // setGlobalOption re-reads the global and returns what the instrument now
  // holds. If that disagrees with what was asked, the app must not tell the
  // player it changed their instrument.
  const r = await turnOn({ setGlobal: async () => ({ ok: true, index: 3, value: 0 }) });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /did not take|still off/i);
});

test('a refused write reports its reason', async () => {
  const r = await turnOn({ setGlobal: async () => ({ ok: false, error: 'not connected' }) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'not connected');
});

test('a thrown write is an error, not a crash', async () => {
  const r = await turnOn({ setGlobal: async () => { throw new Error('timeout waiting for 0x31'); } });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /timeout/);
});
