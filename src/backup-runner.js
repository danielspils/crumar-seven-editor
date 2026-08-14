'use strict';

// Backup run: recall all 32 slots by Program Change and read the edit buffer
// after each. The unsolicited 0x45 broadcast is the completion signal for a
// recall — never a fixed delay — and a slot that doesn't answer within 1500ms
// ABORTS the whole run: a silently missing slot is worse than a failed backup.
// Patches are rebuilt from 110 individual 0x22 reads (what the manufacturer's
// own editor does after a recall), never from the 22-CC broadcast.

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

const SLOT_COUNT = 32;
const RECALL_TIMEOUT_MS = 1500;
const PARAM_COUNT = 110;

const bankOf = (slot) => Math.floor(slot / 8) + 1;
const presetOf = (slot) => (slot % 8) + 1;

// Content hash for dedupe: sound name + every param in id order.
function patchHash(soundName, paramsByKey, keyOrder) {
  const h = crypto.createHash('sha256');
  h.update(String(soundName));
  for (const key of keyOrder) h.update(`\n${key}=${paramsByKey[key]}`);
  return h.digest('hex');
}

class BackupRunner extends EventEmitter {
  constructor({ midi, store, schema }) {
    super();
    this.midi = midi;
    this.store = store;
    this.schema = schema;
    this.running = false;
    this.cancelled = false;
    // Param keys in id order — the read loop and the hash share this order.
    this.keyOrder = [...schema.parameters].sort((a, b) => a.id - b.id).map((p) => p.key);
    this.paramsById = new Map(schema.parameters.map((p) => [p.id, p.key]));
  }

  cancel() {
    if (this.running) this.cancelled = true;
  }

  _progress(payload) {
    this.emit('event', { type: 'backup-progress', ...payload });
  }

