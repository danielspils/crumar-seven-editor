'use strict';

// Main-process MIDI layer for the Crumar Seven. Everything SysEx lives here —
// the renderer speaks only in decoded events and high-level calls routed
// through preload.js (the swap seam). Protocol facts come from docs/protocol.md
// (FW 1.37, live-verified); nothing here guesses a frame format.
//
// Four rules this module enforces in code, not convention:
//
// 1. NO CREDENTIALS ARE KEPT, of any kind, from any source — the class, not a
//    field name. The Seven volunteers its Wi-Fi password in plaintext in the
//    0x33 globals reply, unprompted, to anyone on the USB port; that is the
//    INSTRUMENT's behaviour, not something this app introduced, and the only
//    thing an app can do about it is decline to keep it. So a raw 0x33 frame
//    is decoded and discarded inside _onMessage, redaction happens in the
//    PARSE layer where no caller can forget it, and UNKNOWN KEYS FROM THAT
//    REPLY ARE DROPPED rather than trusted — the payload is split on ';', so a
//    password containing one breaks into a second pair and a catch-all would
//    store the tail under a key nobody is watching. That shipped in 1.0
//    (docs/protocol.md, CLAUDE.md rule 6). Defending the NAME "wfp" is exactly
//    what let the fragment through.
// 2. The liveness probe is mandatory. A port opened mid-SysEx wedges silently
//    (one garbled frame, then permanent silence — captured 2026-08-09), and a
//    STRING-4 round-trip is the only defence. connect() never resolves on an
//    unverified connection.
// 3. If the app changes the Send PC global (glb 3), a pending-restore marker
//    is written to disk BEFORE the write, restored on disconnect, and restored
//    on the next connect if a session died with the marker still present.
// 4. Connect reads the instrument's OWN parameter table and compares it to the
//    schema. On a mismatch, writes addressed by a schema parameter id (0x20)
//    are refused here, at the seam, so no caller can route around the gate.
//    Reads and device-addressed writes (0x46, Program Change) stay open — see
//    src/param-compat.js for why the line is drawn there.
//
// One hard-won bus fact (2026-08-09): macOS delivers every device reply to
// EVERY client with the port open — the manufacturer's web editor may be
// listening and requesting alongside us. Reply matching therefore validates
// the echoed id/index wherever the reply carries one, never just the opcode.

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  compareParamTables, unreadableVerdict, blockMessage, gateParagraphs,
} = require('./param-compat');

const HEADER = [0xf0, 0x73, 0x26, 0x14];
const SYSEX_END = 0xf7;

const OP = {
  GET_MAX_PARAM_ID: 0x10, MAX_PARAM_ID: 0x11,
  GET_PARAM_SPEC: 0x14, PARAM_SPEC: 0x15,
  SET_PARAM: 0x20, SET_SOUND: 0x46,
  GET_PARAM: 0x22, PARAM_VALUE: 0x23,
  SET_GLOBAL: 0x30, ACK_GLOBAL: 0x31,
  GET_GLOBALS: 0x32, GLOBALS: 0x33,
  GET_SOUND_SPEC: 0x42, SOUND_SPEC: 0x43,
  GET_CURRENT_SOUND: 0x44, CURRENT_SOUND: 0x45,
  SOUND_NAME: 0x47,
  STRING: 0x70, STRING_REPLY: 0x71,
  ACTION: 0x72, ACTION_REPLY: 0x73,
};

// The ONE action payload this app ever sends. 0x0A was observed in the wild —
// the manufacturer's editor asks it on every page load — and re-sent and
// confirmed by us on 2026-08-15 (captures/action-storage-2026-08-15*). Every
// other code in the ACTION space stays observe-only, permanently: it carries
// factory reset and firmware update, and probing a neighbour to learn what it
// does is how you find out what the reset code is.
const ACTION_STORAGE = [0x0a, 0x03];

const GLB_SEND_PC = 3; // pinned by a captured editor write (30 03 01, ack 31 03)

