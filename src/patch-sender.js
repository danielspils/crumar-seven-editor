'use strict';

// Sending a patch TO the instrument: the write path Audition, live editing and
// Transfer all share. It puts a sound and 110 parameter values into the edit
// buffer and stops there.
//
// NOTHING HERE STORES ANYTHING. The Seven has no store opcode — keeping what
// you hear takes a three-second hold on a panel preset button, done by a human
// on the instrument. Every caller must say that plainly (CLAUDE.md).
//
// ORDER IS FREE, and this used to claim the opposite. A sound change leaves
// every engine parameter untouched — read back on 2026-08-09, and shown from
// the device side on 2026-08-14 (a value survived a Clavi round trip with no
// writes between the two `0x46` frames; captures/editor-tap-set-sound-2026-08-14
// and docs/protocol.md). Nothing is reset, so nothing can be clobbered in
// either direction.
//
// The sound still goes first, because it is the one write that can be REFUSED:
// resolveSoundId below rejects a sound this unit does not have, and failing
// before 110 parameter writes is better than failing after them. That is a
// reason of our own, not a rule the device imposes.

const { EventEmitter } = require('node:events');

const SEND_ATTEMPTS = 3; // the device drops the odd reply under a fast burst

// Sound IDs are NOT portable — id 18 is a different sound on a Seven with
// different expansions (schema soundsNote). Resolution is always by NAME,
// against the table read from the instrument we are actually talking to.
function resolveSoundId(soundTable, name) {
  const wanted = String(name || '');
  const sounds = (soundTable && soundTable.sounds) || [];
  const exact = sounds.find((s) => s.name === wanted);
  if (exact) return { id: exact.id, fuzzy: false };
  const fold = (x) => String(x).trim().toLowerCase().replace(/\s+/g, ' ');
  const near = sounds.find((s) => fold(s.name) === fold(wanted));
  if (near) return { id: near.id, fuzzy: true };
  return null;
}

class PatchSender extends EventEmitter {
  constructor({ midi, schema }) {
    super();
    this.midi = midi;
    this.schema = schema;
    this.running = false;
    this.cancelled = false;
    // Parameters in id order, carrying each one's max so a value from a file
    // (or a future firmware) is clamped to what THIS schema says is legal.
    this.params = [...schema.parameters]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({ id: p.id, key: p.key, max: p.max }));
  }

  cancel() { this.cancelled = true; }

  // patch: { name, sound: {name}, params: {key: value} }
  // A patch with no params is legal and meaningful — it is the "sound only"
  // case: select the sound, leave every setting exactly where it is.
  async send(patch) {
    if (this.running) throw new Error('A send is already running');
    if (!this.midi || this.midi.state !== 'connected') {
      throw new Error('The Seven is not connected.');
    }
    // BEFORE the sound change, not when the first 0x20 is refused. The gate
    // would stop the parameters either way, but only this stops the patch from
    // leaving the instrument on a new sound with the old settings under it.
    if (this.midi.writeGate && !this.midi.writeGate().allowed) {
      throw new Error(this.midi.writeGate().message);
    }
    this.running = true;
    this.cancelled = false;
    const startedAt = Date.now();

    try {
      const soundName = (patch.sound && patch.sound.name) || '';
      const resolved = resolveSoundId(this.midi.soundTable, soundName);
      if (!resolved) {
        // Refuse rather than send a guessed id: the wrong sound loaded
        // silently is worse than a patch that didn't load at all.
        throw new Error(
          `This instrument has no sound called “${soundName}”. ` +
            'It may need a sample expansion this unit does not have.'
        );
      }

      await this.midi.setSound(resolved.id);
      this.emit('progress', { phase: 'sound', soundName, soundId: resolved.id });

      const entries = this.params.filter((p) => patch.params && p.key in patch.params);
      const mismatches = [];
      // WHAT WAS ACTUALLY WRITTEN, key by key — the file's values after
      // clamping. Returned so the renderer can hold it as the baseline for
      // drift: comparing live values against the raw file would report a
      // clamped value as an edit the moment the patch loaded (src/drift.js).
      const values = {};
      let sent = 0;

      for (const p of entries) {
        if (this.cancelled) break;
        const wanted = Math.max(0, Math.min(p.max, Number(patch.params[p.key])));
        let echoed = null;
        let lastErr = null;
        for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
          try {
            echoed = await this.midi.setParamValue(p.id, wanted);
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!echoed) {
          throw new Error(
            `${p.key} (parameter ${p.id}) would not take a value after ` +
              `${SEND_ATTEMPTS} attempts (${lastErr && lastErr.message}).`
          );
        }
        // The device echoes what it actually took. A disagreement is real
        // information — record it, don't paper over it.
        if (echoed.value !== wanted) {
          mismatches.push({ key: p.key, id: p.id, wanted, got: echoed.value });
        }
        values[p.key] = wanted;
        sent++;
        this.emit('progress', { phase: 'param', sent, total: entries.length, key: p.key });
      }

      return {
        soundName,
        soundId: resolved.id,
        fuzzySound: resolved.fuzzy,
        sent,
        total: entries.length,
        values,
        mismatches,
        cancelled: this.cancelled,
        elapsedMs: Date.now() - startedAt,
      };
    } finally {
      this.running = false;
    }
  }
}

module.exports = { PatchSender, resolveSoundId };
