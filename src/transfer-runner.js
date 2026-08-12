'use strict';

// Transfer: putting a setlist's patches onto the instrument, one preset at a
// time. This is the only feature that CHANGES what the Seven holds after the
// power is cycled, so it is the most careful thing in the app.
//
// The Seven has no store opcode. The app loads each patch into the edit buffer
// and the player holds a preset button for three seconds to keep it. That is
// not a limitation to work around — it is the shape of the feature, and every
// step here is built to make the human half obvious rather than hidden.
//
// Rules, all of them deliberate:
//   - BANK 1 IS BLOCKED. It holds the factory presets. This is our own rule,
//     not the instrument's, and it is enforced here rather than in the UI so
//     no future caller can route around it.
//   - The whole run is pre-flighted before anything is sent: every sound is
//     resolved against the CONNECTED unit's table, and a sound it lacks stops
//     the run before the first write, naming what is missing.
//   - Nothing advances on a timer. Each slot waits for the player to say the
//     hold is done, because only they can see the panel.
//   - Stopping is always allowed, and what was written stays written. The
//     report says exactly which presets changed and which did not.

const { EventEmitter } = require('node:events');

const SLOTS_PER_BANK = 8;
const BLOCKED_BANK = 1;

class TransferRunner extends EventEmitter {
  constructor({ midi, store, sender }) {
    super();
    this.midi = midi;
    this.store = store;
    this.sender = sender;
    this.running = false;
    this.cancelled = false;
    this.state = null;
  }

  // Resolve a setlist against the connected instrument WITHOUT sending
  // anything. Returns what will happen, so the UI can show it and the user can
  // decide with the facts in front of them.
  preflight(setlistIndex, bank) {
    if (bank === BLOCKED_BANK) {
      return { ok: false, error: 'Bank 1 holds the factory presets and cannot be written to.' };
    }
    if (!Number.isInteger(bank) || bank < 1 || bank > 4) {
      return { ok: false, error: `There is no bank ${bank}.` };
    }
    if (!this.midi || this.midi.state !== 'connected') {
      return { ok: false, error: 'The Seven is not connected.' };
    }
    const setlist = this.store.readSetlists()[setlistIndex];
    if (!setlist) return { ok: false, error: 'That setlist no longer exists.' };

    const table = (this.midi.soundTable && this.midi.soundTable.sounds) || [];
    const known = new Set(table.map((s) => s.name));
    const entries = this.store.list().patches;

    const slots = setlist.slots.map((ref, i) => {
      const slot = { slot: i, ref, name: null, soundName: null, action: 'skip', reason: null };
      if (!ref) {
        slot.reason = 'empty — this preset is left alone';
        return slot;
      }
      if (ref.startsWith('sound:')) {
        slot.soundName = ref.slice('sound:'.length);
        slot.name = slot.soundName;
        slot.action = known.has(slot.soundName) ? 'send-sound' : 'blocked';
        if (slot.action === 'blocked') slot.reason = `this instrument has no “${slot.soundName}”`;
        return slot;
      }
      const entry = entries.find((e) => e.file === ref && !e.invalid);
      if (!entry) {
        slot.action = 'blocked';
        slot.reason = 'the patch file is missing from the library';
        return slot;
      }
      slot.name = entry.name;
      slot.soundName = entry.soundName;
      slot.action = known.has(entry.soundName) ? 'send' : 'blocked';
      if (slot.action === 'blocked') slot.reason = `this instrument has no “${entry.soundName}”`;
      return slot;
    });

    const blocked = slots.filter((s) => s.action === 'blocked');
    const willWrite = slots.filter((s) => s.action === 'send' || s.action === 'send-sound');
    return {
      ok: blocked.length === 0,
      bank,
      setlist: setlist.name,
      slots,
      willWrite: willWrite.length,
      blocked,
      // Said plainly because it is the part people regret: this replaces
      // presets that are on the instrument now.
      warning: `Bank ${bank}'s ${willWrite.length} preset${willWrite.length === 1 ? '' : 's'} ` +
        'will be replaced, one at a time, as you hold each preset button.',
    };
  }

  // Begins a walk. Nothing is sent until nextSlot() is called, so a caller can
  // set up its UI first and the instrument is never touched by starting.
  start(setlistIndex, bank) {
    if (this.running) throw new Error('A transfer is already running');
    const plan = this.preflight(setlistIndex, bank);
    if (!plan.ok) return plan;
    this.running = true;
    this.cancelled = false;
    this.state = {
      bank,
      setlistIndex,
      slots: plan.slots,
      index: -1,
      sent: [],      // slots loaded into the buffer
      confirmed: [], // slots the player said they stored
    };
    return { ...plan, started: true };
  }

  // Loads the next slot that has something to send. Returns the step for the
  // UI to describe, or a finished report when there are none left.
  async nextSlot() {
    if (!this.running) throw new Error('No transfer is running');
    const st = this.state;
    for (let i = st.index + 1; i < st.slots.length; i++) {
      const slot = st.slots[i];
      if (slot.action !== 'send' && slot.action !== 'send-sound') continue;
      st.index = i;
      const patch = slot.action === 'send-sound'
        ? { sound: { name: slot.soundName }, params: {} }
        : this._patchFor(slot.ref);
      await this.sender.send(patch);
      st.sent.push(i);
      const step = {
        slot: i,
        preset: i + 1,
        bank: st.bank,
        name: slot.name,
        soundName: slot.soundName,
        // The instruction is the point of the whole feature.
        instruction: `Hold preset ${i + 1} on the Seven for three seconds.`,
        done: false,
      };
      this.emit('event', { type: 'transfer-step', ...step });
      return step;
    }
    return this.finish();
  }

  // The player says the hold is done. We cannot verify it — no frame reports a
  // store — so this records what they told us and says so in the report.
  confirmSlot() {
    if (!this.running) throw new Error('No transfer is running');
    if (this.state.index >= 0) this.state.confirmed.push(this.state.index);
    return this.nextSlot();
  }

  cancel() {
    if (!this.running) return null;
    this.cancelled = true;
    return this.finish();
  }

  finish() {
    const st = this.state || { confirmed: [], sent: [], slots: [], bank: null };
    const report = {
      type: 'transfer-done',
      bank: st.bank,
      cancelled: this.cancelled,
      confirmed: st.confirmed.map((i) => i + 1),
      loadedNotConfirmed: st.sent.filter((i) => !st.confirmed.includes(i)).map((i) => i + 1),
      total: st.slots.filter((s) => s.action === 'send' || s.action === 'send-sound').length,
      // Never claim more than we know. A confirmed slot is one the PLAYER said
      // they stored; the instrument does not report stores.
      note: 'Presets are listed as stored because you confirmed the hold — the Seven does not report stores.',
    };
    this.running = false;
    this.state = null;
    this.emit('event', report);
    return report;
  }

  _patchFor(file) {
    const parsed = this.store.readFile(file);
    if (!parsed.library) throw new Error(`${file} is not readable`);
    const patch = parsed.library.patches[0];
    if (!patch) throw new Error(`${file} has no patch in it`);
    return patch;
  }
}

module.exports = { TransferRunner, SLOTS_PER_BANK, BLOCKED_BANK };
