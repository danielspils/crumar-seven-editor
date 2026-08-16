'use strict';

// Backup run: recall all 32 slots by Program Change and read the edit buffer
// after each. The unsolicited 0x45 broadcast is the completion signal for a
// recall — never a fixed delay — and a slot that doesn't answer within 1500ms
// ABORTS the whole run: a silently missing slot is worse than a failed backup.
// Patches are rebuilt from one 0x22 read per parameter (what the manufacturer's
// own editor does after a recall), never from the 22-CC broadcast. How many
// parameters that is comes from the instrument's own table — 110 on FW 1.37,
// but the number is read, not assumed.

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

const SLOT_COUNT = 32;
const RECALL_TIMEOUT_MS = 1500;

const bankOf = (slot) => Math.floor(slot / 8) + 1;
const presetOf = (slot) => (slot % 8) + 1;

// Content hash for dedupe: sound name + every param in id order.
function patchHash(soundName, paramsByKey, keyOrder) {
  const h = crypto.createHash('sha256');
  h.update(String(soundName));
  for (const key of keyOrder) h.update(`\n${key}=${paramsByKey[key]}`);
  return h.digest('hex');
}

// What to call a record about to be written. Exactly one library patch with
// these contents lends its name; zero or several give the generated one.
// Picking between two names a user chose would be a guess, and a wrong name on
// a backup is worse than a dull one.
//
// I proposed excluding records that claim the SAME slot, on the grounds that a
// slot's own history would otherwise always collide and the feature could
// never fire. That was wrong, and a test caught it: naming only happens when a
// record is CREATED, and a record is only created when the slot's contents
// changed — at which point the slot's own older records cannot share the new
// hash, because dedupe would have matched one of them and written nothing at
// all. The collision I measured was in a static snapshot, not at the moment
// this runs (2026-08-15).
function inheritedName(byContent, hash) {
  const matches = byContent.get(hash) || [];
  if (matches.length !== 1) return null;
  return { name: matches[0].name, file: matches[0].file };
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
    // WHICH RUN wrote a setlist. Grouping the Backups tab by DATE merged an
    // aborted run with the retry that followed it — 5 slots plus 32 shown as
    // one "37 presets · partial" row, on an instrument with 32 slots
    // (Daniel, 2026-08-16). A run needs an identity of its own, and the
    // instant it started is one nothing else can collide with.
    const runId = now.toISOString();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const soundTable = this.midi.soundTable;
    const soundById = new Map(soundTable.sounds.map((s) => [s.id, s]));

    // WHICH parameters to read comes from the instrument's own table when
    // connect managed to read one — count included, so a unit with a different
    // number of parameters is backed up completely rather than to 110. The
    // schema's list is the fallback for an unread table (and for the tests'
    // fake instrument). Keys still come from each reply, as they always did.
    const table = this.midi.paramTable;
    const readIds = table
      ? table.params.map((p) => p.id)
      : [...this.paramsById.keys()].sort((a, b) => a - b);
    const keyOrder = table ? table.params.map((p) => p.key) : this.keyOrder;

    // Prior slot, for the finish restore: only known when Send PC is on AND
    // the panel has recalled something since connect.
    const sendPcOn = this.midi.globals && this.midi.globals.glb[3] === 1;
    const priorProgram = this.midi.lastPanelProgram;

    // TWO indexes over the same library read, answering two different
    // questions. Dedupe decides WHETHER to write a record; the name index
    // decides what to CALL one that is being written. Keeping them apart is
    // the point: their populations and their keys differ.
    const listed = this.store.list().patches;

    // Dedupe: hash + origin slot -> file, backup-origin patches only. A record
    // says what ITS slot held, so the same contents in two slots are two
    // records (Daniel, 2026-08-15).
    const existing = new Map();
    for (const e of listed) {
      if (e.invalid || e.origin.kind !== 'backup') continue;
      const hash = patchHash(e.soundName, e.params, keyOrder);
      existing.set(`${hash}:${e.origin.bank}:${e.origin.preset}`, e.file);
    }

    // Names: hash -> every patch with those exact contents, of ANY kind — a
    // name can be lent by a generated patch, an imported one, or a backup of
    // another slot. The Seven stores no preset names, so a name cannot survive
    // a round trip on the wire; this is the only way one can.
    const byContent = new Map();
    for (const e of listed) {
      if (e.invalid || !e.params) continue;
      if (Object.keys(e.params).length < keyOrder.length) continue; // partial file lends nothing
      const hash = patchHash(e.soundName, e.params, keyOrder);
      if (!byContent.has(hash)) byContent.set(hash, []);
      byContent.get(hash).push(e);
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
        for (const id of readIds) {
          let r = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try { r = await this.midi.readParamValue(id); break; }
            catch (err) { if (attempt === 2) throw new Error(`param ${id} unreadable after 3 attempts (${err.message})`); }
          }
          params[r.key] = r.value;
        }

        const hash = patchHash(soundName, params, keyOrder);
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
          // The name is BORROWED; the origin is not. `nameFrom` records which
          // file lent it, so provenance still says where these values were
          // captured — this slot, this run — while the label says what the
          // player calls them.
          const borrowed = inheritedName(byContent, hash);
          const file = this.store.saveBackupPatch({
            name: borrowed ? borrowed.name : `Bank ${bank} Preset ${preset} — ${soundName}`,
            ...(borrowed ? { nameFrom: { file: borrowed.file, name: borrowed.name } } : {}),
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
      this.store.createOrReplaceSetlist(`Bank ${b + 1} setlist (${dateStr}${suffix})`, slots, runId);
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
