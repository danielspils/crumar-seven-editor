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
//   - EACH SLOT IS RECALLED ON THE INSTRUMENT BEFORE IT IS LOADED. A Program
//     Change moves the Seven to that bank and preset (device-verified: PC
//     recalls 0-based global slots across all four banks), so the panel the
//     player is looking at lights the same button the app is asking them to
//     hold. The app cannot see which bank the panel is on, and it cannot see
//     where a three-second hold lands — putting the instrument on the target
//     slot ourselves is the only way to remove that gap. If the recall is not
//     acknowledged, the walk STOPS rather than write a preset blind.

const { EventEmitter } = require('node:events');

const SLOTS_PER_BANK = 8;
const BLOCKED_BANK = 1;
const RECALL_TIMEOUT_MS = 1500;

class TransferRunner extends EventEmitter {
  constructor({ midi, store, sender }) {
    super();
    this.midi = midi;
    this.store = store;
    this.sender = sender;
    this.running = false;
    this.cancelled = false;
    this.state = null;
    this.priorProgram = null; // where the panel was before selectBank() moved it
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

  // Move the instrument to a bank the moment the user picks it, BEFORE the
  // "replace this bank?" question. The point is that the question stops being
  // abstract: the Seven is sitting on that bank, so you can play what you are
  // about to overwrite. Nothing is written — a recall only touches the edit
  // buffer.
  //
  // Where the panel was is snapshotted first, so releaseBank() can put it back
  // if the run never happens. That is only knowable when Send PC is on and the
  // panel has recalled something since connect; when it isn't, we say so by
  // leaving the instrument where we put it rather than guessing a slot.
  async selectBank(bank) {
    if (this.running) return { ok: false, error: 'A transfer is already running' };
    if (bank === BLOCKED_BANK) {
      return { ok: false, error: 'Bank 1 holds the factory presets and cannot be written to.' };
    }
    if (!Number.isInteger(bank) || bank < 1 || bank > 4) {
      return { ok: false, error: `There is no bank ${bank}.` };
    }
    if (!this.midi || this.midi.state !== 'connected') {
      return { ok: false, error: 'The Seven is not connected.' };
    }
    const prior = this.midi.lastPanelProgram;
    const program = (bank - 1) * SLOTS_PER_BANK;
    try {
      await this._recall(program);
    } catch (err) {
      // Not fatal: the walk recalls each slot again and stops there if the
      // instrument is really not answering. Nothing has been written.
      return { ok: false, error: String(err.message || err) };
    }
    this.priorProgram = Number.isInteger(prior) ? prior : null;
    return { ok: true, bank, program };
  }

  // Put the panel back where it was, for when the user chose a bank and then
  // backed out. A no-op once a walk has started — by then the instrument is
  // meant to be sitting on the bank being written.
  async releaseBank() {
    const prior = this.priorProgram;
    this.priorProgram = null;
    if (this.running || prior === null || prior === undefined) return { ok: false };
    try {
      await this._recall(prior);
      return { ok: true, program: prior };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // Begins a walk. Nothing is sent until nextSlot() is called, so a caller can
  // set up its UI first and the instrument is never touched by starting.
  start(setlistIndex, bank) {
    if (this.running) throw new Error('A transfer is already running');
    const plan = this.preflight(setlistIndex, bank);
    if (!plan.ok) return plan;
    this.running = true;
    this.cancelled = false;
    this.priorProgram = null; // the walk owns the panel from here
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
      // Move the instrument to the slot FIRST — a recall replaces the edit
      // buffer, so doing it after the load would throw the load away.
      try {
        await this._recall((st.bank - 1) * SLOTS_PER_BANK + i);
      } catch (err) {
        return this.finish(`The Seven did not answer the recall for preset ${i + 1}, so nothing ` +
          'was loaded for it. Check the cable and try again.');
      }
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

  // Recall the target slot on the instrument so the panel's bank and preset
  // LEDs match the button we are about to ask for. Gated on the unsolicited
  // 0x45 the device broadcasts on every recall — the same completion signal
  // the backup run uses — with the listener armed BEFORE the PC goes out so
  // the broadcast cannot slip through the gap.
  _recall(program) {
    return new Promise((resolve, reject) => {
      const onEvent = (ev) => {
        if (ev.type !== 'current-sound') return;
        cleanup();
        resolve(program);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`no recall broadcast within ${RECALL_TIMEOUT_MS}ms`));
      }, RECALL_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.midi.removeListener('event', onEvent);
      };
      this.midi.on('event', onEvent);
      try {
        this.midi.sendProgramChange(program);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  finish(error) {
    const st = this.state || { confirmed: [], sent: [], slots: [], bank: null };
    const report = {
      type: 'transfer-done',
      bank: st.bank,
      error: error || null,
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
