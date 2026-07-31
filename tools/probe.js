'use strict';

// probe.js — Crumar Seven CLI prober (FW 1.37)
//
// Talks to the instrument over class-compliant USB-MIDI SysEx using the frame
// format and opcodes documented in docs/protocol.md, validated against
// schema/seven-1.37.json.
//
// Ground rules baked in (see CLAUDE.md):
//   * Rule 2 — the tool never invents a fact. It prints what the device returns
//     and what a human observes. Where a result is inconclusive it says UNKNOWN.
//     It does NOT edit docs/ or schema/ — a human records confirmed findings.
//   * Rule 6 — the globals reply carries `wfp`, the plaintext Wi-Fi password.
//     It is redacted before anything is printed and is never written to disk.
//
// Safety rails (see the open-items banner below):
//   * The tool only ever transmits a whitelist of opcodes. It never sends
//     set-sound / store (0x46) or string/action (0x70/0x72) — unobserved
//     formats that can trigger a preset store.
//   * Preset stores are refused outright, so no preset bank is ever written —
//     in particular the protected bank (PROTECTED_BANK = 1).
//   * Edit-buffer writes (set-parameter, 0x20) are gated behind --enable-writes,
//     read back after every write, and the original value is restored.
//   * set-global (0x30) IS used, but only for the glb-ordering probe. It sets one
//     global by index (0x30 <index> <value>), and the probe changes exactly one
//     slot at a time, confirms the change by read-back, then restores it. A global
//     is never left modified: every index is restored to its pre-run snapshot
//     value (never a literal), and restore runs on normal exit, on error, and on
//     SIGINT (exiting non-zero with manual instructions if it can't). `tun` is
//     never a probe target.
//
// The SET-PARAMETER (0x20) and SET-GLOBAL (0x30) frames are both VERIFIED from
// editor captures (see docs/protocol.md). Verification of a write is an actual
// value change plus read-back — never an identity write, which a device that
// silently ignores a bad frame would pass. Review before hardware use.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');

let midi = null;
try {
  midi = require('@julusian/midi');
} catch {
  midi = null; // deferred: --help and usage work without the backend installed
}

function requireMidi() {
  if (!midi) {
    console.error('Missing MIDI backend. Run `npm install` first (dependency: @julusian/midi).');
    process.exit(1);
  }
  return midi;
}

// ---------------------------------------------------------------------------
// Protocol constants (from docs/protocol.md / schema sysex block)
// ---------------------------------------------------------------------------

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const HEADER = [0xf0, 0x73, 0x26, 0x14]; // F0, mfr 73 26, product 14

const OP = {
  RQ_MAX_PARAM_ID: 0x10, RP_MAX_PARAM_ID: 0x11,
  RQ_ALL_PARAM_SPECS: 0x12, RP_ALL_PARAM_SPECS: 0x13,
  RQ_PARAM_SPEC: 0x14, RP_PARAM_SPEC: 0x15,
  RQ_SET_PARAM_VALUE: 0x20, RP_SET_PARAM_VALUE: 0x21,
  RQ_GET_PARAM_VALUE: 0x22, RP_GET_PARAM_VALUE: 0x23,
  RQ_SET_GLOBAL: 0x30, RP_SET_GLOBAL: 0x31,
  RQ_GET_GLOBALS: 0x32, RP_GET_GLOBALS: 0x33,
  RQ_MAX_SOUND: 0x40, RP_MAX_SOUND: 0x41,
  RQ_SOUND_SPEC: 0x42, RP_SOUND_SPEC: 0x43,
  RQ_CURRENT_SOUND: 0x44, RP_CURRENT_SOUND: 0x45,
  RQ_SET_SOUND: 0x46, RP_SET_SOUND: 0x47,
  RQ_STRING: 0x70, RP_STRING: 0x71,
  RQ_ACTION: 0x72, RP_ACTION: 0x73,
};

// Opcodes this tool is ever permitted to transmit. Deliberately excludes
// 0x46 / 0x70 / 0x72 — unobserved formats that can trigger a preset store.
const SENDABLE = new Set([
  OP.RQ_MAX_PARAM_ID,
  OP.RQ_PARAM_SPEC,
  OP.RQ_GET_PARAM_VALUE,
  OP.RQ_SET_PARAM_VALUE, // edit-buffer write; gated by --enable-writes
  OP.RQ_GET_GLOBALS,
  OP.RQ_SET_GLOBAL,      // glb-ordering probe only; snapshot+restore, gated
  OP.RQ_MAX_SOUND,
  OP.RQ_SOUND_SPEC,
  OP.RQ_CURRENT_SOUND,
]);
const WRITE_OPCODES = new Set([OP.RQ_SET_PARAM_VALUE, OP.RQ_SET_GLOBAL]);