// The nine globals are addressed 1:1 by index (verified sweep), and every
// index's NAME is now pinned against the instrument — Daniel worked down the
// panel's GLOBAL OPTIONS page one field at a time while a passive 0x32 watcher
// sampled the array, and each field moved exactly one slot in page order
// (2026-08-12; docs/protocol.md).
//
// So the gate is no longer about names. It is about VALUES. A field's numbers
// mean nothing until they have been read off the panel beside their labels,
// and sending a number nobody here can describe is how you change a stranger's
// sustain pedal to something neither of you can name. `labels` therefore holds
// only what has actually been SEEN, and a field is offered as a choice only
// when its labels cover its whole range.
//
// As of 2026-08-12 every field is complete: all nine dropdowns were opened and
// photographed, and each shot carries a checkmark on a value already known from
// the wire, which pins the rest of that list by position.
const GLB_FIELDS = [
  { name: 'Channel', max: 16, labels: Object.fromEntries(
    [...Array(16)].map((_, i) => [i, `Ch. ${i + 1}`]).concat([[16, 'TX OFF']])) },
  { name: 'Alt. Channel', max: 15, labels: Object.fromEntries(
    [...Array(16)].map((_, i) => [i, `Ch. ${i + 1}`])) },
  // Note the ORDER. Every other field lists its values in numeric order, but
  // these two put "Yes" above "No" while Yes is 1 — pinned by the editor being
  // captured writing `30 02 00` for No and `30 02 01` for Yes. Read off list
  // position instead and both switches come out backwards.
  { name: 'Send CC', max: 1, labels: { 0: 'No', 1: 'Yes' } },
  { name: 'Send PC', max: 1, labels: { 0: 'No', 1: 'Yes' } },
  { name: 'Midi Soft-Thru', max: 1, labels: { 0: 'OFF', 1: 'ON' } },
  { name: 'Sustain Pol.', max: 1, labels: { 0: 'N.C.', 1: 'N.O.' } },
  { name: 'Volume Type', max: 1, labels: { 0: 'From Preset', 1: 'Global' } },
  { name: 'Velocity Curve', max: 4, labels:
    { 0: 'Softer', 1: 'Soft', 2: 'Normal', 3: 'Hard', 4: 'Harder' } },
  { name: 'Memory Protect', max: 1, labels: { 0: 'OFF', 1: 'ON' } },
];

// Fully named: every value in range has been read off the panel.
const glbComplete = (f) => {
  for (let v = 0; v <= f.max; v++) if (f.labels[v] === undefined) return false;
  return true;
};
GLB_FIELDS.forEach((f) => { f.complete = glbComplete(f); });

const PINNED_GLOBALS = new Set(
  GLB_FIELDS.map((f, i) => (f.complete || f.writable ? i : -1)).filter((i) => i >= 0)
);

const STRING_FIRMWARE = 4; // string index 4 = firmware/build string
const WFP_REDACTED = '[wfp redacted]';
const MAX_VALID_PARAM_ID = 109;

const CONNECT_FAIL_MSG =
  "Couldn't talk to the Seven. Unplug the USB cable, plug it back in, and try again.";

const MARKER_FILE = 'pending-glb-restore.json';

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

function isSevenFrame(msg) {
  return (
    msg.length >= 6 &&
    msg[0] === HEADER[0] && msg[1] === HEADER[1] &&
    msg[2] === HEADER[2] && msg[3] === HEADER[3] &&
    msg[msg.length - 1] === SYSEX_END
  );
}

// ASCII payload after opcode: strip the leading 0x00 pad and any trailing
// newline (frames inside the 0x40 bulk dump carry one; individual replies
// don't — tolerate both).
function payloadText(msg, from = 5) {
  let p = msg.slice(from, -1);
  if (p.length && p[0] === 0x00) p = p.slice(1);
  while (p.length && (p[p.length - 1] === 0x0a || p[p.length - 1] === 0x0d)) p = p.slice(0, -1);
  return Buffer.from(p).toString('latin1');
}

