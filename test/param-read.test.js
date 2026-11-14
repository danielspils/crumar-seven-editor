'use strict';

// The shared parameter read. Two things are worth pinning hard here, because
// everything that writes a patch file now depends on them:
//
//   - a dropped reply is RETRIED (the device drops about one in 110)
//   - a read that cannot be finished THROWS, and hands back nothing partial
//
// The second is the one with teeth. Daniel moves the one USB cable between
// this app and his JUNO-X rig, so losing the instrument mid-read is ordinary,
// and a file holding sixty fresh values and fifty stale ones is worse than no
// file: nothing afterwards can tell it from a real one.

const test = require('node:test');
const assert = require('node:assert');

const { readParamWithRetry, readBuffer, missingKeys } = require('../src/param-read');

// A minimal instrument: enough to answer a read, and able to drop replies or
// vanish on cue. Deliberately NOT the runner suites' FakeSeven — this module's
// whole contract is `state` plus `readParamValue`, and a fixture carrying more
// would hide a dependency on something else.
function fakeSeven({ dropIds = {}, vanishAfter = null, keyFor = (id) => `k${id}` } = {}) {
  return {
    state: 'connected',
    reads: [],
    drops: { ...dropIds },
    async readParamValue(id) {
      if (this.drops[id] > 0) { this.drops[id]--; throw new Error('timeout waiting for 0x23'); }
      this.reads.push(id);
      if (vanishAfter !== null && this.reads.length >= vanishAfter) this.state = 'disconnected';
      return { id, key: keyFor(id), value: 100 + id };
    },
  };
}

test('a clean read answers on the first attempt', async () => {
  const midi = fakeSeven();
  assert.deepStrictEqual(await readParamWithRetry(midi, 7), { id: 7, key: 'k7', value: 107 });
  assert.deepStrictEqual(midi.reads, [7], 'one read, not a retry loop that happened to work');
});

test('a dropped reply is retried and the value still comes back', async () => {
  const midi = fakeSeven({ dropIds: { 4: 2 } }); // fails twice, answers on the third
  const r = await readParamWithRetry(midi, 4);
  assert.strictEqual(r.value, 104);
});

test('three failures throw, and the message NAMES the parameter', async () => {
  const midi = fakeSeven({ dropIds: { 9: 99 } });
  await assert.rejects(() => readParamWithRetry(midi, 9), (err) => {
    assert.match(err.message, /param 9 /, 'the id is in the message, not just a count');
    assert.match(err.message, /3 attempts/);
    return true;
  });
});

test('readBuffer collects every id, keyed by the key the DEVICE gave', async () => {
  const midi = fakeSeven({ keyFor: (id) => `dev_${id}` });
  const { params, keys } = await readBuffer(midi, [0, 1, 2]);
  assert.deepStrictEqual(params, { dev_0: 100, dev_1: 101, dev_2: 102 });
  assert.deepStrictEqual(keys, ['dev_0', 'dev_1', 'dev_2'], 'order follows the id list');
  assert.deepStrictEqual(midi.reads, [0, 1, 2]);
});

test('ONE unreadable parameter fails the whole buffer — nothing partial escapes', async () => {
  const midi = fakeSeven({ dropIds: { 1: 99 } });
  await assert.rejects(() => readBuffer(midi, [0, 1, 2]), /param 1 /);
  // And it stopped: parameter 2 was never asked for, so a caller cannot be
  // handed a buffer that merely LOOKS short.
  assert.ok(!midi.reads.includes(2), 'the read stops at the failure');
});

test('losing the instrument MID-READ throws rather than returning what it got', async () => {
  const midi = fakeSeven({ vanishAfter: 2 }); // the cable goes after two reads
  await assert.rejects(() => readBuffer(midi, [0, 1, 2, 3, 4]), /disconnected during the read/);
  assert.strictEqual(midi.reads.length, 2, 'it does not keep reading a port that is gone');
});

test('an instrument that is already gone is never read at all', async () => {
  const midi = fakeSeven();
  midi.state = 'disconnected';
  await assert.rejects(() => readBuffer(midi, [0]), /disconnected during the read/);
  assert.deepStrictEqual(midi.reads, []);
});

// THE LAST READ'S REPLY PROVES NOTHING ABOUT NOW. Without the final check a
// cable pulled after the last parameter answered would still produce a
// complete-looking buffer — and that buffer would be saved.
test('a cable pulled AFTER the last reply still fails the read', async () => {
  const midi = fakeSeven({ vanishAfter: 3 });
  await assert.rejects(() => readBuffer(midi, [0, 1, 2]), /disconnected during the read/);
  assert.strictEqual(midi.reads.length, 3, 'every parameter answered, and it still refuses');
});

test('a reply carrying no key is refused rather than stored under undefined', async () => {
  const midi = fakeSeven({ keyFor: (id) => (id === 1 ? '' : `k${id}`) });
  await assert.rejects(() => readBuffer(midi, [0, 1]), /param 1 answered with no key/);
});

test('missingKeys names what the device did not report', async () => {
  const midi = fakeSeven();
  const { params } = await readBuffer(midi, [0, 1]);
  assert.deepStrictEqual(missingKeys(['k0', 'k1', 'k2', 'k3'], params), ['k2', 'k3']);
  assert.deepStrictEqual(missingKeys(['k0', 'k1'], params), [], 'nothing missing reads as nothing');
});
