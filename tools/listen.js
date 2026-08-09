'use strict';

// Passive MIDI listener: records everything the Seven emits to a JSONL capture
// file. No output port is opened — this tool cannot send anything.
//
//   node tools/listen.js [--in <name|idx>] [--label pc-recall] [--echo]
//
// Each incoming message is one JSON row with a wall-clock timestamp taken at
// receipt (explicit per-message Date.now(), never an interval), the delta from
// the previous message, and the raw bytes as hex. Raw hex is ground truth and
// is never replaced by a decoded view (CLAUDE.md Rule 5) — with ONE deliberate
// exception, per Rule 6: if a SysEx payload contains `wfp=<password>` (the
// globals reply leaks the instrument's Wi-Fi password in plaintext), the value
// bytes are masked with '*' BEFORE the row is written, and the row is marked
// "redacted". The password never touches disk.
//
// MIDI timing clock (0xF8) and active sensing (0xFE) are ignored so a clock
// stream can't flood the capture; the header row records that choice.

const fs = require('fs');
const path = require('path');
const { Input } = require('@julusian/midi');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
};

const label = flag('label', 'listen');
const echo = args.includes('--echo');

const input = new Input();
const portCount = input.getPortCount();
let portIndex = -1;
const want = flag('in', null);
for (let i = 0; i < portCount; i++) {
  const name = input.getPortName(i);
  if (want != null ? (String(i) === want || name.includes(want)) : /seven|crumar|gsi/i.test(name)) {
    portIndex = i;
    break;
  }
}
if (portIndex < 0) {
  console.error('No matching MIDI input port. Ports:');
  for (let i = 0; i < portCount; i++) console.error(`  [${i}] ${input.getPortName(i)}`);
  process.exit(1);
}
const portName = input.getPortName(portIndex);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = path.join(__dirname, '..', 'captures', `${label}-${stamp}.jsonl`);
fs.mkdirSync(path.dirname(file), { recursive: true });
const out = fs.createWriteStream(file, { flags: 'a' });

// Mask `wfp=<value>` inside an ASCII SysEx payload. The value runs until the
// next ';' delimiter or the trailing 0xF7. Returns { bytes, redacted }.
function redactWfp(bytes) {
  const KEY = [0x77, 0x66, 0x70, 0x3d]; // "wfp="
  let redacted = false;
  const b = bytes.slice();
  for (let i = 0; i + KEY.length <= b.length; i++) {
    if (KEY.every((k, j) => b[i + j] === k)) {
      for (let j = i + KEY.length; j < b.length && b[j] !== 0x3b && b[j] !== 0xf7; j++) {
        b[j] = 0x2a; // '*'
        redacted = true;
      }
    }
  }
  return { bytes: b, redacted };
}

const hex = (bytes) => bytes.map((x) => x.toString(16).padStart(2, '0')).join(' ');

out.write(`${JSON.stringify({
  type: 'header',
  tool: 'tools/listen.js',
  port: `[${portIndex}] ${portName}`,
  started: new Date().toISOString(),
  ignored: ['timing clock 0xF8', 'active sensing 0xFE'],
  note: 'passive capture; wfp values masked before write (CLAUDE.md Rule 6)',
})}\n`);

let count = 0;
let lastMs = null;
input.on('message', (_delta, message) => {
  const nowMs = Date.now(); // explicit per-message timestamp
  const { bytes, redacted } = redactWfp(Array.from(message));
  const row = {
    t: new Date(nowMs).toISOString(),
    dtMs: lastMs == null ? null : nowMs - lastMs,
    len: bytes.length,
    hex: hex(bytes),
    ...(redacted ? { redacted: true } : {}),
  };
  lastMs = nowMs;
  count++;
  out.write(`${JSON.stringify(row)}\n`);
  if (echo) console.log(`${row.t}  ${row.hex}`);
});

// Receive SysEx; keep ignoring timing clock and active sensing.
input.ignoreTypes(false, true, true);
input.openPort(portIndex);

console.log(`Listening on [${portIndex}] ${portName}`);
console.log(`Capture: ${path.relative(process.cwd(), file)}`);
console.log('Press Ctrl+C to stop.');

process.on('SIGINT', () => {
  console.log(`\n${count} message(s) captured.`);
  input.closePort();
  out.end(() => process.exit(0));
});