// Parse a 0x33 globals reply, REDACTING wfp. The only 0x33 parse path; never
// returns or retains the password.
function parseGlobals(text) {
  const out = { tun: null, glb: [], wfp: WFP_REDACTED };
  for (const pair of text.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    const val = pair.slice(eq + 1);
    if (key === 'tun') out.tun = Number(val);
    else if (key === 'glb') out.glb = val.split(',').map(Number);
    else if (key === 'wfp') out.wfp = WFP_REDACTED; // never keep the real value
    // UNKNOWN KEYS ARE DROPPED, and the reason is Rule 6 rather than tidiness.
    // The reply is split on ';', so a Wi-Fi password containing a semicolon
    // breaks into a second pair — "wfp=pass;word=secret" — and a catch-all
    // `out[key] = val` then keeps "secret" under a key nobody is watching,
    // straight into the globals snapshot on disk. Found by the test that was
    // finally written for this on 2026-08-17.
    //
    // The KEY is logged and the value never is: a field this build does not
    // know is worth noticing (Rule 2 — the device is the authority, and a new
    // field means the schema wants revisiting), but it cannot be shown,
    // because a fragment of a password is exactly what it might be.
    else console.warn(`[midi] globals reply carried an unknown field "${key}" — dropped`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// SevenMidi
// ---------------------------------------------------------------------------

class SevenMidi extends EventEmitter {
  // userDataDir: where the pending-restore marker lives (userData root).
  // midiBackend: injectable for tests; defaults to @julusian/midi.
  // schemaParams: schema.parameters, for the connect-time comparison against
  //   the instrument's own table. Omitted (tools, tests) means no comparison is
  //   made and nothing is gated — the gate protects app users, and a tool that
  //   talks to the device directly is already outside it.
  constructor({
    userDataDir, midiBackend = null, timeout = 600, emitNotes = false, schemaParams = null,
    schemaFirmware = null,
  } = {}) {
    super();
    this.userDataDir = userDataDir;
    this.schemaParams = schemaParams;
    // Which firmware the schema describes. Named in the banner beside the
    // instrument's own, so both numbers in "built against 1.37 / running 1.22"
    // are read rather than written down.
    this.schemaFirmware = schemaFirmware;
    this.emitNotes = emitNotes; // see _handleNonSysex — off unless a tool asks
    this.midi = midiBackend || require('@julusian/midi');
    this.timeout = timeout;
    this.state = 'disconnected';
    this.firmware = null;
    this.globals = null; // last parsed (wfp already redacted)
    this.sendPcOriginal = null; // glb[3] as found at connect
    this.soundTable = null; // { sounds, fingerprint, readAt }
    this.storage = null; // the device's storage string, verbatim ("4.0GB")
    this.paramTable = null; // { count, params, fingerprint, readAt } — the DEVICE's
    this.paramVerdict = null; // compareParamTables() result, or null when unchecked
    this.lastPanelProgram = null; // last Program Change RECEIVED (Send PC on)
    this.input = null;
    this.output = null;
    this._pending = [];
    this._connecting = null; // in-flight connect(), shared by concurrent callers
  }

  // --- status ---------------------------------------------------------------

  status() {
    return {
      state: this.state,
      firmware: this.firmware,
      tun: this.globals ? this.globals.tun : null,
      sendPc: this.globals ? this.globals.glb[GLB_SEND_PC] : null,
      soundTable: this.soundTable,
      // Verbatim, and unlabelled on purpose: the device says "4.0GB" and does
      // NOT say whether that is total, used or free (docs/protocol.md). Every
      // surface that shows it must say so too.
      storage: this.storage,
      // A SUMMARY of the parameter table, not the table: status is emitted on
      // every state change and 110 specs per event is waste. Callers that need
      // the specs themselves read this.paramTable in the main process.
      params: this.paramTable
        ? {
          count: this.paramTable.count,
          fingerprint: this.paramTable.fingerprint,
          readAt: this.paramTable.readAt,
        }
        : null,
      writes: this.writeGate(),
    };
  }

  // The 0x20 gate, in one place. `allowed` is true when no comparison was made
  // at all (a tool constructing SevenMidi without schemaParams) — the gate
  // reports what it checked, and claims nothing about what it didn't.
  writeGate() {
    if (!this.paramVerdict || this.paramVerdict.ok) {
      return { allowed: true, message: '', paragraphs: [] };
    }
    const opts = { deviceFirmware: this.firmware, appFirmware: this.schemaFirmware };
    return {
      allowed: false,
      // One line for a thrown error; three paragraphs for the banner.
      message: blockMessage(this.paramVerdict, opts),
      paragraphs: gateParagraphs(this.paramVerdict, opts),
    };
  }

  _requireParamWrites() {
    const gate = this.writeGate();
    if (gate.allowed) return;
    const err = new Error(gate.message);
    err.code = 'PARAM_TABLE_MISMATCH';
    throw err;
  }

  // Highest id this instrument will answer for. The device's own count when we
  // have read it; the schema's otherwise. Reads use it too — a foreign unit's
  // parameters are still readable, and backup is the reason this matters.
  _maxParamId() {
    return this.paramTable ? this.paramTable.count - 1 : MAX_VALID_PARAM_ID;
  }

  // What connect is doing right now. Four seconds of an unchanging "Connecting…"
  // reads as a hung app; a counter that moves reads as work (Daniel, 2026-08-14).
  _phase(phase, done = 0, total = 0) {
    this.emit('event', { type: 'connect-progress', phase, done, total });
  }

  _setState(state, extra = {}) {
    this.state = state;
    this.emit('event', { type: 'status', ...this.status(), ...extra });
  }

  // --- connect / disconnect -------------------------------------------------

  // SEVEN_NO_DEVICE: pretend the port isn't there.
  //
  // THE ONE STATE THIS PROJECT COULD NOT TEST. Ten of seventeen scenarios don't
  // call requireDevice(), so they run in whatever state the desk is in — and on
  // the only desk here the Seven is always plugged in. Every automated run this
  // repo has ever done was a CONNECTED run, which is how three disconnected-state
  // bugs reached a user (the expansion double-listing, the 10-vs-11 heading, and
  // "⚠ Not installed" on a sound the owner has). SEVEN_FORCE_MISMATCH cannot
  // cover it: it needs a device, since it synthesises the verdict during connect.
  //
  // It lies HERE, at the port lookup, and nowhere else — so connect() fails
  // through the genuine no-port path, portPresent() answers false for the real
  // reason, and everything downstream is the same code a user without an
  // instrument runs. A flag that synthesised "disconnected" further up would be
  // testing the flag.
  _findPort(io) {
    if (process.env.SEVEN_NO_DEVICE) return -1;
    const n = io.getPortCount();
    for (let i = 0; i < n; i++) {
      if (/seven|crumar/i.test(io.getPortName(i))) return i;
    }
    return -1;
  }

  // Is a Seven on the bus? Opens nothing and sends nothing — port names only,
  // so it is safe to ask repeatedly while disconnected. A name match is not
  // proof the instrument is alive; connect()'s liveness probe is what decides
  // that. This only answers "is it worth trying?".
  portPresent() {
    if (!this.midi) return false;
    let input = null;
    let output = null;
    try {
      input = new this.midi.Input();
      output = new this.midi.Output();
      return this._findPort(input) >= 0 && this._findPort(output) >= 0;
    } catch {
      return false;
    } finally {
      try { if (input) input.closePort(); } catch { /* not open */ }
      try { if (output) output.closePort(); } catch { /* not open */ }
    }
  }

  _openPorts() {
    this.input = new this.midi.Input();
    this.output = new this.midi.Output();
    const ii = this._findPort(this.input);
    const oi = this._findPort(this.output);
    if (ii < 0 || oi < 0) {
      this._closePorts();
      const err = new Error('No Crumar Seven found. Is the USB cable connected?');
      err.code = 'NOT_FOUND';
      throw err;
    }
    this.input.ignoreTypes(false, true, true); // MUST receive SysEx
    this.input.on('message', (_dt, msg) => this._onMessage(msg));
    this.input.openPort(ii);
    this.output.openPort(oi);
  }

  _closePorts() {
    if (this.input) { try { this.input.closePort(); } catch { /* ignore */ } }
    if (this.output) { try { this.output.closePort(); } catch { /* ignore */ } }
    this.input = null;
    this.output = null;
    for (const p of this._pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(new Error('port closed'));
    }
  }

  async connect() {
    if (this.state === 'connected') return this.status();
    // A second caller while the first is still working gets the SAME connect,
    // not another one. The renderer's auto-connect tick and a hand click can
    // arrive together — and two sequences on the wire at once means ~250
    // interleaved requests, each client seeing the other's replies. Measured
    // 2026-08-14: it stretched a 2.6s connect to 4.5s and made the parameter
    // table look 1.7s slower than it is.
    if (this._connecting) return this._connecting;
    this._connecting = this._connect().finally(() => { this._connecting = null; });
    return this._connecting;
  }

  async _connect() {
    this._setState('connecting');
    this._phase('checking');
    try {
      this._openPorts();
      // Liveness probe, mandatory: STRING 4 within 500ms, one full
      // close-reopen-retry, then hard fail. Never proceed unverified.
      try {
        this.firmware = await this._probe(500);
      } catch {
        this._closePorts();
        this._openPorts();
        try {
          this.firmware = await this._probe(500);
        } catch {
          this._closePorts();
          const err = new Error(CONNECT_FAIL_MSG);
          err.code = 'PROBE_FAILED';
          throw err;
        }
      }
      // A marker from a dead session means we changed glb 3 and never put it
      // back. Restore before anything else touches the device.
      await this._restorePendingMarker();
      this.globals = await this.readGlobals();
      this.sendPcOriginal = this.globals.glb[GLB_SEND_PC];
      this._phase('sounds');
      this.soundTable = await this.readSoundTable();
      // One frame, and never fatal: a firmware that does not answer it costs
      // us a string, not the connection.
      try {
        this.storage = await this.readStorage();
      } catch {
        this.storage = null;
      }
      // The parameter table is read INSIDE connect, at the cost of ~1.5s, so
      // that by the time status() says connected the write gate is already
      // decided. Reading it in the background would leave a window where a
      // write is neither allowed nor blocked, which is the exact thing this is
      // here to remove.
      if (this.schemaParams) {
        try {
          this.paramTable = await this.readParamTable();
          this.paramVerdict = compareParamTables(this.schemaParams, this.paramTable.params);
        } catch (err) {
          this.paramTable = null;
          this.paramVerdict = unreadableVerdict(err.message);
        }
        this._applyForcedMismatch();
      }
      this._setState('connected');
      return this.status();
    } catch (err) {
      this._closePorts();
      this.firmware = null;
      this._setState('disconnected', { error: err.message });
      throw err;
    }
  }

  async disconnect() {
    if (this.state === 'disconnected') return this.status();
    try {
      await this._restorePendingMarker();
    } catch { /* device may already be gone; marker stays for next startup */ }
    this._closePorts();
    this.firmware = null;
    this.globals = null;
    this.soundTable = null;
    this.storage = null;
    this.paramTable = null;
    this.paramVerdict = null;
    this.sendPcOriginal = null;
    this.lastPanelProgram = null;
    this._setState('disconnected');
    return this.status();
  }

  async _probe(timeout) {
    const msg = await this._request(
      OP.STRING, [STRING_FIRMWARE, 0x00], OP.STRING_REPLY,
      (m) => m[5] === STRING_FIRMWARE, // echoed string index
      timeout
    );
    return payloadText(msg, 6); // skip the index byte; the rest is the string
  }

  // --- request/reply core ---------------------------------------------------

  _send(opcode, payload = []) {
    if (!this.output) throw new Error('not connected');
    this.output.sendMessage([...HEADER, opcode, ...payload, SYSEX_END]);
  }

  // ONE request at a time. Replies carry no request id: a 0x23 answering a
  // READ and a 0x23 echoing a WRITE of the same parameter are byte-identical,
  // so two overlapping requests can resolve each other's matcher and hand back
  // the wrong value. (Live editing plus the Clavi tab poll did exactly that:
  // a poll reply satisfied a pending write, the UI stored the pre-write value,
  // and the control appeared not to move.) Serialising costs nothing here —
  // every caller already awaits, and a backup issues ~3,600 of these in 48s.
  _request(...args) {
    const run = () => this._requestNow(...args);
    // Failures must not poison the chain for everyone behind them.
    this._chain = (this._chain || Promise.resolve()).then(run, run);
    return this._chain;
  }

  _requestNow(opcode, payload, replyOpcode, validate, timeout = this.timeout) {
    return new Promise((resolve, reject) => {
      const p = {
        match: (m) => m[4] === replyOpcode && (!validate || validate(m)),
        resolve,
        reject,
      };
      p.timer = setTimeout(() => {
        const i = this._pending.indexOf(p);
        if (i >= 0) this._pending.splice(i, 1);
        reject(new Error(`timeout waiting for 0x${replyOpcode.toString(16)}`));
      }, timeout);
      this._pending.push(p);
      this._send(opcode, payload);
    });
  }

  _onMessage(msg) {
    if (!isSevenFrame(msg)) {
      this._handleNonSysex(msg);
      return;
    }
    const op = msg[4];

    // wfp firewall: a 0x33 globals frame is decoded HERE and the raw bytes go
    // no further — not to pending matchers, not to events, not to logs.
    if (op === OP.GLOBALS) {
      const parsed = parseGlobals(payloadText(msg));
      for (let i = 0; i < this._pending.length; i++) {
        const p = this._pending[i];
        if (p.globals) {
          this._pending.splice(i, 1);
          clearTimeout(p.timer);
          p.resolve(parsed);
          return;
        }
      }
      return; // unsolicited or another client's read: drop, never surface
    }

    for (let i = 0; i < this._pending.length; i++) {
      const p = this._pending[i];
      if (!p.globals && p.match(msg)) {
        this._pending.splice(i, 1);
        clearTimeout(p.timer);
        p.resolve(msg);
        // 0x45 doubles as the recall/sound-change broadcast; fall through so
        // listeners see it even when it also answered a request.
        if (op !== OP.CURRENT_SOUND) return;
        break;
      }
    }

    if (op === OP.CURRENT_SOUND) {
      // F0 .. 45 <binary soundId> <ascii first digit> F7 — fires on every
      // preset recall (followed by a CC burst) and every sound change (not).
      // A recall opens a BURST: this frame, then the 22 panel CCs, closed by
      // the Program Change ~55ms later. Assembled here because it is one event
      // on the wire even though it arrives as 24 messages, and because what it
      // CARRIES is the only way to tell a store from a tap — the two are
      // identical frame for frame (captures/store-hold-2026-08-12-notes.md).
      this._burst = { soundId: msg[5], ccs: [] };
      this.emit('event', { type: 'current-sound', soundId: msg[5] });
    } else if (op === OP.SOUND_NAME) {
      this.emit('event', {
        type: 'sound-name', soundId: msg[5], name: payloadText(msg, 6),
      });
    }
  }

  _handleNonSysex(msg) {
    const status = msg[0] & 0xf0;
    // Note-on is OFF by default. The app has no use for it and a played chord
    // would push a dozen events per second through the IPC that carries recall
    // bursts — noise in the one channel that has to stay legible. The key-range
    // tool asks for it explicitly, because naming the key you just pressed is
    // the whole job there.
    if (this.emitNotes && status === 0x90 && msg[2] > 0) {
      this.emit('event', { type: 'note-on', note: msg[1], velocity: msg[2] });
      return;
    }
    if (status === 0xb0) {
      if (this._burst) this._burst.ccs.push([msg[1], msg[2]]);
      this.emit('event', { type: 'panel-cc', cc: msg[1], value: msg[2] });
      return;
    }
    if (status === 0xc0) {
      // Program Change from the panel (Send PC on): 0-based global slot.
      // Note: during a backup run the device may echo the PCs we send; the
      // runner snapshots this BEFORE sending anything.
      this.lastPanelProgram = msg[1];
      this.emit('event', {
        type: 'program-change',
        program: msg[1],
        bank: Math.floor(msg[1] / 8) + 1,
        preset: (msg[1] % 8) + 1,
      });
      // The PC closes the burst the 0x45 opened. The fingerprint is the sound
      // id and the CC bytes as they arrived — compared, never decoded: how a
      // CC maps onto a parameter's range is still unverified for sub-127-max
      // params (protocol.md open item 8), so these are opaque evidence that
      // the slot's contents did or did not change.
      if (this._burst) {
        const { soundId, ccs } = this._burst;
        this._burst = null;
        this.emit('event', {
          type: 'recall-burst',
          program: msg[1],
          soundId,
          fingerprint: `${soundId}|${ccs.map(([c, v]) => `${c}:${v}`).join(',')}`,
        });
      }
    }
    // Panel moves announce themselves by CC (the 22 fixed panel CCs, flag=1
    // params — protocol.md). The VALUE is not decoded here and never should
    // be: how a CC value maps onto a parameter's range has not been
    // demonstrated by the device, and guessing it would put invented numbers
    // in front of the user. The arrival is the signal — "this parameter just
    // changed on the panel" — and the value is then read back over SysEx,
    // which is authoritative.
  }

  // --- reads ----------------------------------------------------------------

  readGlobals() {
    // Special-cased: the resolver receives the PARSED, wfp-redacted object.
    return new Promise((resolve, reject) => {
      const p = { globals: true, resolve, reject };
      p.timer = setTimeout(() => {
        const i = this._pending.indexOf(p);
        if (i >= 0) this._pending.splice(i, 1);
        reject(new Error('timeout waiting for globals'));
      }, this.timeout);
      this._pending.push(p);
      this._send(OP.GET_GLOBALS);
    });
  }

  // 0x22 -> 0x23 "id|key|value|<4th>". The 4th field mirrored the value in
  // every capture so far (127 when value 127, 64 when value 64) — it is NOT
  // max; meaning unpinned, so it isn't surfaced. Validates the echoed id so a
  // concurrent client's reads can't satisfy our request.
  async readParamValue(id) {
    // Reads are NOT gated: a wrong id on a foreign unit reads a wrong number
    // into a file we can re-read, and backup on an instrument we do not fully
    // know is still worth having. The range follows the device's own count.
    if (!Number.isInteger(id) || id < 0 || id > this._maxParamId()) {
      throw new Error(`param id out of range: ${id}`);
    }
    const msg = await this._request(
      OP.GET_PARAM, [0x00, (id >> 7) & 0x7f, id & 0x7f], OP.PARAM_VALUE,
      (m) => {
        const f = payloadText(m).split('|');
        return Number(f[0]) === id;
      }
    );
    const f = payloadText(msg).split('|');
    return { id, key: f[1], value: Number(f[2]) };
  }

  // --- Writes to the EDIT BUFFER --------------------------------------------
  // Neither of these stores anything. The Seven has no store opcode: keeping
  // what you hear needs a three-second panel hold, by the user, on the
  // instrument. Every caller must say so rather than implying otherwise.

  // F0 .. 20 00 <idHi> <idLo> <value> F7 — same addressing as a read, then a
  // single value byte (protocol.md, verified against a full 0-127 drag). The
  // device answers with a 0x23 carrying the value it actually took, so the
  // write verifies itself; the caller compares and decides what a mismatch
  // means. Values are clamped to 7 bits HERE because a byte over 0x7F would
  // corrupt the frame itself — range clamping against a parameter's real max
  // is the schema's job, upstream.
  async setParamValue(id, value) {
    // The gate, at the seam. Every 0x20 in the app arrives here — patch sends,
    // live edits, transfer — so a caller that forgets to check still cannot
    // push our parameter ids at an instrument whose ids we have not verified.
    this._requireParamWrites();
    if (!Number.isInteger(id) || id < 0 || id > this._maxParamId()) {
      throw new Error(`param id out of range: ${id}`);
    }
    if (!Number.isInteger(value)) throw new Error(`param ${id}: value must be an integer`);
    const v = Math.max(0, Math.min(127, value));
    const msg = await this._request(
      OP.SET_PARAM, [0x00, (id >> 7) & 0x7f, id & 0x7f, v], OP.PARAM_VALUE,
      (m) => Number(payloadText(m).split('|')[0]) === id
    );
    const f = payloadText(msg).split('|');
    return { id, key: f[1], value: Number(f[2]), requested: v };
  }

  // F0 .. 46 <soundId> F7 — ONE binary byte, no pad (unlike a parameter).
  // Confirmed by the 0x45 the device broadcasts back. Engine parameters
  // survive a sound change, which is why a sound can be sent on its own.
  async setSound(id) {
    if (!Number.isInteger(id) || id < 0 || id > 127) {
      throw new Error(`sound id out of range: ${id}`);
    }
    await this._request(
      OP.SET_SOUND, [id & 0x7f], OP.CURRENT_SOUND, (m) => m[5] === (id & 0x7f)
    );
    return id;
  }

  async currentSound() {
    const msg = await this._request(OP.GET_CURRENT_SOUND, [], OP.CURRENT_SOUND);
    return msg[5]; // binary id; never combine with the ASCII digit
  }

  // Sound table: enumerate 0x42 (pad + single binary id byte — NOT the
  // two-byte param addressing) until the device echoes an id with an empty
  // name, which is how it answers past the end of the table. Deterministic and
  // quiet — the 0x40 alternative streams a full self-description dump.
  async readSoundTable() {
    const sounds = [];
    for (let id = 0; id <= 127; id++) {
      const msg = await this._request(
        OP.GET_SOUND_SPEC, [0x00, id & 0x7f], OP.SOUND_SPEC,
        (m) => m[5] === id // echoed binary id
      );
      const f = payloadText(msg, 6).split('|');
      const name = (f[2] || '').trim();
      if (!name) break; // out-of-range echo: "…|0|" with an empty name
      sounds.push({ id, sampled: f[1] === '1', name });
    }
    const fingerprint = crypto
      .createHash('sha256')
      .update(sounds.map((s) => `${s.id}|${s.sampled ? 1 : 0}|${s.name}`).join('\n'))
      .digest('hex')
      .slice(0, 16);
    return { sounds, fingerprint, readAt: new Date().toISOString() };
  }

  // ACTION 0x0A. Returns the string exactly as the device gave it — no
  // parsing, no unit conversion, no inference about what it measures.
  async readStorage() {
    const msg = await this._request(
      OP.ACTION, ACTION_STORAGE, OP.ACTION_REPLY,
      (m) => m[5] === 0x01 && m[6] === 0x0a // echoed action code
    );
    return Buffer.from(msg.slice(7, -1)).toString('latin1').trim() || null;
  }

  // --- The instrument's own parameter table ---------------------------------

  // How many parameters this unit has. Reply payload is [0x00, hi, lo], seven
  // bits each. On FW 1.37 it answers 110 while the real ids are 0–109, so the
  // number is a COUNT, not a max id (docs/protocol.md, verified capture).
  async readParamCount() {
    const msg = await this._request(OP.GET_MAX_PARAM_ID, [], OP.MAX_PARAM_ID);
    const p = msg.slice(5, -1);
    const count = ((p[1] || 0) << 7) | (p[2] || 0);
    // A count outside this range is not a firmware we can reason about; it is
    // a garbled frame or a different device answering. Refuse rather than
    // enumerate for a minute and a half.
    if (!Number.isInteger(count) || count < 1 || count > 512) {
      throw new Error(`the instrument reported ${count} parameters, which cannot be right`);
    }
    return count;
  }

  // Enumerate every spec with 0x14 -> 0x15: "id|group|key|label|cc|max|value|flag".
  //
  // Bounded by the reported count and NEVER one past it. Enumerating until the
  // device stops answering does not work here: id 110 on FW 1.37 is a sentinel
  // that returns a malformed spec with a garbage key and nonsense numbers
  // (docs/protocol.md), so "keep going until it looks wrong" would read that
  // garbage as a parameter.
  //
  // Not the 0x12 bulk dump — it works once and is then ignored until some
  // unknown condition resets it — and not 0x40, which triggers the entire
  // self-description stream. Per-id is deterministic and idempotent, the same
  // reason readSoundTable enumerates 0x42.
  async readParamTable() {
    const count = await this.readParamCount();
    const specs = new Array(count).fill(null);

    const fetchOne = async (id) => {
      try {
        const msg = await this._request(
          OP.GET_PARAM_SPEC, [0x00, (id >> 7) & 0x7f, id & 0x7f], OP.PARAM_SPEC,
          (m) => Number(payloadText(m).split('|')[0]) === id // echoed id: another
          // client on the port may be requesting specs of its own (macOS
          // delivers every reply to everyone).
        );
        const f = payloadText(msg).split('|');
        if (f.length < 8) return; // malformed: leave the gap for the retry pass
        // THE WHOLE REPLY: id | group | key | label | cc | max | value | flag.
        // Every field is kept, because a report built from this table is meant
        // to be enough to write a schema for an unknown firmware, and group,
        // cc and flag are half of what a schema entry is. `value` is the
        // CURRENT value at read time, not a factory default — it is kept for
        // completeness and labelled as what it is wherever it surfaces.
        specs[id] = {
          id, group: f[1], key: f[2], label: f[3],
          cc: Number(f[4]), max: Number(f[5]), value: Number(f[6]), flag: Number(f[7]),
        };
      } catch { /* dropped or timed out; the retry pass picks it up */ }
    };

    for (let id = 0; id < count; id++) {
      await fetchOne(id);
      // Every fifth, plus the last: often enough that the number is visibly
      // moving, rare enough that the IPC channel isn't carrying 110 messages
      // to say the same thing.
      if (id % 5 === 4 || id === count - 1) this._phase('params', id + 1, count);
    }
    // A fast burst drops the odd reply (protocol.md: one in 110, id 22). Two
    // more passes over the gaps, then it is a failed read — which BLOCKS, in
    // the same way a mismatch does. An unreadable table is an unverified one.
    for (let pass = 0; pass < 2; pass++) {
      const gaps = specs.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
      if (!gaps.length) break;
      for (const id of gaps) await fetchOne(id);
    }
    const stillMissing = specs.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
    if (stillMissing.length) {
      throw new Error(
        `no answer for parameter${stillMissing.length === 1 ? '' : 's'} ` +
        `${stillMissing.slice(0, 6).join(', ')}${stillMissing.length > 6 ? '…' : ''}`
      );
    }

    const fingerprint = crypto
      .createHash('sha256')
      .update(specs.map((p) => `${p.id}|${p.key}|${p.max}`).join('\n'))
      .digest('hex')
      .slice(0, 16);
    return { count, params: specs, fingerprint, readAt: new Date().toISOString() };
  }

  // SEVEN_FORCE_MISMATCH — development only, and PERMANENT rather than a
  // throwaway. The closed-gate path only ever runs for someone whose
  // instrument this project has never met, so on the author's hardware it
  // cannot be reached at all; and it has to be re-checked after any change to
  // the banner, the report builder or the IPC. A test you can only run by
  // owning different hardware is a test nobody runs.
  //
  //   SEVEN_FORCE_MISMATCH=1        pretend this unit reports six fewer
  //                                 parameters than it really does
  //   SEVEN_FORCE_MISMATCH=1.22     the same, and present the firmware as 1.22
  //                                 so the banner's copy can be read
  //   SEVEN_FORCE_MISMATCH=nofw     the same, with an unreadable firmware
  //                                 string — the fallback wording
  //
  // It changes NOTHING about what was read from the instrument: the real table
  // is left in place, so a report saved under the flag carries this unit's
  // genuine parameters. Only the verdict is synthesised, which is the whole
  // point — everything downstream of the verdict is then the real code path.
  _applyForcedMismatch() {
    const flag = process.env.SEVEN_FORCE_MISMATCH;
    if (!flag) return;
    const real = this.paramTable ? this.paramTable.params : [];
    const fewer = real.slice(0, Math.max(0, real.length - 6));
    this.paramVerdict = compareParamTables(this.schemaParams, fewer);
    if (flag === 'nofw') this.firmware = '';
    else if (/^\d+\.\d+$/.test(flag)) this.firmware = `CRUMAR Seven v.${flag} (SEVEN_FORCE_MISMATCH)`;
    console.warn(
      `[seven] SEVEN_FORCE_MISMATCH=${flag}: write gate forced CLOSED. ` +
      'The parameter table read from the instrument is untouched.'
    );
  }

  // --- Send PC (glb 3) with pending-restore marker --------------------------

  _markerPath() {
    return path.join(this.userDataDir, MARKER_FILE);
  }

  // A global the USER asked to change. No pending-restore marker: the marker
  // exists so the app can give back something it borrowed, and a choice the
  // player made is not borrowed.
  async setGlobalOption(index, value) {
    if (this.state !== 'connected') throw new Error('not connected');
    const field = GLB_FIELDS[index];
    if (!PINNED_GLOBALS.has(index)) {
      throw new Error(
        `glb ${index} (${field ? field.name : 'unknown'}) has values this project has ` +
        'not seen named — refusing to write it'
      );
    }
    // Range as observed by cycling the field until it wrapped. A value past it
    // has never been seen at all, so it is not ours to send either.
    if (!Number.isInteger(value) || value < 0 || value > field.max) {
      throw new Error(`glb ${index} (${field.name}) has no value ${value} — refusing to write it`);
    }
    await this._setGlobal(index, value);
    this.globals = await this.readGlobals();
    return { index, value: this.globals.glb[index] };
  }

  async setSendPc(value) {
    if (this.state !== 'connected') throw new Error('not connected');
    const current = this.globals.glb[GLB_SEND_PC];
    if (current === value) return;
    // Marker BEFORE the write: if we die mid-flight, the next startup knows
    // what to put back.
    fs.writeFileSync(
      this._markerPath(),
      JSON.stringify({ index: GLB_SEND_PC, value: current, savedAt: new Date().toISOString() })
    );
    await this._setGlobal(GLB_SEND_PC, value);
    this.globals = await this.readGlobals();
  }

  async restoreSendPc() {
    await this._restorePendingMarker();
    if (this.state === 'connected') this.globals = await this.readGlobals();
  }

  async _restorePendingMarker() {
    let marker = null;
    try {
      marker = JSON.parse(fs.readFileSync(this._markerPath(), 'utf8'));
    } catch {
      return; // no marker — nothing pending
    }
    if (!marker || !Number.isInteger(marker.index)) {
      fs.rmSync(this._markerPath(), { force: true });
      return;
    }
    await this._setGlobal(marker.index, marker.value);
    fs.rmSync(this._markerPath(), { force: true });
  }

  async _setGlobal(index, value) {
    // F0 .. 30 <index> <value> F7 — single bytes, NO pad (unlike params).
    await this._request(
      OP.SET_GLOBAL, [index & 0x7f, value & 0x7f], OP.ACK_GLOBAL,
      (m) => m[5] === (index & 0x7f) // ack echoes the index
    );
  }

  // --- Program Change out (backup driver) -----------------------------------

  sendProgramChange(program) {
    if (!this.output) throw new Error('not connected');
    this.output.sendMessage([0xc0, program & 0x7f]);
  }
}

module.exports = {
  SevenMidi, parseGlobals, payloadText, CONNECT_FAIL_MSG, GLB_SEND_PC, PINNED_GLOBALS,
  GLB_FIELDS,
};
