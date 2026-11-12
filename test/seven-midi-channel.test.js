'use strict';

// THE INSTRUMENT IS NOT ALWAYS ON CHANNEL 1.
//
// Every Program Change this app sent went out as 0xC0 — channel 1, hardcoded.
// That was invisible for as long as the Seven sat on its default channel.
// On 2026-11-12 Daniel moved his to Ch. 15 so the JUNO-X could switch its
// preset per scene without colliding with the X's part 1 (Ch. 1) or its
// control channel (Ch. 16). The Seven then ignored every PC the app sent, and
// recall, backup and transfer went down together — backup is gated on the
// 0x45 broadcast that a recall produces, so no recall means no backup.
//
// These drive the real SevenMidi against a fake port and read the bytes on
// the wire. Hardcode the channel again and the first two fail.

const test = require('node:test');
const assert = require('node:assert');

const { SevenMidi, parseGlobals, GLB_CHANNEL } = require('../src/seven-midi');

// glb[0] = 14 is Ch. 15, which is where Daniel's Seven actually sits.
const ON_CHANNEL = (n) => parseGlobals(`tun=440;glb=${n},0,0,1,0,0,0,2,0`);

// midiBackend is injected so the native @julusian/midi binding is never
// loaded. These tests are about which bytes go out, not about a port.
const NO_BACKEND = { input: function () {}, output: function () {} };

function rig(glbChannel) {
  const midi = new SevenMidi({ midiBackend: NO_BACKEND });
  const sent = [];
  midi.output = { sendMessage: (bytes) => sent.push(bytes) };
  midi.globals = ON_CHANNEL(glbChannel);
  return { midi, sent };
}

test('a Program Change goes out on the channel the device reports', () => {
  const { midi, sent } = rig(14);          // Ch. 15
  midi.sendProgramChange(7);
  assert.deepStrictEqual(sent, [[0xce, 7]], 'status byte carries the channel');
});

test('the default channel still sends on channel 1', () => {
  const { midi, sent } = rig(0);           // Ch. 1
  midi.sendProgramChange(7);
  assert.deepStrictEqual(sent, [[0xc0, 7]]);
});

test('TX OFF sends on channel 1, which is the only behaviour observed', () => {
  // glb[0] = 16 is TX OFF, not a 17th channel. One reading on 2026-11-12: the
  // Seven stopped sending but still received PCs on channel 1. What it
  // receives on beyond that is UNKNOWN, and this test pins the fallback so
  // nobody later reads a guess as a finding.
  const { midi, sent } = rig(16);
  midi.sendProgramChange(7);
  assert.deepStrictEqual(sent, [[0xc0, 7]]);
});

test('a panel Program Change on the device channel is heard', () => {
  const { midi } = rig(14);
  const seen = [];
  midi.on('event', (e) => seen.push(e));
  midi._handleNonSysex([0xce, 3]);         // panel recall, Ch. 15
  assert.deepStrictEqual(seen.map((e) => e.type), ['program-change']);
  assert.strictEqual(midi.lastPanelProgram, 3);
});

test('a Program Change on somebody else channel is ignored', () => {
  // The Seven shares a bus with the JUNO-X, which talks on its own channels.
  // Before the channel gate this app treated every 0xC0 on the port as its
  // own instrument moving.
  const { midi } = rig(14);
  const seen = [];
  midi.on('event', (e) => seen.push(e));
  midi._handleNonSysex([0xc0, 3]);         // Ch. 1 — the X's part 1
  assert.deepStrictEqual(seen, [], 'nothing emitted');
  assert.strictEqual(midi.lastPanelProgram, null, 'untouched: still the initial value');
});

test('the CC burst follows the channel too', () => {
  // The burst is how a store is told from a tap. If the CCs arrive on Ch. 15
  // and the app only listens on Ch. 1, that detection goes quiet rather than
  // wrong, which is harder to notice.
  const { midi } = rig(14);
  const seen = [];
  midi.on('event', (e) => seen.push(e));
  midi._handleNonSysex([0xbe, 70, 99]);    // panel CC, Ch. 15
  midi._handleNonSysex([0xb0, 70, 99]);    // Ch. 1 — not ours
  assert.deepStrictEqual(seen.map((e) => e.type), ['panel-cc']);
  assert.strictEqual(seen[0].value, 99);
});

test('GLB_CHANNEL is index 0', () => {
  assert.strictEqual(GLB_CHANNEL, 0);
});
