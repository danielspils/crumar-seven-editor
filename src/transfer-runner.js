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
//   - SEND PC IS BORROWED, NOT ASSUMED. Detecting the player's hold depends on
//     it, but it is a setting people turn off for real reasons. The run turns
//     it on if it has to and puts it back when it finishes.

const { EventEmitter } = require('node:events');

const SLOTS_PER_BANK = 8;
const BLOCKED_BANK = 1;
const RECALL_TIMEOUT_MS = 1500;
// How long the CC burst has to close after its 0x45. Measured at ~55ms on the
// wire (captures/store-hold-2026-08-12); this is generous.
const BURST_TAIL_MS = 400;
// glb index 3, pinned by a captured editor write (see seven-midi.js).
const SEND_PC_INDEX = 3;

// Trying an instrument replaces the effects chain it lands in.
//
// A sound change carries the sound and nothing else (verified 0x46, and again
// 2026-08-13: Acoustic Piano arrived still wearing the previous patch's Pedal
// Wha-Wha at depth 97). That is right when auditioning a sound FOR a preset
// and wrong when you want to hear the instrument — a Vibraphone under a Clavi
// patch's distortion, wha and pad sounds like the Clavi, and reads as the
// sound not having changed at all.
//
// What replaces it depends on whether the instrument HAS a chain of its own:
//
//   MODELED — yes. Bank 1 is the factory bank and its eight presets are the
//     eight modeled sounds, each with its own effects: the Wurlitzer has
//     tremolo, amp and reverb; the MKS has chorus; the Rhodes is dry. Those are
//     read off the player's own backup of Bank 1, so this is their instrument's
//     values rather than anything invented here.
//
//   SAMPLED — no. The sixteen sampled sounds appear in no factory preset and
//     carry no effects anywhere, so there is nothing to restore and the chain
//     goes off.
//
// Master Volume/EQ is excluded from both paths: veq_vol is the output level,
// and moving it on a sound change would be alarming rather than helpful.
const FX_RESET = Object.freeze({
  fx1_sw: 0, // FX1
  fx2_sw: 0, // FX2
  amp_sw: 0, // Amp Simulator
  rev_sw: 0, // Reverb
  pad_sw: 0, // Synth Pad
});

// Every parameter in the effects chain, taken from the schema so a firmware
// that adds one is covered without a list here going stale. veq_* is excluded
// on purpose: that group is Master Volume/EQ, and veq_vol is the output level.
function chainKeys(schema) {
  return (schema.parameters || schema.params || [])
    .filter((p) => /^efx_/.test(p.group) && !/^veq_/.test(p.key))
    .map((p) => p.key);
}

