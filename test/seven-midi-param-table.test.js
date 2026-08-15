'use strict';

// Connect reads the INSTRUMENT's parameter table and gates 0x20 writes on it.
// Driven against a fake Seven so the cases that matter most — a unit with a
// different parameter map, and one that drops replies — can be tested at all.
// No such instrument exists in this room; that is exactly why the gate is here.

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { SevenMidi } = require('../src/seven-midi');

const HEADER = [0xf0, 0x73, 0x26, 0x14];
const END = 0xf7;
const ascii = (s) => [...Buffer.from(s, 'latin1')];
const frame = (op, payload) => [...HEADER, op, ...payload, END];

// Enough of a Seven to get through connect(): firmware string, globals, one
// sound, and a parameter table of whatever shape the test asks for.
function fakeSeven({ params, count = null, drop = new Map() }) {
  const listeners = [];
  const sent = [];
  const reply = (msg) => setImmediate(() => listeners.forEach((f) => f(0, msg)));

  const respond = (msg) => {
    const op = msg[4];
    if (op === 0x70 && msg[5] === 4) {
      return reply(frame(0x71, [4, ...ascii('1.37 2022-05-16')]));
    }
    if (op === 0x32) {
      return reply(frame(0x33, [0x00, ...ascii('tun=440;glb=0,0,0,0,0,0,0,2,0;wfp=hunter2')]));
    }
    if (op === 0x42) {
      const id = msg[6];
      const name = id === 0 ? 'Venice Grand D-274' : '';
      return reply(frame(0x43, [id, ...ascii(`${id}|1|${name}`)]));
    }
    if (op === 0x22) {
      const id = (msg[6] << 7) | msg[7];
      const p = params.find((x) => x.id === id);
      if (!p) return undefined;
      return reply(frame(0x23, [0x00, ...ascii(`${id}|${p.key}|64|64`)]));
    }
    if (op === 0x10) {
      const n = count === null ? params.length : count;
      return reply(frame(0x11, [0x00, (n >> 7) & 0x7f, n & 0x7f]));
    }
    if (op === 0x14) {
      const id = (msg[6] << 7) | msg[7];
      const left = drop.get(id) || 0;
      if (left > 0) { drop.set(id, left - 1); return undefined; } // silence
      const p = params.find((x) => x.id === id);
      // Past the end: the real instrument answers with a MALFORMED spec, not
      // silence (docs/protocol.md — id 110 is a sentinel). The reader must
      // never ask for it; if it does, this is what it gets.
      const text = p
        ? `${p.id}|${p.group || 'pno'}|${p.key}|${p.label || p.key}|-1|${p.max ?? 127}|64|0`
        : `${id}|ÿÿ|`;
      return reply(frame(0x15, [0x00, ...ascii(text)]));
    }
    return undefined;
  };

  class Input {
    getPortCount() { return 1; }
    getPortName() { return 'Crumar Seven'; }
    ignoreTypes() {}
    on(_ev, fn) { listeners.push(fn); }
    openPort() {}
    closePort() { listeners.length = 0; }
    isPortOpen() { return true; }
  }
  class Output {
    getPortCount() { return 1; }
    getPortName() { return 'Crumar Seven'; }
    openPort() {}
    closePort() {}
    isPortOpen() { return true; }
    sendMessage(msg) { sent.push(msg); respond(msg); }
  }
  return { Input, Output, sent };
}

const table = (n, keyFor = (i) => `p${i}`) =>
  Array.from({ length: n }, (_, i) => ({ id: i, key: keyFor(i), label: `L${i}`, max: 127 }));

const connect = async (backend, schemaParams, schemaFirmware = null) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-gate-'));
  const midi = new SevenMidi({
    userDataDir: dir, midiBackend: backend, schemaParams, schemaFirmware, timeout: 150,
  });
  await midi.connect();
  return midi;
};

test('connect reads the table and leaves writes open when it matches', async () => {
  const app = table(12);
  const midi = await connect(fakeSeven({ params: table(12) }), app);
  assert.equal(midi.paramTable.count, 12);
  assert.equal(midi.paramTable.params.length, 12);
  assert.equal(midi.status().params.count, 12);
  assert.equal(midi.status().writes.allowed, true);
  await midi.disconnect();
});

test('the sentinel past the end is never requested', async () => {
  const backend = fakeSeven({ params: table(12) });
  const midi = await connect(backend, table(12));
  const asked = backend.sent.filter((m) => m[4] === 0x14).map((m) => (m[6] << 7) | m[7]);
  assert.deepEqual([...new Set(asked)].sort((a, b) => a - b), [...Array(12).keys()]);
  await midi.disconnect();
});

