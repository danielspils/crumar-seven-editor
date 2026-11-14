'use strict';

// BORROWING A GLOBAL, AND GIVING IT BACK.
//
// The app changes two of the instrument's global options for its own
// convenience — Send PC, so a transfer can see a recall, and Send CC, so the
// editor can follow a knob the player turns. Both are the PLAYER's settings.
// The promise is that they go back, including after a crash, which is what the
// marker file on disk is for.
//
// The case these tests exist for is the OVERLAP. The marker held one object
// while Send PC was the only thing ever borrowed; with two borrowers the
// second write would have erased the first one's note, and the instrument
// would have been left changed by an app that no longer remembered changing
// it. That failure is silent on the wire and invisible in the UI — the only
// place it can be caught is here.

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { SevenMidi, GLB_SEND_CC, GLB_SEND_PC } = require('../src/seven-midi');

const HEADER = [0xf0, 0x73, 0x26, 0x14];
const END = 0xf7;
const ascii = (s) => [...Buffer.from(s, 'latin1')];
const frame = (op, payload) => [...HEADER, op, ...payload, END];

// Enough Seven to connect, plus a globals array the test can watch the app
// change. `glb` is the instrument's own memory here: a write lands in it, and
// the next read reports it back, exactly as the real one does.
function fakeSeven({ glb = [0, 1, 0, 0, 0, 1, 0, 1, 0] } = {}) {
  const listeners = [];
  const state = { glb: [...glb], writes: [] };
  const reply = (msg) => setImmediate(() => listeners.forEach((f) => f(0, msg)));

  const respond = (msg) => {
    const op = msg[4];
    if (op === 0x70 && msg[5] === 4) {
      return reply(frame(0x71, [4, ...ascii('1.37 2022-05-16')]));
    }
    if (op === 0x32) {
      return reply(frame(0x33, [0x00, ...ascii(`tun=440;glb=${state.glb.join(',')};wfp=hunter2`)]));
    }
    if (op === 0x30) { // SET_GLOBAL: index, value — acked by echoing the index
      const [index, value] = [msg[5], msg[6]];
      state.writes.push({ index, value });
      state.glb[index] = value;
      return reply(frame(0x31, [index]));
    }
    if (op === 0x42) {
      const id = msg[6];
      return reply(frame(0x43, [id, ...ascii(`${id}|1|${id === 0 ? 'Venice Grand D-274' : ''}`)]));
    }
    if (op === 0x10) return reply(frame(0x11, [0x00, 0, 1]));
    if (op === 0x14) {
      const id = (msg[6] << 7) | msg[7];
      const text = id === 0 ? '0|pno|p0|L0|-1|127|64|0' : `${id}|ÿÿ|`;
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
    sendMessage(msg) { respond(msg); }
  }
  return { Input, Output, state };
}

const SCHEMA_PARAMS = [{ id: 0, key: 'p0', label: 'L0', max: 127 }];
const MARKER = 'pending-glb-restore.json';

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seven-borrow-'));

const connect = async (backend, dir) => {
  const midi = new SevenMidi({
    userDataDir: dir, midiBackend: backend, schemaParams: SCHEMA_PARAMS, timeout: 150,
  });
  await midi.connect();
  return midi;
};

const marker = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8')); } catch { return null; }
};

test('borrowing Send CC turns it on and leaves a note saying what it was', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 1, 0, 1, 0, 1, 0] }); // Send CC off, Send PC on
  const midi = await connect(backend, dir);

  assert.strictEqual(await midi.setSendCc(1), true, 'it reports that it borrowed');
  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 1, 'the instrument took it');
  assert.deepStrictEqual(
    marker(dir).map((m) => ({ index: m.index, value: m.value })),
    [{ index: GLB_SEND_CC, value: 0 }],
    'the note says it was OFF'
  );
  await midi.disconnect();
});