// WHAT THE REPORT MAY CLAIM about how a store was established.
//
// The Seven does not ANNOUNCE a store: a hold emits exactly what a tap emits
// (captures/store-hold-2026-08-12-notes.md). But the burst that FOLLOWS one
// carries what was just written, and the runner recalls each slot on its way
// in — so a burst differing from that "before" is the app watching the write
// land. That is real evidence, and saying the player's word was the basis when
// it was not is the same failure as claiming more than we know.
//
// THREE BLIND SPOTS, established and worth stating wherever this note is read:
//
//   - SEND PC OFF: no detection at all. The burst is closed by the Program
//     Change, so with the global off there is no fingerprint and the button is
//     the only path. _recall resolves null and _watchForStore returns at once.
//   - A DIFFERENCE IN CC-LESS PARAMETERS ONLY: invisible. The fingerprint is
//     the sound id plus the 22 panel CCs, and most modelled engine controls
//     have no CC — so such a store produces an identical burst and goes
//     unseen. The walk falls back to the button.
//   - STORING WHAT WAS ALREADY THERE: nothing changes, so nothing fires. The
//     walk usually skips that case earlier anyway, via a full 110-parameter
//     read-back.
//
// In all three the outcome is the same and it is not a failure: the player
// presses the button, and the report says so honestly.
function transferNote(confirmed, verified) {
  if (!confirmed) return '';
  if (verified >= confirmed) {
    return 'The Seven showed each preset change as it was stored.';
  }
  if (!verified) {
    return 'Presets are listed as stored because you confirmed the hold — '
      + 'the Seven does not announce a store.';
  }
  return `The Seven showed ${verified} of these ${confirmed} being stored; `
    + 'the rest are listed because you confirmed the hold.';
}

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
    this._storeWatch = null;  // unsubscribe for the hold detector, when armed
    this._borrowedSendPc = false; // did WE turn Send PC on for this run?
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
      confirmed: [], // slots established as stored, either way
      verified: [],  // …and the subset the INSTRUMENT showed us
      skipped: [],   // slots that already held the patch, read back in full
    };
    return { ...plan, started: true };
  }

  // ONE preset, from the bank region: pick a patch or a bare sound and put it
  // in that slot. Deliberately not a second code path — it builds a plan of
  // eight slots with seven of them empty and hands it to the same walk, so
  // Bank 1 stays refused, the sound is still resolved against THIS instrument,
  // the slot is still recalled before it is written, the hold is still
  // detected, and Send PC is still borrowed and given back. A feature that
  // routes around those rules is how they stop being rules.
  //
  // `ref` is a library file name, or "sound:<name>" for a bare sound.
  preflightSlot(bank, preset, ref) {
    // Bank 1 is blocked from being WRITTEN to — it holds the factory presets
    // and the Seven will not store there anyway. But trying a sound on one of
    // them stores nothing: it recalls the slot and loads a sound into the edit
    // buffer, which the next recall replaces. So a bare sound is allowed in
    // Bank 1 and a patch is not (Daniel, 2026-08-13). The player can hear the
    // factory Rhodes through any instrument on the list; they simply cannot
    // keep it there.
    const soundOnly = String(ref).startsWith('sound:');
    if (bank === BLOCKED_BANK && !soundOnly) {
      return { ok: false, error: 'Bank 1 holds the factory presets and cannot be written to.' };
    }
    if (!Number.isInteger(bank) || bank < 1 || bank > 4) {
      return { ok: false, error: `There is no bank ${bank}.` };
    }
    if (!Number.isInteger(preset) || preset < 1 || preset > SLOTS_PER_BANK) {
      return { ok: false, error: `There is no preset ${preset}.` };
    }
    if (!this.midi || this.midi.state !== 'connected') {
      return { ok: false, error: 'The Seven is not connected.' };
    }
    const table = (this.midi.soundTable && this.midi.soundTable.sounds) || [];
    const known = new Set(table.map((s) => s.name));
    const slot = { slot: preset - 1, ref, name: null, soundName: null, action: 'skip', reason: null };
    if (String(ref).startsWith('sound:')) {
      slot.soundName = String(ref).slice('sound:'.length);
      slot.name = slot.soundName;
      slot.action = known.has(slot.soundName) ? 'send-sound' : 'blocked';
    } else {
      const entry = this.store.list().patches.find((e) => e.file === ref && !e.invalid);
      if (!entry) {
        return { ok: false, blocked: [{ slot: preset - 1, reason: 'the patch file is missing from the library' }] };
      }
      slot.name = entry.name;
      slot.soundName = entry.soundName;
      slot.action = known.has(entry.soundName) ? 'send' : 'blocked';
    }
    if (slot.action === 'blocked') {
      slot.reason = `this instrument has no “${slot.soundName}”`;
      return { ok: false, blocked: [slot] };
    }
    // Seven empty slots and one to write: the walk steps over the empties and
    // reports the preset number from its position, so nothing else changes.
    const slots = Array.from({ length: SLOTS_PER_BANK }, (_, i) =>
      (i === preset - 1 ? slot : { slot: i, ref: null, action: 'skip', reason: 'left alone' }));
    return { ok: true, bank, setlist: slot.name, slots, willWrite: 1, blocked: [] };
  }

  startSlot(bank, preset, ref) {
    if (this.running) throw new Error('A transfer is already running');
    const plan = this.preflightSlot(bank, preset, ref);
    if (!plan.ok) return plan;
    this.running = true;
    this.cancelled = false;
    this.priorProgram = null;
    this.state = {
      bank, setlistIndex: null, slots: plan.slots, index: -1,
      sent: [], confirmed: [], verified: [], skipped: [],
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
        ? { sound: { name: slot.soundName }, params: this._chainFor(slot.soundName) }
        : this._patchFor(slot.ref);
      // Move the instrument to the slot FIRST — a recall replaces the edit
      // buffer, so doing it after the load would throw the load away.
      let before = null;
      this._unwatchStore();
      // Before the first recall of the run, so the very first burst can close.
      if (st.sent.length === 0) await this._borrowSendPc();
      try {
        before = await this._recall((st.bank - 1) * SLOTS_PER_BANK + i);
      } catch (err) {
        return this.finish(`The Seven did not answer the recall for preset ${i + 1}, so nothing ` +
          'was loaded for it. Check the cable and try again.');
      }
      // IS THE WRITE NEEDED AT ALL? Read the whole slot back — every parameter,
      // one 0x22 each, the same sweep a backup does — and compare it with the
      // patch about to be sent. This is ~2.2s per slot and it buys two things:
      //
      //  1. A slot that already holds this patch needs no hold at all. The
      //     player is told and the walk moves on.
      //  2. It closes a hole the recall fingerprint cannot see. That
      //     fingerprint is the sound id plus the 22 panel CCs, so a patch
      //     differing ONLY in parameters with no CC — most of the modelled
      //     engine controls — was written, held, and then reported as
      //     "unchanged" by the same fingerprint logic: a successful store the
      //     runner could not see (Daniel, 2026-08-15).
      //
      // THE COMPARISON IS THE FULL PARAMETER SET OR IT DOES NOT HAPPEN. If the
      // read is short, or the patch carries fewer keys than the instrument has
      // parameters, this falls through to a normal hold — never to a
      // fingerprint comparison, which is the thing being fixed.
      const already = await this._slotAlreadyHolds(patch, slot.soundName);
      if (already) {
        st.index = i;
        st.skipped.push(i);
        const step = {
          slot: i,
          preset: i + 1,
          bank: st.bank,
          name: slot.name,
          soundName: slot.soundName,
          alreadyThere: true,
          // Said plainly, and never advanced silently: the player asked for
          // eight presets and is entitled to know why one took no hold.
          instruction: `Preset ${i + 1} already holds this patch.`,
          done: true,
        };
        this.emit('event', { type: 'transfer-step', ...step });
        return step;
      }

      await this.sender.send(patch);
      st.sent.push(i);
      // Armed only after the patch is in the buffer: a burst before that could
      // not be the store we are waiting for.
      this._watchForStore(i, before);
      const step = {
        slot: i,
        preset: i + 1,
        bank: st.bank,
        name: slot.name,
        soundName: slot.soundName,
        // What was sent alongside the sound, so the panel can show the buffer
        // as it now IS rather than as the file still describes it.
        params: slot.action === 'send-sound' ? { ...patch.params } : null,
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
  // WHO ESTABLISHED THE STORE, per slot.
  //
  // Two things can advance the walk and they are not equal evidence. The
  // player pressing "Held it" is their word. The instrument's own burst
  // differing from the "before" this runner captured on its way in is the
  // app SEEING the write land (see _watchForStore). The renderer races them
  // and knows which won, so it says so rather than the report guessing.
  confirmSlot(byInstrument = false) {
    if (!this.running) throw new Error('No transfer is running');
    if (this.state.index >= 0) {
      this.state.confirmed.push(this.state.index);
      if (byInstrument) this.state.verified.push(this.state.index);
    }
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
  // Send PC is what makes the hold visible to us: without it the panel emits no
  // Program Change, the recall burst never closes, and there is nothing to
  // detect. Plenty of people keep it OFF for good reasons — the Seven transmits
  // Program Change to everything downstream, so a recall can yank a module's or
  // a laptop's patch too, and stray PCs land in a DAW take.
  //
  // So the transfer BORROWS it rather than assuming it. The marker file is
  // written before the change (seven-midi.js), which means even a crash mid-run
  // leaves a note for the next launch to put it back.
  async _borrowSendPc() {
    this._borrowedSendPc = false;
    const midi = this.midi;
    if (!midi || typeof midi.setSendPc !== 'function') return;
    if (!midi.globals || midi.globals.glb[SEND_PC_INDEX] === 1) return; // already on
    try {
      await midi.setSendPc(1);
      this._borrowedSendPc = true;
    } catch {
      // Not fatal: the walk still runs, it just runs on the button.
    }
  }

  _returnSendPc() {
    if (!this._borrowedSendPc) return;
    this._borrowedSendPc = false;
    // Deliberately not awaited: finish() answers the UI synchronously, and the
    // marker on disk is what guarantees this happens even if we die here.
    Promise.resolve(this.midi.restoreSendPc()).catch(() => {});
  }

  // Watch for the player's three-second hold, which the Seven does not
  // announce. Captured at the instrument 2026-08-12: a hold emits exactly what
  // a tap emits — 0x45, the 22 CCs, then the PC — so there is no marker to look
  // for. What differs is the CONTENTS. The burst following a store carries what
  // was just written; the burst following a tap carries what the preset held
  // before. We already have the "before" from the recall this runner does on
  // its way in, so a burst on the same slot that differs from it is a write.
  //
  // Ambiguity is resolved toward saying nothing: if the patch we sent happens
  // to match what the slot already held, both bursts are identical and this
  // stays quiet. The button is always there, and a slot that already holds the
  // right patch is not a wrong outcome.
  _watchForStore(slotIndex, before) {
    this._unwatchStore();
    if (!before || !this.midi || typeof this.midi.on !== 'function') return;
    const program = (this.state.bank - 1) * SLOTS_PER_BANK + slotIndex;
    const onEvent = (ev) => {
      if (ev.type !== 'recall-burst' || ev.program !== program) return;
      if (ev.fingerprint === before) return; // a tap: the preset is unchanged
      this._unwatchStore();
      this.emit('event', {
        type: 'transfer-stored',
        slot: slotIndex,
        preset: slotIndex + 1,
        bank: this.state.bank,
      });
    };
    this.midi.on('event', onEvent);
    this._storeWatch = () => this.midi.removeListener('event', onEvent);
  }

  _unwatchStore() {
    if (this._storeWatch) this._storeWatch();
    this._storeWatch = null;
  }

  // Recall a slot AND capture what it holds, which is the reference the store
  // detection above compares against. Resolves the burst fingerprint, or null
  // when the burst never completed (Send PC off — then there is no detection
  // and the walk runs on the button alone).
  _recall(program) {
    return new Promise((resolve, reject) => {
      let sound = false;
      const onEvent = (ev) => {
        if (ev.type === 'recall-burst' && ev.program === program) {
          cleanup();
          resolve(ev.fingerprint);
          return;
        }
        if (ev.type === 'current-sound') this._currentSoundId = ev.soundId;
        if (ev.type !== 'current-sound') return;
        // The 0x45 alone is the completion signal the backup run uses, and it
        // is enough to know the recall landed. Give the CC burst a moment to
        // close after it; if no PC follows, resolve without a fingerprint.
        if (sound) return;
        sound = true;
        setTimeout(() => { cleanup(); resolve(null); }, BURST_TAIL_MS);
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
    this._unwatchStore();
    this._returnSendPc();
    const st = this.state || { confirmed: [], verified: [], sent: [], slots: [], bank: null };
    const report = {
      type: 'transfer-done',
      bank: st.bank,
      error: error || null,
      cancelled: this.cancelled,
      confirmed: st.confirmed.map((i) => i + 1),
      // Slots that already held the patch: nothing was sent, nothing was held,
      // and the instrument is correct. Reported separately from stored, which
      // is a thing the player did.
      alreadyThere: (st.skipped || []).map((i) => i + 1),
      loadedNotConfirmed: st.sent.filter((i) => !st.confirmed.includes(i)).map((i) => i + 1),
      total: st.slots.filter((s) => s.action === 'send' || s.action === 'send-sound').length,
      // Was a SAMPLED sound among the ones actually sent? Read off the
      // instrument's own table, which is where the modeled/sampled flag comes
      // from. It answers one question for the summary and nothing else: two
      // Sevens can hold different VERSIONS of the same sample set under the
      // same name, and no opcode reports a version, so the honest thing is one
      // line of context after the fact — never a per-patch warning, which
      // would be a guess (docs/DEVICE.md §11).
      sampledSent: (() => {
        const table = (this.midi && this.midi.soundTable && this.midi.soundTable.sounds) || [];
        const sampled = new Set(table.filter((x) => x.sampled).map((x) => x.name));
        return st.sent.some((i) => {
          const slot = st.slots.find((x) => x.slot === i);
          return !!(slot && sampled.has(slot.soundName));
        });
      })(),
      setlistIndex: st.setlistIndex,
      // Which of the confirmed slots the INSTRUMENT showed us, rather than the
      // player telling us. A subset of `confirmed`, never more.
      verified: (st.verified || []).map((i) => i + 1),
      // SAY WHICH BASIS, because they are not the same claim. This used to
      // assert the weaker one flatly — "because you confirmed the hold — the
      // Seven does not report stores" — which was false whenever the burst
      // comparison won the race, and that is the usual case with Send PC on.
      note: transferNote((st.confirmed || []).length, (st.verified || []).length),
    };
    this.running = false;
    this.state = null;
    this._recordBank(report);
    this.emit('event', report);
    return report;
  }

  // WHERE THIS SETLIST NOW LIVES, recorded here rather than at selectBank():
  // picking a bank and then backing out must not stamp anything, and
  // selectBank happens before the "replace this bank?" question.
  //
  // "Successful" is stricter than "did not error". A run the player walked
  // without confirming a single hold stored NOTHING, so the bank does not hold
  // this setlist and saying otherwise would put a wrong number on a sheet
  // somebody reads on stage — the exact harm the omit-when-unknown rule exists
  // to prevent. Something has to have landed: a confirmed store, or a preset
  // that already held its patch.
  //
  // A single-slot send carries setlistIndex null and never gets here.
  // Failures are swallowed: a setlist file that cannot be written must not
  // take the summary down with it.
  _recordBank(report) {
    const landed = report.confirmed.length + (report.alreadyThere || []).length;
    if (report.setlistIndex == null || report.error || report.cancelled || !landed) return;
    try {
      this.store.setSetlistBank(report.setlistIndex, report.bank);
    } catch (err) {
      console.warn(`[transfer] could not record bank ${report.bank}: ${err.message}`);
    }
  }

  // What effects a bare sound arrives with.
  //
  // MODELED sounds have a factory chain and it is on the instrument: Bank 1 is
  // the factory bank and its eight presets are the eight modeled sounds — the
  // Wurlitzer with tremolo, amp and reverb, the MKS with chorus, the Rhodes
  // dry. Read from the player's own backup of Bank 1, so these are their
  // instrument's values and not something invented here. Confirmed unedited:
  // three separate backup runs produced byte-identical patches (2026-08-13).
  //
  // SAMPLED sounds appear in no factory preset and carry no effects anywhere,
  // so there is nothing to restore and the chain goes off.
  //
  // Modeled with no Bank 1 backup on disk falls back to off. That is the
  // honest answer rather than a guess — better a dry instrument than one
  // wearing settings we made up — and it is why the step reports what it sent.
  _chainFor(soundName) {
    const table = this.midi && this.midi.soundTable;
    const known = table && table.sounds.find((s) => s.name === soundName);
    // Unknown sounds are refused upstream by the sender, which resolves by
    // name against this same table; treating one as sampled here is only a
    // safe default for a case that should not arrive.
    if (!known || known.sampled) return { ...FX_RESET };

    const factory = this._factoryPatchFor(soundName);
    if (!factory) return { ...FX_RESET };

    const keys = chainKeys(this.store.schema || {});
    const out = {};
    for (const k of keys) {
      if (factory.params[k] !== undefined) out[k] = factory.params[k];
    }
    // A Bank 1 patch with no chain values at all is not evidence of silence,
    // it is a file we could not read properly — fall back rather than send an
    // empty object and leave the previous patch's effects standing.
    return Object.keys(out).length ? out : { ...FX_RESET };
  }

  // The Bank 1 backup for a modeled sound, by SOUND NAME rather than by slot
  // position — the two agree today, and the name is what the format treats as
  // a patch's identity.
  _factoryPatchFor(soundName) {
    let listing;
    try { listing = this.store.list(); } catch { return null; }
    // list() returns { dir, patches, setlists } — the entries are `patches`.
    const hit = ((listing && listing.patches) || []).find(
      (x) => x.origin && x.origin.bank === 1 && x.soundName === soundName
    );
    if (!hit) return null;
    try {
      const parsed = this.store.readFile(hit.file);
      return (parsed.library.patches[hit.patchIndex || 0]) || null;
    } catch { return null; }
  }

  // Every parameter the instrument has, read back from the slot the runner
  // just recalled, compared with the patch about to be sent. True only when
  // the sound matches AND every parameter matches AND the patch covers them
  // all. Anything less returns false and the walk proceeds normally: a slot
  // wrongly skipped is a preset the player believes was transferred and was
  // not, which is worse than an unnecessary three-second hold.
  async _slotAlreadyHolds(patch, soundName) {
    const table = this.midi.paramTable;
    const ids = table ? table.params.map((p) => p.id) : null;
    if (!ids || !ids.length) return false; // no table read: no full comparison
    const wanted = (patch && patch.params) || {};
    if (Object.keys(wanted).length < ids.length) return false; // partial patch

    // The sound first: it is one read and it rules out most slots.
    const current = this.midi.soundTable
      && this.midi.soundTable.sounds.find((x) => x.id === this._currentSoundId);
    if (current && soundName && current.name !== soundName) return false;

    for (const id of ids) {
      let r = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { r = await this.midi.readParamValue(id); break; } catch { /* retry */ }
      }
      if (!r) return false; // an unreadable slot is not a slot we can skip
      if (wanted[r.key] === undefined) return false; // not covered: no claim
      if (Number(wanted[r.key]) !== Number(r.value)) return false;
    }
    return true;
  }

  _patchFor(file) {
    const parsed = this.store.readFile(file);
    if (!parsed.library) throw new Error(`${file} is not readable`);
    const patch = parsed.library.patches[0];
    if (!patch) throw new Error(`${file} has no patch in it`);
    return patch;
  }
}

module.exports = { TransferRunner, transferNote, SLOTS_PER_BANK, BLOCKED_BANK };