test('a dropped spec is re-requested, not treated as the end of the table', async () => {
  const backend = fakeSeven({ params: table(12), drop: new Map([[7, 1]]) });
  const midi = await connect(backend, table(12));
  assert.equal(midi.paramTable.count, 12);
  assert.equal(midi.paramTable.params[7].key, 'p7');
  assert.equal(midi.status().writes.allowed, true);
  await midi.disconnect();
});

test('a spec that never answers BLOCKS writes rather than passing', async () => {
  const backend = fakeSeven({ params: table(12), drop: new Map([[7, 99]]) });
  const midi = await connect(backend, table(12));
  assert.equal(midi.paramTable, null);
  assert.equal(midi.status().writes.allowed, false);
  assert.match(midi.status().writes.message, /could not be read \(no answer for parameter 7\)/);
  await midi.disconnect();
});

test('a smaller table blocks 0x20 writes and says both counts', async () => {
  const midi = await connect(fakeSeven({ params: table(9) }), table(12));
  assert.equal(midi.status().writes.allowed, false);
  await assert.rejects(
    () => midi.setParamValue(0, 64),
    (err) => {
      assert.equal(err.code, 'PARAM_TABLE_MISMATCH');
      // No schemaFirmware in this fake, so the firmware sentence is dropped
      // and the counts carry the message — the documented fallback.
      assert.match(err.message, /This instrument reports 9 parameters where the app knows 12\./);
      return true;
    }
  );
  await midi.disconnect();
});

test('reads stay open on a mismatched unit, across its own id range', async () => {
  const midi = await connect(fakeSeven({ params: table(9) }), table(12));
  const r = await midi.readParamValue(8); // beyond nothing — the device has it
  assert.equal(r.id, 8);
  await assert.rejects(() => midi.readParamValue(9), /out of range/);
  await midi.disconnect();
});

test('a renamed parameter blocks even when the count agrees', async () => {
  const dev = table(12);
  dev[3] = { id: 3, key: 'something_else', label: 'L3', max: 127 };
  const midi = await connect(fakeSeven({ params: dev }), table(12));
  assert.equal(midi.status().writes.allowed, false);
  assert.match(midi.status().writes.message, /calls parameter 3 “something_else”/);
  await midi.disconnect();
});

test('no schemaParams means no comparison and no gate — tools are outside it', async () => {
  const midi = await connect(fakeSeven({ params: table(9) }), null);
  assert.equal(midi.paramTable, null);
  assert.equal(midi.paramVerdict, null);
  assert.equal(midi.status().writes.allowed, true);
  await midi.disconnect();
});

test('disconnect forgets the table and the verdict', async () => {
  const midi = await connect(fakeSeven({ params: table(9) }), table(12));
  await midi.disconnect();
  assert.equal(midi.paramTable, null);
  assert.equal(midi.paramVerdict, null);
});

// SEVEN_FORCE_MISMATCH exists because the closed-gate path cannot be reached
// on the author's own instrument. These check the flag itself: that it closes
// the gate, that it leaves the real table alone, and — the one that matters —
// that it does nothing at all when unset.
test('the force flag closes the gate without touching what was read', async () => {
  process.env.SEVEN_FORCE_MISMATCH = '1.22';
  try {
    // With a schema firmware, so the banner's full first sentence is exercised.
    const midi = await connect(fakeSeven({ params: table(12) }), table(12), '1.37');
    const st = midi.status();
    assert.equal(st.writes.allowed, false, 'gate forced closed on a matching unit');
    assert.match(st.writes.paragraphs[0], /built against 1\.37/);
    assert.equal(midi.paramTable.count, 12, 'the real table is still the real table');
    assert.equal(midi.paramTable.params.length, 12, 'all 12 specs kept for the report');
    assert.match(st.writes.paragraphs[0], /running firmware 1\.22/);
    assert.match(st.writes.paragraphs[0], /reports 6 parameters where the app knows 12/);
    await midi.disconnect();
  } finally {
    delete process.env.SEVEN_FORCE_MISMATCH;
  }
});

test('the force flag can fake an unreadable firmware string', async () => {
  process.env.SEVEN_FORCE_MISMATCH = 'nofw';
  try {
    const midi = await connect(fakeSeven({ params: table(12) }), table(12));
    const paras = midi.status().writes.paragraphs;
    assert.ok(!/firmware \d/.test(paras[0]), 'the firmware sentence is dropped');
    assert.match(paras[0], /^This instrument reports 6 parameters where the app knows 12\./);
    await midi.disconnect();
  } finally {
    delete process.env.SEVEN_FORCE_MISMATCH;
  }
});

test('unset, the flag changes nothing — a matching unit still passes', async () => {
  delete process.env.SEVEN_FORCE_MISMATCH;
  const midi = await connect(fakeSeven({ params: table(12) }), table(12));
  assert.equal(midi.status().writes.allowed, true);
  assert.deepEqual(midi.status().writes.paragraphs, []);
  await midi.disconnect();
});