// THE CASE THIS FILE EXISTS FOR.
test('two overlapping borrows are BOTH remembered', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 0, 0, 1, 0, 1, 0] }); // both off
  const midi = await connect(backend, dir);

  await midi.setSendCc(1);   // the editor borrows one
  await midi.setSendPc(1);   // a transfer borrows the other, while the first is out

  const noted = marker(dir).map((m) => ({ index: m.index, value: m.value }))
    .sort((a, b) => a.index - b.index);
  assert.deepStrictEqual(noted, [
    { index: GLB_SEND_CC, value: 0 },
    { index: GLB_SEND_PC, value: 0 },
  ], 'the second borrow did not erase the first');
  await midi.disconnect();
});

test('giving one back leaves the other still on loan', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 0, 0, 1, 0, 1, 0] });
  const midi = await connect(backend, dir);

  await midi.setSendCc(1);
  await midi.setSendPc(1);
  await midi.restoreSendCc();

  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 0, 'Send CC is back where it was');
  assert.strictEqual(backend.state.glb[GLB_SEND_PC], 1, 'Send PC is still borrowed');
  assert.deepStrictEqual(
    marker(dir).map((m) => m.index), [GLB_SEND_PC],
    'and the note still says so'
  );
  await midi.disconnect();
});

test('a crash with both out is repaired on the next connect', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 0, 0, 1, 0, 1, 0] });
  const midi = await connect(backend, dir);
  await midi.setSendCc(1);
  await midi.setSendPc(1);
  // No disconnect: the process died. The instrument is left changed and the
  // note on disk is the only record of it.
  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 1);
  assert.strictEqual(backend.state.glb[GLB_SEND_PC], 1);

  const next = await connect(backend, dir); // same userDataDir, new session
  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 0, 'put back at connect');
  assert.strictEqual(backend.state.glb[GLB_SEND_PC], 0, 'both of them');
  assert.strictEqual(marker(dir), null, 'and the note is gone');
  await next.disconnect();
});

test('borrowing what is already set changes nothing and notes nothing', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 1, 0, 0, 1, 0, 1, 0] }); // Send CC already on
  const midi = await connect(backend, dir);

  assert.strictEqual(await midi.setSendCc(1), false, 'nothing was borrowed');
  assert.strictEqual(marker(dir), null, 'so there is nothing to put back');
  await midi.disconnect();
});

// Borrowing twice must keep the FIRST value. Overwriting it with the current
// one would make the restore put back the app's own setting and call it the
// player's — the borrow would look returned and the setting would stay changed.
test('a second borrow of the same global does not overwrite what it was', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 0, 0, 1, 0, 1, 0] });
  const midi = await connect(backend, dir);

  await midi.setSendCc(1);
  await midi.setSendCc(0);   // somebody borrows it the other way round
  await midi.setSendCc(1);

  assert.deepStrictEqual(
    marker(dir).map((m) => ({ index: m.index, value: m.value })),
    [{ index: GLB_SEND_CC, value: 0 }],
    'still the value it had before the app touched it'
  );
  await midi.restoreSendCc();
  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 0);
  await midi.disconnect();
});

// A marker written by a build that only ever borrowed one thing.
test('a single-object marker from an older build is still honoured', async () => {
  const dir = freshDir();
  fs.writeFileSync(
    path.join(dir, MARKER), JSON.stringify({ index: GLB_SEND_PC, value: 0 })
  );
  const backend = fakeSeven({ glb: [0, 1, 0, 1, 0, 1, 0, 1, 0] }); // Send PC left ON
  const midi = await connect(backend, dir);

  assert.strictEqual(backend.state.glb[GLB_SEND_PC], 0, 'put back from the old shape');
  assert.strictEqual(marker(dir), null);
  await midi.disconnect();
});

test('disconnect returns everything it had on loan', async () => {
  const dir = freshDir();
  const backend = fakeSeven({ glb: [0, 1, 0, 0, 0, 1, 0, 1, 0] });
  const midi = await connect(backend, dir);
  await midi.setSendCc(1);
  await midi.setSendPc(1);

  await midi.disconnect();

  assert.strictEqual(backend.state.glb[GLB_SEND_CC], 0);
  assert.strictEqual(backend.state.glb[GLB_SEND_PC], 0);
  assert.strictEqual(marker(dir), null);
});