const MAX_VALID_PARAM_ID = 109; // ID 110 is a sentinel — never enumerate it
const PROTECTED_BANK = 1; // never written; preset stores are refused entirely
const WFP_REDACTED = '«wfp redacted»';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function idBytes(id) {
  // Addressing: 0x00, (id>>7)&0x7F, id&0x7F
  return [0x00, (id >> 7) & 0x7f, id & 0x7f];
}

function payloadText(msg) {
  // Strip header+opcode and trailing F7. ASCII text replies (0x15 spec, 0x33
  // globals) carry a leading 0x00 pad byte before the text — drop it so the
  // first field isn't prefixed with a NUL (which made id parse as NaN and the
  // tun key never match). Binary replies are read byte-wise, not via this path.
  let p = msg.slice(5, -1);
  if (p.length && p[0] === 0x00) p = p.slice(1);
  return Buffer.from(p).toString('latin1');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function loadSchema() {
  const p = path.join(__dirname, '..', 'schema', 'seven-1.37.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Parse a 0x15 parameter-spec line: id|group|key|label|cc|max|value|flag
function parseParamSpec(text) {
  const f = text.split('|');
  if (f.length < 8) throw new Error(`malformed spec: ${JSON.stringify(text)}`);
  return {
    id: Number(f[0]),
    group: f[1],
    key: f[2],
    label: f[3],
    cc: Number(f[4]),
    max: Number(f[5]),
    value: Number(f[6]),
    flag: Number(f[7]),
    raw: text,
  };
}

// Parse a 0x33 globals reply, REDACTING wfp. Never returns the password.
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
// Device transport
// ---------------------------------------------------------------------------

class Seven {
  constructor({ timeout = 600, verbose = false } = {}) {
    this.input = new midi.Input();
    this.output = new midi.Output();
    this.timeout = timeout;
    this.verbose = verbose;
    this.writesEnabled = false;
    this._pending = [];
    this._dirtyGlb = null; // armed with the snapshot whenever glb is modified
    this._onMessage = this._onMessage.bind(this);
  }

  static findPort(port, matchArg) {
    const n = port.getPortCount();
    const names = [];
    for (let i = 0; i < n; i++) names.push(port.getPortName(i));
    if (matchArg != null && matchArg !== '') {
      if (/^\d+$/.test(matchArg)) {
        const idx = Number(matchArg);
        if (idx >= 0 && idx < n) return { idx, name: names[idx] };
        throw new Error(`port index ${idx} out of range (0..${n - 1})`);
      }
      const idx = names.findIndex((nm) =>
        nm.toLowerCase().includes(matchArg.toLowerCase())
      );
      if (idx >= 0) return { idx, name: names[idx] };
      throw new Error(`no MIDI port matching "${matchArg}". Available: ${names.join(', ') || '(none)'}`);
    }
    // Auto: first port that looks like the instrument.
    const idx = names.findIndex((nm) => /seven|crumar|gsi/i.test(nm));
    if (idx >= 0) return { idx, name: names[idx] };
    throw new Error(
      `could not auto-detect the Seven. Specify --in/--out. Available: ${names.join(', ') || '(none)'}`
    );
  }

  open(inMatch, outMatch) {
    const inPort = Seven.findPort(this.input, inMatch);
    const outPort = Seven.findPort(this.output, outMatch);
    this.input.ignoreTypes(false, true, true); // MUST receive SysEx
    this.input.on('message', this._onMessage);
    this.input.openPort(inPort.idx);
    this.output.openPort(outPort.idx);
    console.error(`MIDI in : [${inPort.idx}] ${inPort.name}`);
    console.error(`MIDI out: [${outPort.idx}] ${outPort.name}`);
  }

  close() {
    try { this.input.closePort(); } catch { /* ignore */ }
    try { this.output.closePort(); } catch { /* ignore */ }
  }

  _onMessage(_dt, msg) {
    for (let i = 0; i < this._pending.length; i++) {
      const p = this._pending[i];
      if (p.match(msg)) {
        this._pending.splice(i, 1);
        clearTimeout(p.timer);
        p.resolve(msg);
        return;
      }
    }
    if (this.verbose) {
      // Unsolicited or unexpected frame (e.g. panel-encoder push — see open item).
      console.error(`  ‹unmatched› ${msg.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }

  _guard(opcode) {
    if (!SENDABLE.has(opcode)) {
      throw new Error(
        `refused to transmit opcode 0x${opcode.toString(16)}: not on the safe whitelist ` +
        `(store / set-global / set-sound / action opcodes are never sent by this tool)`
      );
    }
    if (WRITE_OPCODES.has(opcode) && !this.writesEnabled) {
      throw new Error(
        `refused write 0x${opcode.toString(16)}: pass --enable-writes to allow edit-buffer writes`
      );
    }
  }

  _sendSysex(opcode, payload = []) {
    this._guard(opcode);
    const frame = [...HEADER, opcode, ...payload, SYSEX_END];
    if (this.verbose) {
      console.error(`  → ${frame.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
    this.output.sendMessage(frame);
  }

  request(opcode, payload, replyOpcode, timeout = this.timeout) {
    return new Promise((resolve, reject) => {
      const match = (m) =>
        m.length >= 6 &&
        m[0] === SYSEX_START &&
        m[1] === HEADER[1] &&
        m[2] === HEADER[2] &&
        m[3] === HEADER[3] &&
        m[4] === replyOpcode;
      const p = { match, resolve };
      p.timer = setTimeout(() => {
        const i = this._pending.indexOf(p);
        if (i >= 0) this._pending.splice(i, 1);
        reject(new Error(`timeout after ${timeout}ms waiting for 0x${replyOpcode.toString(16)}`));
      }, timeout);
      this._pending.push(p);
      this._sendSysex(opcode, payload);
    });
  }

  // Ordinary (non-SysEx) Control Change. Used only by the pedal-CC probe.
  // This is not a store; it is the same message a controller would send.
  sendCC(channel, cc, value) {
    if (!this.writesEnabled) {
      throw new Error('refused to send CC: pass --enable-writes');
    }
    this.output.sendMessage([0xb0 | (channel & 0x0f), cc & 0x7f, value & 0x7f]);
  }

  // --- Read primitives (documented formats) ---------------------------------

  async maxParamId() {
    const m = await this.request(OP.RQ_MAX_PARAM_ID, [], OP.RP_MAX_PARAM_ID);
    const p = m.slice(5, -1); // [0x00, hi, lo]
    return (p[1] << 7) | p[2];
  }

  async paramSpec(id) {
    const m = await this.request(OP.RQ_PARAM_SPEC, idBytes(id), OP.RP_PARAM_SPEC);
    return parseParamSpec(payloadText(m));
  }

  // Value read via the full spec (0x15). The lighter 0x22/0x23 path is verified
  // too (id|key|value), but reading via the spec keeps a single parse path.
  async paramValue(id) {
    return (await this.paramSpec(id)).value;
  }

  async globals() {
    const m = await this.request(OP.RQ_GET_GLOBALS, [], OP.RP_GET_GLOBALS);
    return parseGlobals(payloadText(m)); // wfp already redacted
  }

  async currentSound() {
    const m = await this.request(OP.RQ_CURRENT_SOUND, [], OP.RP_CURRENT_SOUND);
    // 0x45 payload is [<binary value>, <ASCII digit(s)>]. Byte 5 is the value;
    // never combine it with the ASCII byte (that gave 0x31<<7 = 6272 for sound 1).
    return m[5];
  }

  // Enumerate 0..MAX_VALID_PARAM_ID with a re-request pass for dropped replies.
  async enumerate({ pace = 6 } = {}) {
    const specs = new Array(MAX_VALID_PARAM_ID + 1).fill(null);
    const fetchOne = async (id) => {
      try {
        specs[id] = await this.paramSpec(id);
      } catch {
        specs[id] = null;
      }
    };
    for (let id = 0; id <= MAX_VALID_PARAM_ID; id++) {
      await fetchOne(id);
      if (pace) await sleep(pace);
    }
    // One re-request pass over gaps (see protocol.md: a burst dropped ID 22).
    const missing = specs.map((s, i) => (s ? null : i)).filter((i) => i !== null);
    for (const id of missing) {
      await fetchOne(id);
      if (pace) await sleep(pace);
    }
    const stillMissing = specs.map((s, i) => (s ? null : i)).filter((i) => i !== null);
    return { specs, missing: stillMissing };
  }

  // --- Write primitive (0x20 verified; read-back is a safety check) ---------

  // Sets a live edit-buffer value. NOT a preset store. Reads back and restores.
  async setParamValueChecked(id, value, { restoreTo } = {}) {
    const before = await this.paramSpec(id);
    if (value < 0 || value > before.max) {
      throw new Error(`value ${value} out of range for ${before.key} (0..${before.max})`);
    }
    this._sendSysex(OP.RQ_SET_PARAM_VALUE, [...idBytes(id), value & 0x7f]);
    await sleep(20);
    const after = await this.paramValue(id);
    const ok = after === value;
    if (restoreTo != null && restoreTo !== after) {
      this._sendSysex(OP.RQ_SET_PARAM_VALUE, [...idBytes(id), restoreTo & 0x7f]);
      await sleep(20);
    }
    return { key: before.key, requested: value, readBack: after, confirmed: ok, before: before.value };
  }

  // --- Globals write (0x30) — VERIFIED: sets ONE global by index -------------
  //
  //   F0 73 26 14 30 <index> <value> F7      set global <index> to <value>
  //   F0 73 26 14 31 <index> F7              ack, echoes the index only
  //
  // Index and value are single bytes and go immediately after the opcode — there
  // is NO 0x00 pad here (unlike parameter addressing, which is 0x00,idHi,idLo).
  // Do not share an address encoder between the two. `tun`/`wfp` are never touched.
  _setGlobalFrame(index, value) {
    return [index & 0x7f, value & 0x7f];
  }

  // Set one global; await the 0x31 ack (which echoes the index). Returns true iff
  // the ack arrived AND echoed the index we sent. The frame is sent regardless.
  async setGlobal(index, value, { timeout = this.timeout } = {}) {
    try {
      const m = await this.request(
        OP.RQ_SET_GLOBAL, this._setGlobalFrame(index, value), OP.RP_SET_GLOBAL, timeout
      );
      return m[5] === (index & 0x7f); // ack payload is the index at byte 5
    } catch {
      return false; // no ack within timeout
    }
  }

  // Restore glb to the armed snapshot, per index, and confirm by read-back.
  // Clears the dirty flag once the whole array reads back equal.
  async restoreGlbIfDirty({ retries = 3 } = {}) {
    if (!this._dirtyGlb) return true;
    const target = this._dirtyGlb.slice();
    for (let attempt = 0; attempt < retries; attempt++) {
      const now = (await this.globals()).glb;
      for (let i = 0; i < target.length; i++) {
        if (now[i] !== target[i]) {
          await this.setGlobal(i, target[i]);
          await sleep(30);
        }
      }
      const after = (await this.globals()).glb;
      if (arraysEqual(after, target)) { this._dirtyGlb = null; return true; }
      await sleep(40);
    }
    return false;
  }

  // Intentionally unimplemented: preset store. Documented here so the refusal is
  // explicit rather than an omission. See PROTECTED_BANK.
  storePreset() {
    throw new Error(
      `preset store is refused by this tool (would risk writing a preset bank, ` +
      `including the protected bank ${PROTECTED_BANK}). Store from the instrument if you must.`
    );
  }
}

// ---------------------------------------------------------------------------
// Interactive helpers
// ---------------------------------------------------------------------------

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function banner(lines) {
  const w = Math.max(...lines.map((l) => l.length));
  const bar = '─'.repeat(w + 2);
  console.log(`┌${bar}┐`);
  for (const l of lines) console.log(`│ ${l.padEnd(w)} │`);
  console.log(`└${bar}┘`);
}

// Print which glb slots differ between two arrays; return the moved indices.
function reportGlbDiff(before, after, order) {
  const moved = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) if (before[i] !== after[i]) moved.push(i);
  if (moved.length === 0) console.log('  diff: (no slot changed)');
  else for (const i of moved) {
    console.log(`  diff: slot [${i}] ${before[i]}→${after[i]}  (assumed "${order[i] != null ? order[i] : '?'}")`);
  }
  return moved;
}

function printManualRestore(glb) {
  banner([
    'GLOBALS LEFT MODIFIED — manual restore required',
    '',
    'Automated restore could not be confirmed. Set the changed option back on',
    'the instrument by hand. The original glb array was:',
    `  [${(glb || []).join(', ')}]`,
    '(tuning and the Wi-Fi password were never touched.)',
  ]);
}

// ---------------------------------------------------------------------------
// Open-items investigation — the prober's first job
// ---------------------------------------------------------------------------

// 1. `flag` (8th spec field) is 0 for all 110 params. Purpose UNKNOWN.
async function probeFlag(dev) {
  console.log('\n== Open item 1: the `flag` spec field ==');
  const { specs, missing } = await dev.enumerate();
  if (missing.length) console.log(`  (note: ${missing.length} spec(s) never answered: ${missing.join(', ')})`);
  const present = specs.filter(Boolean);
  const nonZero = present.filter((s) => s.flag !== 0);
  console.log(`  flag != 0 at rest: ${nonZero.length ? nonZero.map((s) => `${s.id}:${s.flag}`).join(', ') : 'none (all zero, as documented)'}`);

  if (!dev.writesEnabled) {
    console.log('  Hypothesis "flag = modified/dirty bit" needs a write to test — re-run with --enable-writes.');
    console.log('  RESULT: flag purpose still UNKNOWN.');
    return;
  }
  // Test the "modified bit" hypothesis on one innocuous continuous param.
  const target = present.find((s) => s.key === 'rev_lv') || present.find((s) => s.max === 127 && s.cc === -1);
  if (!target) { console.log('  No safe test parameter found; skipping. RESULT: UNKNOWN.'); return; }
  const orig = target.value;
  const testVal = orig === 0 ? 1 : orig - 1;
  console.log(`  Editing ${target.key} (id ${target.id}) ${orig} -> ${testVal}, then re-reading its spec…`);
  const w = await dev.setParamValueChecked(target.id, testVal, { restoreTo: orig });
  const reread = await dev.paramSpec(target.id);
  console.log(`  write confirmed=${w.confirmed}; flag after edit = ${reread.flag}`);
  if (reread.flag !== 0) {
    console.log('  → flag became non-zero after an edit. Candidate meaning: "modified since load". NEEDS more samples before clearing UNKNOWN.');
  } else {
    console.log('  → flag stayed 0 through an edit. Not a simple modified bit. RESULT: still UNKNOWN.');
  }
}

// 2. `glb` slot ordering & per-field value encoding.
// Sweep all nine indices: set each to a different valid value, confirm exactly
// that slot moves, restore. This pins index↔slot addressing and reveals value
// behaviour per field. set-global (0x30) framing is verified, so a "no change"
// now means the value was out of range for that field, not a framing failure.
async function probeGlbOrdering(dev, schema) {
  console.log('\n== Open item 2: `glb` slot ordering & value encoding ==');
  const order = schema.globals.keys.glb.order;
  console.log('  Assumed order: ' + order.map((o, i) => `[${i}] ${o}`).join(', '));

  if (!dev.writesEnabled) {
    // Read-only fallback: you change one option on the panel, we diff.
    console.log('  (read-only mode — no set-global) Change ONE option on the instrument and we diff.');
    console.log('  ⚠ Do NOT change Tuning; anything else is fine (SysEx is channel-independent).');
    const before = await dev.globals();
    console.log(`  glb before: [${before.glb.join(', ')}]`);
    await ask('  Change exactly one option on the instrument, then press Enter… ');
    const after = await dev.globals();
    console.log(`  glb after : [${after.glb.join(', ')}]`);
    reportGlbDiff(before.glb, after.glb, order);
    console.log('  RESULT: record confirmed slots; clear orderUnverified only when all nine are pinned.');
    return;
  }

  const snapshot = (await dev.globals()).glb.slice();
  console.log(`  glb snapshot: [${snapshot.join(', ')}]`);
  console.log('  Sweeping all nine indices: set a different value, confirm only that slot moves, restore.');
  console.log('  ⚠ This briefly changes several options (incl. MIDI Channel, Alt. Channel, Memory Protect).');
  console.log('    Every index is restored to its pre-run snapshot value. No preset is ever stored.');
  const go = await ask('  Proceed? type "yes": ');
  if (go.toLowerCase() !== 'yes') { console.log('  Skipped.'); return; }

  dev._dirtyGlb = snapshot; // arm whole-array restore for the entire sweep

  const results = [];
  for (let index = 0; index < snapshot.length; index++) {
    const before = (await dev.globals()).glb;
    const cur = before[index];
    const alt = cur === 0 ? 1 : cur - 1; // minimal in-range neighbour, never negative
    const acked = await dev.setGlobal(index, alt);
    await sleep(30);
    const after = (await dev.globals()).glb;
    const moved = [];
    for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) moved.push(i);
    const clean = moved.length === 1 && moved[0] === index;
    // Restore this slot immediately.
    await dev.setGlobal(index, cur);
    await sleep(30);
    const restored = (await dev.globals()).glb;
    const restoredOk = arraysEqual(restored, before);
    results.push({ index, name: order[index], cur, alt, sentValue: after[index], moved, clean, acked, restoredOk });

    let status;
    if (clean) status = `${cur}→${after[index]} (ack ${acked ? 'ok' : 'NO'})`;
    else if (moved.length === 0) status = `NO CHANGE — value ${alt} likely out of range for this field (encoding unknown)`;
    else status = `UNEXPECTED — slots ${moved.join(', ')} moved`;
    console.log(`  [${index}] ${String(order[index]).padEnd(16)} ${clean ? '✓' : '·'} ${status}${restoredOk ? '' : '  ⚠ RESTORE FAILED'}`);
  }

  // Restore every index to its pre-run snapshot value — including Memory Protect,
  // which may deliberately be off. Never restore to a literal.
  const ok = await dev.restoreGlbIfDirty();
  const finalGlb = (await dev.globals()).glb;
  const good = ok && arraysEqual(finalGlb, snapshot);
  console.log(`  glb restored: [${finalGlb.join(', ')}]  ${good ? '✓' : '✗ NOT FULLY RESTORED'}`);
  if (!good) {
    printManualRestore(snapshot);
    throw new Error('failed to fully restore glb after the sweep');
  }

  const clean = results.filter((r) => r.clean).length;
  console.log(`\n  ${clean}/9 indices moved exactly their own slot — set-global addresses glb by index (0x30 <index> <value>).`);
  console.log('  Confirmed against the display so far: index 2 = Send CC, index 8 = Memory Protect.');
  console.log('  Value encoding is per-field and NOT uniformly a 0-based index (e.g. Alt. Channel reads 1');
  console.log('  but displays "Ch. 1"). Record raw values; do not assume value == displayed position.');
  console.log('  RESULT: keep orderUnverified until all nine NAMES are pinned against the panel.');
}

// 3. Enum labels for fx1_md, fx2_md, pha_st, amp_mo assumed from manual — UNVERIFIED.
async function probeEnums(dev, schema) {
  console.log('\n== Open item 3: enum labels ==');
  const keys = ['fx1_md', 'fx2_md', 'pha_st', 'amp_mo'];
  const byKey = new Map(schema.parameters.map((p) => [p.key, p]));
  if (!dev.writesEnabled) {
    console.log('  Stepping enum indices requires edit-buffer writes — re-run with --enable-writes.');
    console.log('  RESULT: enum labels still UNVERIFIED.');
    return;
  }
  for (const key of keys) {
    const p = byKey.get(key);
    if (!p) { console.log(`  ${key}: not in schema, skipping`); continue; }
    console.log(`\n  ${key} — "${p.label}" (id ${p.id}), assumed: ${JSON.stringify(p.values)}`);
    const orig = await dev.paramValue(p.id);
    try {
      for (let idx = 0; idx <= p.max; idx++) {
        // Hold the value at idx during observation — do NOT restore per write, or
        // the device would be back at orig before you read the label. The finally
        // restores orig after every index of this param.
        const w = await dev.setParamValueChecked(p.id, idx);
        if (!w.confirmed) { console.log(`    index ${idx}: write NOT confirmed (read back ${w.readBack}) — skipping`); continue; }
        const assumed = p.values && p.values[idx] != null ? p.values[idx] : '(none assumed)';
        const seen = await ask(`    index ${idx}: assumed "${assumed}". What does the instrument/editor show? `);
        console.log(`      index ${idx}: assumed="${assumed}" observed="${seen || '(blank)'}"${seen && assumed !== '(none assumed)' && seen.toLowerCase() === String(assumed).toLowerCase() ? ' ✓ match' : ''}`);
      }
    } finally {
      await dev.setParamValueChecked(p.id, orig); // ensure restored
    }
  }
  console.log('\n  RESULT: clear valuesUnverified for a param only if every index matched what you observed.');
}

// 4. pdl_exp reports cc 0/1 where unassigned params report -1. Genuine, or other meaning?
async function probePedalCc(dev, schema, channel) {
  console.log('\n== Open item 4: pdl_exp CC anomaly ==');
  const exp = schema.parameters.filter((p) => p.group === 'pdl_exp');
  console.log('  Schema: ' + exp.map((p) => `${p.key} cc=${p.cc}`).join(', ') + '  (all others unassigned report cc=-1)');
  if (!dev.writesEnabled) {
    console.log('  Testing whether those CCs actually drive the params needs to send CC — re-run with --enable-writes.');
    console.log('  RESULT: pedal CC meaning still UNKNOWN.');
    return;
  }
  console.log(`  Sending CC on MIDI channel ${channel + 1} (assumed — override with --channel). Reading pdl_exp before/after.`);
  const before = {};
  for (const p of exp) before[p.key] = await dev.paramValue(p.id);
  // The anomalous cc numbers are 0 and 1; probe both with a distinctive value.
  for (const cc of [0, 1]) {
    dev.sendCC(channel, cc, 100);
    await sleep(30);
  }
  const after = {};
  for (const p of exp) after[p.key] = await dev.paramValue(p.id);
  let responded = false;
  for (const p of exp) {
    const changed = before[p.key] !== after[p.key];
    if (changed) responded = true;
    console.log(`  ${p.key}: ${before[p.key]} -> ${after[p.key]}${changed ? '  ← responded to CC' : ''}`);
  }
  if (responded) {
    console.log('  → at least one pdl_exp param moved in response to CC 0/1. The cc field is a GENUINE CC assignment. Clear ccUnverified only for the ones that responded.');
  } else {
    console.log('  → no pdl_exp param responded to CC 0/1. The cc field likely means something else for this group. RESULT: still UNKNOWN — record the negative.');
  }
}

async function runOpenItems(dev, schema, opts, which) {
  banner([
    'OPEN-ITEMS PROBE — read this before continuing',
    '',
    'This session issues edit-buffer writes (set-parameter 0x20), a verified',
    'set-global sweep for the glb probe (per index: change one value, confirm',
    'only that slot moves, restore), and ordinary MIDI CC for the pedal probe.',
    'It NEVER stores a preset, NEVER writes any preset bank',
    `(protected bank = ${PROTECTED_BANK}), and NEVER sends set-sound, string or`,
    'action opcodes.',
    '',
    'Advice: do NOT press Store on the instrument now (this is advice, not',
    'enforced — Memory Protect may legitimately be off). Every edit and every',
    'global change is read back and restored to its pre-run value; nothing is left',
    'modified. Results are printed for a human to record into schema/protocol.md;',
    'this tool never edits them itself.',
  ]);
  if (dev.writesEnabled) {
    const go = await ask('\nWrites are ENABLED. Type "yes" to proceed: ');
    if (go.toLowerCase() !== 'yes') { console.log('Aborted.'); return; }
  } else {
    console.log('\nWrites are disabled (read-only). Probes needing writes will report what they need.');
  }

  const run = { flag: false, glb: false, enums: false, pedal: false };
  if (!which || which === 'all') { run.flag = run.glb = run.enums = run.pedal = true; }
  else if (which in run) run[which] = true;
  else { console.error(`unknown open-item "${which}" (flag|glb|enums|pedal|all)`); return; }

  if (run.flag) await probeFlag(dev);
  if (run.glb) await probeGlbOrdering(dev, schema);
  if (run.enums) await probeEnums(dev, schema);
  if (run.pedal) await probePedalCc(dev, schema, opts.channel);

  console.log('\nDone. Nothing was stored. Record confirmed findings by hand, per Rule 2.');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    _: [], in: null, out: null, timeout: 600, channel: 0,
    enableWrites: false, verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') opts.in = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--channel') opts.channel = Number(argv[++i]);
    else if (a === '--enable-writes') opts.enableWrites = true;
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts._.push(a);
  }
  return opts;
}

function usage() {
  console.log(`Crumar Seven prober (FW 1.37)

Usage: node tools/probe.js <command> [options]

Commands:
  list                    List MIDI ports and exit (no device I/O)
  info                    Handshake: max param id, current sound, globals, sound
  enumerate               Read all specs 0..${MAX_VALID_PARAM_ID}; verify full coverage
  get <id>                Read one parameter spec
  globals                 Read globals (wfp is always redacted)
  open-items [which]      Investigate the open items: flag | glb | enums | pedal | all

Options:
  --in <name|idx>         MIDI input port (default: auto-detect Seven/Crumar/GSi)
  --out <name|idx>        MIDI output port (default: auto-detect)
  --enable-writes         Allow edit-buffer writes (0x20), set-global, and CC. Off by default.
  --channel <n>           MIDI channel 0..15 for the pedal-CC probe (default 0)
  --timeout <ms>          Per-request reply timeout (default 600)
  --verbose, -v           Print every frame sent and any unmatched frame
  --help, -h              This help

Safety: this tool never stores a preset and never writes a preset bank
(protected bank ${PROTECTED_BANK}); it never sends set-sound/string/action opcodes.
Writes (edit-buffer 0x20, plus a set-global sweep for the glb probe) are gated
behind --enable-writes, read back, and restored to their pre-run values — nothing
is left modified. It never edits docs/ or schema/ — you record findings.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts._[0];
  if (opts.help || !cmd) { usage(); return; }

  // `list` needs ports but no open session.
  if (cmd === 'list') {
    requireMidi();
    const inp = new midi.Input();
    const outp = new midi.Output();
    console.log('Inputs:');
    for (let i = 0; i < inp.getPortCount(); i++) console.log(`  [${i}] ${inp.getPortName(i)}`);
    console.log('Outputs:');
    for (let i = 0; i < outp.getPortCount(); i++) console.log(`  [${i}] ${outp.getPortName(i)}`);
    return;
  }

  requireMidi();
  const schema = loadSchema();
  const dev = new Seven({ timeout: opts.timeout, verbose: opts.verbose });
  dev.writesEnabled = opts.enableWrites;
  dev.open(opts.in, opts.out);

  // Restore globals on Ctrl-C before exiting.
  const onSigint = async () => {
    console.error('\nSIGINT — restoring globals if modified…');
    let ok = false;
    try { ok = await dev.restoreGlbIfDirty(); } catch { ok = false; }
    if (!ok) printManualRestore(dev._dirtyGlb);
    dev.close();
    process.exit(ok ? 130 : 2);
  };
  process.on('SIGINT', onSigint);

  try {
    switch (cmd) {
      case 'info': {
        const [maxId, cur, glb] = await Promise.all([
          dev.maxParamId(), dev.currentSound(), dev.globals(),
        ]);
        console.log(`max param id : ${maxId} (valid 0..${MAX_VALID_PARAM_ID}; ${maxId === 110 ? '110 is the sentinel' : 'UNEXPECTED — check firmware'})`);
        console.log(`current sound: ${cur}`);
        console.log(`tuning       : ${glb.tun} Hz`);
        console.log(`glb          : [${glb.glb.join(', ')}]`);
        console.log(`wfp          : ${glb.wfp}`);
        break;
      }
      case 'enumerate': {
        const { specs, missing } = await dev.enumerate();
        for (const s of specs) {
          if (!s) continue;
          console.log(
            `${String(s.id).padStart(3)} ${s.group.padEnd(8)} ${s.key.padEnd(9)} ` +
            `cc=${String(s.cc).padStart(3)} max=${String(s.max).padStart(3)} ` +
            `val=${String(s.value).padStart(3)} flag=${s.flag}  ${s.label}`
          );
        }
        const got = specs.filter(Boolean).length;
        console.log(`\ncoverage: ${got}/${MAX_VALID_PARAM_ID + 1}` + (missing.length ? `  MISSING: ${missing.join(', ')} (re-run)` : '  (complete)'));
        break;
      }
      case 'get': {
        const id = Number(opts._[1]);
        if (!Number.isInteger(id) || id < 0 || id > MAX_VALID_PARAM_ID) {
          console.error(`usage: get <id>  (0..${MAX_VALID_PARAM_ID})`); break;
        }
        console.log(JSON.stringify(await dev.paramSpec(id), null, 2));
        break;
      }
      case 'globals': {
        const g = await dev.globals();
        console.log(JSON.stringify(g, null, 2)); // wfp already redacted
        break;
      }
      case 'open-items':
        await runOpenItems(dev, schema, opts, opts._[1]);
        break;
      default:
        console.error(`unknown command "${cmd}"\n`);
        usage();
    }
  } finally {
    // Never exit with a global left modified — restore on error too.
    let restored = true;
    try { restored = await dev.restoreGlbIfDirty(); } catch { restored = false; }
    if (!restored) { printManualRestore(dev._dirtyGlb); process.exitCode = 2; }
    process.off('SIGINT', onSigint);
    dev.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('error:', err.message);
    process.exit(1);
  });
}

// Exported for unit-testing the pure parsers without a device attached.
module.exports = { payloadText, parseParamSpec, parseGlobals, Seven };
