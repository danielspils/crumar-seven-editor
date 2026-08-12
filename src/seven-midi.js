'use strict';

// Main-process MIDI layer for the Crumar Seven. Everything SysEx lives here —
// the renderer speaks only in decoded events and high-level calls routed
// through preload.js (the swap seam). Protocol facts come from docs/protocol.md
// (FW 1.37, live-verified); nothing here guesses a frame format.
//
// Three rules this module enforces in code, not convention:
//
// 1. wfp (the instrument's plaintext Wi-Fi password, in the 0x33 globals
//    reply) is redacted IN THE PARSE LAYER. A raw 0x33 frame is decoded and
//    discarded inside _onMessage; the password never reaches a log, an event,
//    an IPC message, an error, or disk.
// 2. The liveness probe is mandatory. A port opened mid-SysEx wedges silently
//    (one garbled frame, then permanent silence — captured 2026-08-09), and a
//    STRING-4 round-trip is the only defence. connect() never resolves on an
//    unverified connection.
// 3. If the app changes the Send PC global (glb 3), a pending-restore marker
//    is written to disk BEFORE the write, restored on disconnect, and restored
//    on the next connect if a session died with the marker still present.
//
// One hard-won bus fact (2026-08-09): macOS delivers every device reply to
// EVERY client with the port open — the manufacturer's web editor may be
// listening and requesting alongside us. Reply matching therefore validates
// the echoed id/index wherever the reply carries one, never just the opcode.

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HEADER = [0xf0, 0x73, 0x26, 0x14];
const SYSEX_END = 0xf7;

const OP = {
  SET_PARAM: 0x20, SET_SOUND: 0x46,
  GET_PARAM: 0x22, PARAM_VALUE: 0x23,
  SET_GLOBAL: 0x30, ACK_GLOBAL: 0x31,
  GET_GLOBALS: 0x32, GLOBALS: 0x33,
  GET_SOUND_SPEC: 0x42, SOUND_SPEC: 0x43,
  GET_CURRENT_SOUND: 0x44, CURRENT_SOUND: 0x45,
  SOUND_NAME: 0x47,
  STRING: 0x70, STRING_REPLY: 0x71,
};

const GLB_SEND_PC = 3; // pinned by a captured editor write (30 03 01, ack 31 03)

// The nine globals are addressed 1:1 by index (verified sweep), but WHICH
// setting each index is has only been pinned for three of them, against the
// manufacturer editor's own display:
//
//   2 = Send CC        captured 0x30 frame
//   3 = Send PC        captured 30 03 01 as the editor's Send PC went to YES
//   8 = Memory Protect toggling OFF->ON moved slot 8 and nothing else
//
// The other six match that editor's page order, which is an assumption and not
// evidence (docs/protocol.md keeps `orderUnverified`). Writing an index whose
// meaning is a guess could change any setting on someone's instrument, so the
// gate is here, at the wire, rather than in the UI that happens to call it.
const PINNED_GLOBALS = new Set([2, GLB_SEND_PC, 8]);
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
    else out[key] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SevenMidi
// ---------------------------------------------------------------------------

class SevenMidi extends EventEmitter {
  // userDataDir: where the pending-restore marker lives (userData root).
  // midiBackend: injectable for tests; defaults to @julusian/midi.
  constructor({ userDataDir, midiBackend = null, timeout = 600 } = {}) {
    super();
    this.userDataDir = userDataDir;
    this.midi = midiBackend || require('@julusian/midi');
    this.timeout = timeout;
    this.state = 'disconnected';
    this.firmware = null;
    this.globals = null; // last parsed (wfp already redacted)
    this.sendPcOriginal = null; // glb[3] as found at connect
    this.soundTable = null; // { sounds, fingerprint, readAt }
    this.lastPanelProgram = null; // last Program Change RECEIVED (Send PC on)
    this.input = null;
    this.output = null;
    this._pending = [];
  }

  // --- status ---------------------------------------------------------------

  status() {
    return {
      state: this.state,
      firmware: this.firmware,
      tun: this.globals ? this.globals.tun : null,
      sendPc: this.globals ? this.globals.glb[GLB_SEND_PC] : null,
      soundTable: this.soundTable,
    };
  }

  _setState(state, extra = {}) {
    this.state = state;
    this.emit('event', { type: 'status', ...this.status(), ...extra });
  }

  // --- connect / disconnect -------------------------------------------------

  _findPort(io) {
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
    this._setState('connecting');
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
      this.soundTable = await this.readSoundTable();
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
    if (!Number.isInteger(id) || id < 0 || id > MAX_VALID_PARAM_ID) {
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
    if (!Number.isInteger(id) || id < 0 || id > MAX_VALID_PARAM_ID) {
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

  // --- Send PC (glb 3) with pending-restore marker --------------------------

  _markerPath() {
    return path.join(this.userDataDir, MARKER_FILE);
  }

  // A global the USER asked to change. No pending-restore marker: the marker
  // exists so the app can give back something it borrowed, and a choice the
  // player made is not borrowed.
  async setGlobalOption(index, value) {
    if (this.state !== 'connected') throw new Error('not connected');
    if (!PINNED_GLOBALS.has(index)) {
      throw new Error(`glb ${index} has no verified meaning — refusing to write it`);
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
};
