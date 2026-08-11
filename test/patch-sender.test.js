'use strict';

// PatchSender against a fake instrument. The real device is not available to
// CI (or to most contributors), so the fake implements the two verified write
// frames' CONTRACTS: setSound takes an id, setParamValue echoes back the value
// it took. Anything these tests assert about the protocol comes from
// docs/protocol.md, never from invention.

const test = require('node:test');
const assert = require('node:assert');
const { PatchSender, resolveSoundId } = require('../src/patch-sender');

const SCHEMA = {
  parameters: [
    { id: 2, key: 'b_two', max: 127 },
    { id: 0, key: 'a_zero', max: 64 },
    { id: 1, key: 'c_one', max: 1 },
  ],
};

function fakeMidi(opts = {}) {
  return {
    state: opts.state || 'connected',
    soundTable: opts.soundTable || {
      sounds: [{ id: 7, name: 'Tine Piano' }, { id: 18, name: 'Venice Grand CB1898' }],
    },
    calls: [],
    async setSound(id) {
      this.calls.push({ op: 'sound', id });
      return id;
    },
    async setParamValue(id, value) {
      this.calls.push({ op: 'param', id, value });
      if (opts.failParam === id && !opts.failedOnce) {
        opts.failedOnce = true;
        throw new Error('timeout waiting for 0x23');
      }
      if (opts.deaf === id) throw new Error('timeout waiting for 0x23');
      // The device clamps at the parameter's max; the fake mimics that for
      // the one parameter the clamp test uses.
      const took = opts.clampAt && opts.clampAt.id === id ? opts.clampAt.to : value;
      return { id, key: 'k', value: took, requested: value };
    },
  };
}

const patch = (params, name = 'Tine Piano') => ({ sound: { name }, params });

test('sends the sound first, then parameters in id order', async () => {
  const midi = fakeMidi();
  const r = await new PatchSender({ midi, schema: SCHEMA }).send(
    patch({ b_two: 10, a_zero: 20, c_one: 1 })
  );
  assert.deepStrictEqual(midi.calls, [
    { op: 'sound', id: 7 },
    { op: 'param', id: 0, value: 20 },
    { op: 'param', id: 1, value: 1 },
    { op: 'param', id: 2, value: 10 },
  ]);
  assert.strictEqual(r.sent, 3);
  assert.deepStrictEqual(r.mismatches, []);
});

test('resolves the sound by NAME, never by a stored id', async () => {
  const midi = fakeMidi();
  await new PatchSender({ midi, schema: SCHEMA }).send({
    sound: { name: 'Venice Grand CB1898', id: 99 }, // id 99 must be ignored
    params: {},
  });
  assert.deepStrictEqual(midi.calls, [{ op: 'sound', id: 18 }]);
});

test('refuses a sound this instrument does not have', async () => {
  const midi = fakeMidi();
  await assert.rejects(
    new PatchSender({ midi, schema: SCHEMA }).send(patch({}, 'Venice Upright U1')),
    /no sound called .Venice Upright U1./
  );
  assert.deepStrictEqual(midi.calls, [], 'nothing is sent when the sound is missing');
});

test('a sound-only patch sends the sound and no parameters', async () => {
  const midi = fakeMidi();
  const r = await new PatchSender({ midi, schema: SCHEMA }).send({
    sound: { name: 'Tine Piano' },
    params: {},
  });
  assert.deepStrictEqual(midi.calls, [{ op: 'sound', id: 7 }]);
  assert.strictEqual(r.total, 0);
});

test('clamps a value to the schema max for that parameter', async () => {
  const midi = fakeMidi();
  await new PatchSender({ midi, schema: SCHEMA }).send(patch({ a_zero: 900, c_one: -5 }));
  assert.deepStrictEqual(midi.calls, [
    { op: 'sound', id: 7 },
    { op: 'param', id: 0, value: 64 }, // max 64
    { op: 'param', id: 1, value: 0 },  // floor 0
  ]);
});

test('records a value the device would not take', async () => {
  const midi = fakeMidi({ clampAt: { id: 0, to: 60 } });
  const r = await new PatchSender({ midi, schema: SCHEMA }).send(patch({ a_zero: 64 }));
  assert.deepStrictEqual(r.mismatches, [{ key: 'a_zero', id: 0, wanted: 64, got: 60 }]);
});

test('retries a dropped reply, then fails loudly if it never lands', async () => {
  const ok = fakeMidi({ failParam: 1 });
  const r = await new PatchSender({ midi: ok, schema: SCHEMA }).send(patch({ c_one: 1 }));
  assert.strictEqual(r.sent, 1, 'one retry is enough');

  const dead = fakeMidi({ deaf: 1 });
  await assert.rejects(
    new PatchSender({ midi: dead, schema: SCHEMA }).send(patch({ c_one: 1 })),
    /c_one \(parameter 1\) would not take a value after 3 attempts/
  );
});

test('refuses to send when the instrument is not connected', async () => {
  const midi = fakeMidi({ state: 'disconnected' });
  await assert.rejects(
    new PatchSender({ midi, schema: SCHEMA }).send(patch({ a_zero: 1 })),
    /not connected/
  );
});

test('resolveSoundId folds case and whitespace, and says when it did', () => {
  const table = { sounds: [{ id: 3, name: 'Clavi Piano' }] };
  assert.deepStrictEqual(resolveSoundId(table, 'Clavi Piano'), { id: 3, fuzzy: false });
  assert.deepStrictEqual(resolveSoundId(table, '  clavi   piano '), { id: 3, fuzzy: true });
  assert.strictEqual(resolveSoundId(table, 'Nope'), null);
});