  // Wait for the next unsolicited 0x45; the subscription is armed BEFORE the
  // PC is sent so the broadcast can't slip through the gap.
  _nextRecall(timeoutMs) {
    return new Promise((resolve, reject) => {
      const onEvent = (ev) => {
        if (ev.type !== 'current-sound') return;
        cleanup();
        resolve(ev.soundId);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('no recall broadcast within 1500ms'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.midi.removeListener('event', onEvent);
      };
      this.midi.on('event', onEvent);
    });
  }

  async run() {
    if (this.running) throw new Error('backup already running');
    if (this.midi.state !== 'connected') throw new Error('not connected');
    this.running = true;
    this.cancelled = false;
    const startedAt = Date.now();
    // The player's calendar day, NOT UTC. toISOString() rolls over at 00:00
    // UTC, so west of Greenwich an evening backup was stamped TOMORROW — a
    // run at 5pm Pacific on 13 Aug came out labelled 14 Aug (observed
    // 2026-08-13). This date is not a timestamp: it names the setlist, names
    // the file, and decides whether a re-run REPLACES today's records. It has
    // to be the day the person doing the backup thinks it is. Instants
    // elsewhere in this file keep their time and stay UTC, which is correct
    // for an instant and unambiguous besides.
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const soundTable = this.midi.soundTable;
    const soundById = new Map(soundTable.sounds.map((s) => [s.id, s]));

    // Prior slot, for the finish restore: only known when Send PC is on AND
    // the panel has recalled something since connect.
    const sendPcOn = this.midi.globals && this.midi.globals.glb[3] === 1;
    const priorProgram = this.midi.lastPanelProgram;

    // Dedupe index from the existing library: hash -> {file, bank, preset}
    // for every backup-origin patch already on disk.
    const existing = new Map();
    for (const e of this.store.list().patches) {
      if (e.invalid || e.origin.kind !== 'backup') continue;
      const hash = patchHash(e.soundName, e.params, this.keyOrder);
      existing.set(`${hash}:${e.origin.bank}:${e.origin.preset}`, e.file);
    }

    const slotFiles = []; // file per completed slot, in slot order
    let unchanged = 0;
    let created = 0;
    let aborted = null;

    try {
      for (let slot = 0; slot < SLOT_COUNT; slot++) {
        if (this.cancelled) break;
        const bank = bankOf(slot);
        const preset = presetOf(slot);

        const recallPromise = this._nextRecall(RECALL_TIMEOUT_MS);
        this.midi.sendProgramChange(slot);
        const soundId = await recallPromise; // throws -> abort below

        const sound = soundById.get(soundId);
        const soundName = sound ? sound.name : `Unknown sound ${soundId}`;
        this._progress({
          n: slot + 1, total: SLOT_COUNT, bank, preset,
          name: soundName, elapsedMs: Date.now() - startedAt,
        });

        // The full parameter set, one verified read per id. The device is
        // known to drop the odd reply under a fast burst (documented during
        // interrogation: one dropped reply in 110) — re-request up to twice
        // before declaring the run dead.
        const params = {};
        for (let id = 0; id < PARAM_COUNT; id++) {
          if (!this.paramsById.has(id)) continue;
          let r = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try { r = await this.midi.readParamValue(id); break; }
            catch (err) { if (attempt === 2) throw new Error(`param ${id} unreadable after 3 attempts (${err.message})`); }
          }
          params[r.key] = r.value;
        }

        const hash = patchHash(soundName, params, this.keyOrder);
        const dupKey = `${hash}:${bank}:${preset}`;
        const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        if (existing.has(dupKey)) {
          const file = existing.get(dupKey);
          // Nothing to write about the VALUES, but the instrument just
          // confirmed this slot still holds them — stamp it, or the library
          // keeps reporting the date it was first read and looks stale after
          // a run that actually checked all 32 slots.
          try {
            this.store.touchVerified(file, 0, now);
          } catch (err) {
            console.warn(`[backup] could not stamp ${file}: ${err.message}`);
          }
          slotFiles.push(file);
          unchanged++;
        } else {
          const captured = now;
          const file = this.store.saveBackupPatch({
            name: `Bank ${bank} Preset ${preset} — ${soundName}`,
            origin: {
              bank, preset,
              soundId,
              soundTableFingerprint: soundTable.fingerprint,
            },
            sound: { name: soundName, id: soundId },
            params,
            captured,
            verified: captured,
          });
          existing.set(dupKey, file);
          slotFiles.push(file);
          created++;
        }
      }
    } catch (err) {
      aborted = err.message;
    }

    const partial = slotFiles.length < SLOT_COUNT;

    // Setlists for every completed bank (even on cancel/abort — the files are
    // real; the label says they're partial).
    for (let b = 0; b < 4; b++) {
      const slots = slotFiles.slice(b * 8, b * 8 + 8);
      if (!slots.length) continue;
      // "Bank 1 setlist (2026-08-09)" — what it is first, when second. The
      // date stays ISO so a year of these sorts correctly by name.
      const suffix = partial ? ', partial' : '';
      this.store.createOrReplaceSetlist(`Bank ${b + 1} setlist (${dateStr}${suffix})`, slots);
    }

    // Globals snapshot alongside the setlists — record only, no restore path.
    let globalsFile = null;
    if (!aborted) {
      try {
        globalsFile = this.store.writeGlobalsSnapshot(dateStr, await this.midi.readGlobals());
      } catch { /* snapshot is best-effort; the patch data is the backup */ }
    }

    // Leave the instrument somewhere stated: back on the prior slot when Send
    // PC gave us one, otherwise report what's loaded.
    let finalSlot = slotFiles.length ? slotFiles.length - 1 : null;
    let restored = false;
    if (!aborted && sendPcOn && priorProgram != null) {
      try {
        const p = this._nextRecall(RECALL_TIMEOUT_MS);
        this.midi.sendProgramChange(priorProgram);
        await p;
        finalSlot = priorProgram;
        restored = true;
      } catch { /* device stopped answering; report the last recalled slot */ }
    }

    const durationMs = Date.now() - startedAt;
    this.running = false;
    const done = {
      type: 'backup-done',
      ok: !aborted,
      error: aborted,
      cancelled: this.cancelled,
      partial,
      slots: slotFiles.length,
      created,
      unchanged,
      globalsFile,
      durationMs,
      restored,
      finalBank: finalSlot != null ? bankOf(finalSlot) : null,
      finalPreset: finalSlot != null ? presetOf(finalSlot) : null,
    };
    this.emit('event', done);
    return done;
  }
}

module.exports = { BackupRunner };
