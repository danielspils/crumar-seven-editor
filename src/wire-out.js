// TEMPORARY INSTRUMENTATION — REVERT ME.
//
// Logs every byte the app SENDS to the Seven, so an outbound capture can be
// merged onto one timeline with an inbound `tools/listen.js` capture. It exists
// to answer one question about item 20 of docs/next-1.5.7.md: what, if
// anything, does the app send in the half-second between the last parameter
// write of a String Detuning drag and the instrument's unsolicited `0x71`
// firmware banner?
//
// IT IS NOT A FEATURE AND MUST NOT SURVIVE THE CAPTURE. The bug under
// investigation is about the gap between this app and the instrument, so
// leaving an env-gated logging path inside the send path as a convenience puts
// one more thing in exactly that gap. Keeping it is a separate decision that
// needs its own argument.
//
// ---------------------------------------------------------------------------
// THE SEND PATH MUST NOT CHANGE SHAPE. A tap that alters a single timing
// characteristic makes the capture worthless, so the hot path does two things
// and nothing else: read `Date.now()` and push onto an array. No await, no
// I/O, no formatting, no allocation beyond the row.
//
// Hex, deltas and Rule 6 masking all happen at FLUSH time, on a timer that
// touches nothing the sender touches. The cost of a flush is therefore paid by
// the timer, never by `sendMessage`.
//
// Unset `SEVEN_WIRE_OUT` and `log()` is a bare `return` — the import costs one
// branch per send and the file is never created.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const FILE = process.env.SEVEN_WIRE_OUT || '';
const ARMED = FILE !== '';

// Rule 6 APPLIES OUTBOUND TOO. This is a copy of `redactWfp` from
// tools/listen.js, deliberately rather than a shared import: listen.js opens a
// MIDI port on load and cannot be required from the main process, and this
// file is being deleted. If the tap is ever kept, the two must become one —
// two copies of a redaction rule is how the semicolon bug happened.
//
// Nothing the app sends is known to carry a password. The mask is here because
// Rule 6 is about the CLASS, not the field name, and an outbound `0x30`
// set-global is the one frame shape that could ever carry one.
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

let buf = [];
let lastMs = null;
let started = false;
let stream = null;
let timer = null;

function open() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  stream = fs.createWriteStream(FILE, { flags: 'a' });
  stream.write(`${JSON.stringify({
    type: 'header',
    tool: 'src/wire-out.js (TEMPORARY outbound tap)',
    direction: 'outbound — bytes this app sent to the instrument',
    started: new Date().toISOString(),
    note: 'log-only tap; wfp values masked before write (CLAUDE.md Rule 6). '
        + 'Timestamps are Date.now() taken AT the sendMessage call; rows are '
        + 'formatted and written later, off the send path.',
  })}\n`);
  // Flushing on a timer, not per message, is what keeps the send path clean.
  // 250ms bounds how much is lost if the app dies; the exit hooks cover a
  // clean quit.
  timer = setInterval(flush, 250);
  if (timer.unref) timer.unref();
  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) process.on(sig, flush);
  started = true;
}

function flush() {
  if (!buf.length || !stream) return;
  const rows = buf;
  buf = [];
  let out = '';
  for (const r of rows) {
    const { bytes, redacted } = redactWfp(r.b);
    out += `${JSON.stringify({
      t: new Date(r.t).toISOString(),
      dtMs: lastMs == null ? null : r.t - lastMs,
      len: bytes.length,
      hex: hex(bytes),
      ...(redacted ? { redacted: true } : {}),
    })}\n`;
    lastMs = r.t;
  }
  stream.write(out);
}

// THE HOT PATH. Called from seven-midi.js immediately before every
// `output.sendMessage`. Keep it this short.
function log(bytes) {
  if (!ARMED) return;
  const t = Date.now();
  if (!started) open();
  buf.push({ t, b: Array.from(bytes) });
}

module.exports = { log, armed: ARMED };
