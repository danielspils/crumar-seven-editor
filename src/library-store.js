'use strict';

// Main-process library store: the on-disk Library folder. One .sevenlib.json
// per patch (single-patch containers — the format is one container for
// everything, docs/FORMAT.md), plus setlists.json for the lightweight
// "setlist" concept (a name + 8 ordered slots referencing patch files —
// a bank's worth of patches, staged for a gig or a transfer).
//
// Data layer only: no MIDI, no DOM. The renderer reaches this through
// preload.js IPC — the same seam everything else crosses.

const fs = require('fs');
const path = require('path');
const { serializeLibrary, parseLibrary } = require('./format');

const APP_TAG = 'crumar-seven-editor 0.0.0';

// EVERY WRITE IN THIS FILE GOES THROUGH HERE. A plain writeFileSync truncates
// the target first, so an app killed mid-write leaves a half-file — and for
// setlists.json, which holds every setlist in one place, that is silent total
// loss: measured on 2026-08-17, a truncated setlists.json read back as zero
// setlists where there had been one, with a console warning and no other
// sign. Patch files survived because they are one file each.
//
// Write to a temp file beside the target, flush it to the platter, then
// rename. Rename is atomic within a directory on both macOS and Windows, so a
// reader sees either the old file or the new one, never half of either.
function writeAtomic(target, contents) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, contents);
    // fsync before the rename: without it the rename can land before the
    // bytes do, and a power cut leaves an intact name over an empty file.
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, target);
  } catch (err) {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* already gone */ } }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* leave it */ }
    throw err;
  }
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patch';
}

// THE ONE COMPARISON KEY FOR PATCH NAMES. Names are compared through this and
// nothing else — nameTakenBy, assertNameFree, uniqueName and nextPatchName all
// go through it, because the drift between two copies of a rule has already
// bitten this project twice.
//
// What it folds away, and why each one is a case of TWO TILES THAT LOOK ALIKE:
//
//   NFC        "Café" typed on one keyboard and "Café" pasted from another are
//              different byte sequences that render as THE SAME PIXELS. This is
//              the strongest case of the four: nobody could ever work out why
//              one was allowed and the other refused (Daniel, 2026-08-19).
//   whitespace A trailing space is invisible. So is a doubled internal one.
//   case       "Alpha" and "alpha" are not the same string but they are the
//              same word, and on a stage nobody is reading case.
//
// toLowerCase, NOT toLocaleLowerCase: locale-sensitive folding answers
// differently for I/i under Turkish, so the same two names would collide on
// one machine and not on another. Default Unicode folding is predictable
// everywhere, which is the only property that matters here.
//
// THE STORED NAME IS UNTOUCHED. This is a key for comparison, never a value —
// what the user typed is what the library shows and what the file holds.
function nameKey(name) {
  return String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// A patch is a BACKUP RECORD when it claims a slot on the instrument. Derived
// from the file, never stored — `origin.kind` is computed in list() and does
// not exist on disk, so anything else asking the same question has to ask it
// the same way. It lives here because two places now need it and a copy of the
// test in each would drift: the first attempt at the copy-provenance fix
// checked kind==='backup' inside the store and matched nothing at all.
function isBackupRecord(patch) {
  return !!(patch && patch.origin && typeof patch.origin.bank === 'number');
}

class LibraryStore {
  constructor(dir, schema, fixtureLibrary) {
    this.dir = dir;
    this.schema = schema;
    this.fixtureLibrary = fixtureLibrary;
    // The SCHEMA's sounds — what this build knows about. Correct when nothing
    // is plugged in, and wrong the moment a Seven with different expansions is.
    this.schemaSoundByName = new Map(schema.sounds.map((s) => [s.name, s]));
    this.deviceSounds = null; // the CONNECTED unit's table, when there is one
    this.deviceSoundList = null; // the same table as written provenance
    this.deviceFirmware = null; // the CONNECTED unit's own firmware string
  }

  // The connected instrument's own sound table, pushed in on connect and
  // cleared on disconnect (src/main.js). A patch is "missing" when the
  // INSTRUMENT lacks its sound — not when this build has never heard of it.
  // Those are different questions, and the second one was answering the first:
  // an expansion sound the schema doesn't list showed as not-installed on a
  // unit that has it, and a schema sound showed as installed on a unit that
  // doesn't.
  setDeviceSounds(table) {
    const sounds = (table && table.sounds && table.sounds.length) ? table.sounds : null;
    this.deviceSounds = sounds ? new Map(sounds.map((s) => [s.name, s])) : null;
    // Kept in id order for provenance: what a new patch file records as the
    // instrument it was made on.
    this.deviceSoundList = sounds ? sounds.map(({ id, name }) => ({ id, name })) : null;
  }

  // The connected unit's firmware STRING, verbatim as the device gave it.
  setDeviceFirmware(firmware) {
    this.deviceFirmware = firmware || null;
  }

  // What to resolve names against right now: the instrument if one is here,
  // the schema otherwise. Offline, the schema is the best answer available and
  // the honest one — it is what the app knows, and nothing is claiming to have
  // asked an instrument.
  get soundByName() {
    return this.deviceSounds || this.schemaSoundByName;
  }

  setlistsFile() { return path.join(this.dir, 'setlists.json'); }

  // ---- hand-placed order ---------------------------------------------------
  //
  // Both lists sort by recency UNTIL you drag a row; from then on they hold
  // the order you put them in (Daniel, 2026-08-14). Two different homes for
  // the same idea, because the two things are stored differently: a setlist is
  // an entry in setlists.json and carries its own `order`, while patches are
  // one file each and cannot carry a list-wide position without rewriting
  // every one of them on every drag — so their order is a manifest beside
  // them, listing `file#patchIndex` keys.
  //
  // In BOTH cases the rule for something the order has never seen — a patch
  // you just saved, a setlist you just made — is the same: it is not in the
  // order, so it floats to the top, newest first. That is what makes "new
  // ones at the top" fall out rather than needing a hook on every create.
  patchOrderFile() { return path.join(this.dir, 'patch-order.json'); }

  readPatchOrder() {
    const f = this.patchOrderFile();
    if (!fs.existsSync(f)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      return Array.isArray(raw.order) ? raw.order.filter((k) => typeof k === 'string') : [];
    } catch (err) {
      // An unreadable manifest is a lost preference, not a lost patch: fall
      // back to recency rather than failing the list.
      console.warn('[library] patch-order.json unreadable:', String(err.message || err));
      return [];
    }
  }

  // The whole visible order, as the list now reads. Handing over the complete
  // sequence rather than one move is what pins the floaters: anything that was
  // sitting at the top because the order had never seen it now has a place.
  writePatchOrder(keys) {
    this.ensureSeeded();
    const order = (keys || []).filter((k) => typeof k === 'string');
    writeAtomic(this.patchOrderFile(), `${JSON.stringify({ order }, null, 2)}\n`);
    return order;
  }

  // Back to recency. The manifest is removed rather than emptied, so "no
  // manual order" is one state on disk instead of two.
  clearPatchOrder() {
    const f = this.patchOrderFile();
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // Same idea for setlists, written onto the entries themselves. `indexes` is
  // the displayed order given as positions in the file array — the array's own
  // order is identity everywhere else and must not move.
  writeSetlistOrder(indexes) {
    const setlists = this.readSetlists();
    (indexes || []).forEach((idx, position) => {
      if (setlists[idx]) setlists[idx].order = position;
    });
    this.writeSetlists(setlists);
    return setlists;
  }

  clearSetlistOrder() {
    const setlists = this.readSetlists();
    for (const s of setlists) delete s.order;
    this.writeSetlists(setlists);
    return setlists;
  }

  // One-time migration from the pre-rename manifest: if setlists.json is
  // absent and sets.json exists, convert it (key `sets` -> `setlists`) and
  // leave the original in place.
  migrateSetlists() {
    const target = this.setlistsFile();
    const legacy = path.join(this.dir, 'sets.json');
    if (fs.existsSync(target) || !fs.existsSync(legacy)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(legacy, 'utf8'));
      const setlists = Array.isArray(raw.sets) ? raw.sets : [];
      // The seeded demo name was data by the time of the rename — carry it
      // across so no user-facing string still reads "set".
      for (const s of setlists) {
        if (s && s.name === 'Stage Set (demo)') s.name = 'Stage Setlist (demo)';
      }
      writeAtomic(target, `${JSON.stringify({ setlists }, null, 2)}\n`);
    } catch {
      /* unreadable legacy manifest — start fresh rather than fail the app */
    }
  }

  // Unique filename for a new patch file.
  uniqueFile(name) {
    const base = slugify(name);
    let file = `${base}.sevenlib.json`;
    for (let n = 2; fs.existsSync(path.join(this.dir, file)); n++) {
      file = `${base}-${n}.sevenlib.json`;
    }
    return file;
  }

  // PROVENANCE. `source` says which instrument this patch came from, and
  // FORMAT.md is explicit that soundList is "the full enumerated list from the
  // originating instrument" — it is what makes a missing-expansion warning
  // possible on some other Seven, years from now.
  //
  // It used to write the SCHEMA's 24 sounds and the schema's firmware, on every
  // patch, whatever instrument was attached. On a unit with 16 sounds that is a
  // permanent lie in a file: it claims the patch came from an instrument with
  // eight sounds that unit has never had. Wrong data written once outlives
  // every other kind of bug here, because nothing later can tell it from truth.
  //
  // So: the table actually read from the connected instrument, when there is
  // one. With nothing attached the schema's list is what the app knows and
  // stays the fallback — a patch made offline was not made on any instrument.
  // Patches already saved on this unit are correct and are not migrated.
  singlePatchContainer(patch) {
    return {
      format: 'crumar-seven-library',
      formatVersion: 1,
      created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      source: {
        app: APP_TAG,
        firmware: this.deviceFirmware || this.schema.firmware || '1.37',
        schema: 'seven-1.37.json',
        soundList: this.deviceSoundList || this.schema.sounds.map(({ id, name }) => ({ id, name })),
      },
      patches: [patch],
    };
  }

  // First run: create the folder and seed it from the fixture library so the
  // UI has content. DEMO data — fixtures are never evidence (CLAUDE.md).
  // A NEW LIBRARY IS EMPTY. It used to arrive holding 32 fixture patches and a
  // five-slot "Stage Setlist (demo)", and that was not a labelling problem —
  // it was a hazard. Measured on 2026-08-17 against the real transfer runner:
  // a brand-new owner, having backed up nothing, could send "Sunset Rhodes" to
  // Bank 2 Preset 1 — one sound change, 110 parameter writes — and be told by
  // the app to "Hold preset 1 on the Seven for three seconds", which stores
  // fiction over a preset they have no copy of. That is precisely the loss
  // this app exists to prevent (Daniel, 2026-08-17).
  //
  // Nothing is seeded now, so nothing fictional can be sent, and the first
  // thing a new owner sees is the empty state telling them to back up their
  // own instrument. SEVEN_SEED_DEMO=1 brings the fixtures back for screenshots
  // and manual UI work; it is development tooling and is documented as such.
  ensureSeeded() {
    if (fs.existsSync(this.dir)) return;
    fs.mkdirSync(this.dir, { recursive: true });
    if (!process.env.SEVEN_SEED_DEMO || !this.fixtureLibrary) return;
    this.seedDemoLibrary();
  }

  // The old first-run content, now reachable only on purpose: the dev flag
  // above, or a test that says outright that it wants demo data.
  seedDemoLibrary() {
    if (!this.fixtureLibrary) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const seededAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files = [];
    for (const bank of this.fixtureLibrary.banks) {
      for (const p of bank.patches) {
        const sound = this.soundByName.get(p.soundName);
        const file = this.uniqueFile(p.name);
        const container = this.singlePatchContainer({
          name: p.name,
          // Explicit created origin — patches must never rely on a fallback
          // to claim they were made in the app.
          origin: { created: seededAt },
          sound: { name: p.soundName, id: sound ? sound.id : null },
          params: p.params,
        });
        writeAtomic(path.join(this.dir, file), serializeLibrary(container));
        files.push(file);
      }
    }
    // One demo setlist: five filled slots, three left empty.
    writeAtomic(this.setlistsFile(), `${JSON.stringify({
      setlists: [{ name: 'Stage Setlist (demo)', slots: [...files.slice(0, 5), null, null, null] }],
    }, null, 2)}\n`);
  }

  // Load with validation: malformed entries are DROPPED with a console
  // warning rather than failing the whole file; malformed slot values read
  // as empty. Slot count is fixed at 8 — a hardware bank's worth.
  readSetlists() {
    this.migrateSetlists();
    if (!fs.existsSync(this.setlistsFile())) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.setlistsFile(), 'utf8'));
      if (!Array.isArray(raw.setlists)) return [];
      const ok = [];
      for (const s of raw.setlists) {
        if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !Array.isArray(s.slots)) {
          console.warn('[library] dropping malformed setlist entry:', JSON.stringify(s).slice(0, 120));
          continue;
        }
        ok.push({
          name: s.name || 'Untitled setlist',
          // Carried through the validation, not rebuilt away: this reader
          // reconstructs a setlist from scratch, so a field it does not name
          // is silently lost on every read — which is what happened to the
          // first version of touchedAt. Anything added here must be listed.
          ...(typeof s.touchedAt === 'string' ? { touchedAt: s.touchedAt } : {}),
          // The hand-placed position, once you have dragged one. Absent on
          // every setlist means nobody has, and the list sorts by creation.
          ...(Number.isFinite(s.order) ? { order: s.order } : {}),
          ...(typeof s.createdAt === 'string' ? { createdAt: s.createdAt } : {}),
          // WHICH BANK THIS SETLIST WAS LAST SENT TO, written only after a
          // transfer actually landed. Absent means never sent, which is a real
          // answer and not a missing one — nothing may invent a bank.
          ...(Number.isInteger(s.bank) ? { bank: s.bank } : {}),
          slots: Array.from({ length: 8 }, (_, i) => {
            const v = s.slots[i];
            if (v == null) return null;
            if (typeof v === 'string') return v;
            console.warn(`[library] setlist "${s.name}": non-string slot ${i + 1} treated as empty`);
            return null;
          }),
        });
      }
      return ok;
    } catch (err) {
      console.warn('[library] setlists.json unreadable:', String(err.message || err));
      return [];
    }
  }

  writeSetlists(setlists) {
    // The folder may not exist yet: nothing guarantees a list() came first,
    // and a setlist write into a missing directory throws ENOENT. Found by
    // test/library-store.test.js, which starts from an empty machine.
    this.ensureSeeded();
    writeAtomic(this.setlistsFile(), `${JSON.stringify({ setlists }, null, 2)}\n`);
  }

  // ---- setlist mutations — every one persists immediately ------------------
  //
  // Every setlist carries `touchedAt` — when it was last made, edited or
  // opened — and `createdAt`, when it was made. The list is ordered by
  // CREATION, so a setlist stays where you expect it; ordering by last touch
  // meant opening one moved it, which is the opposite of a stable list
  // (Daniel, 2026-08-14). touchedAt is still written and is simply not what
  // the display sorts on any more.
  //
  // Order stored in the FILE never changes either way: setlists are addressed
  // by position everywhere, so sorting is a display concern.
  _touch(setlists, index) {
    if (setlists[index]) setlists[index].touchedAt = new Date().toISOString();
    return setlists;
  }

  // Stamped by the transfer runner when a send SUCCEEDS. Last successful send
  // wins: sending the same setlist to a different bank later overwrites it,
  // because the sheet should say where it is now.
  setSetlistBank(index, bank) {
    if (!Number.isInteger(bank) || bank < 1 || bank > 4) return false;
    const setlists = this.readSetlists();
    if (!setlists[index]) return false;
    setlists[index].bank = bank;
    this.writeSetlists(setlists);
    return true;
  }

  touchSetlist(index) {
    const setlists = this.readSetlists();
    if (!setlists[index]) return false;
    this.writeSetlists(this._touch(setlists, index));
    return true;
  }

  createSetlist(name) {
    const setlists = this.readSetlists();
    const now = new Date().toISOString();
    setlists.push({
      name: String(name).trim() || 'Untitled setlist',
      slots: Array(8).fill(null),
      // WHEN IT WAS MADE. The list is ordered by this — a fact that never
      // changes — rather than by last touch, which moved a setlist every time
      // it was opened (Daniel, 2026-08-14). touchedAt is still recorded; it is
      // simply no longer what the order rests on.
      createdAt: now,
      touchedAt: now,
    });
    this.writeSetlists(setlists);
    return setlists.length - 1;
  }

  renameSetlist(index, name) {
    const setlists = this.readSetlists();
    if (!setlists[index]) throw new Error('No such setlist');
    setlists[index].name = String(name).trim() || setlists[index].name;
    this.writeSetlists(this._touch(setlists, index));
  }

  // Deletes the setlist ONLY — never the patches it references.
  deleteSetlist(index) {
    const setlists = this.readSetlists();
    if (!setlists[index]) throw new Error('No such setlist');
    setlists.splice(index, 1);
    this.writeSetlists(setlists);
  }

  // Assigning stores a filename reference — it never copies the file. The
  // same patch may appear in several setlists and more than once in one.
  // A slot may also hold "sound:<name>" — a sound with no stored parameters,
  // which sends 0x46 alone and leaves the engine settings untouched (the
  // device's own behaviour). Sounds are referenced by name, never by id.
  // A slot holds a PATCH FILE, and only that. The picker still offers
  // instruments — choosing one is a real thing to want — but choosing it makes
  // the patch here rather than storing a second kind of reference for the rest
  // of the app to special-case (Daniel, 2026-08-14).
  assignSlot(index, slot, file) {
    const setlists = this.readSetlists();
    if (!setlists[index] || slot < 0 || slot > 7) throw new Error('Bad slot');
    let value = String(file);
    if (value.startsWith('sound:')) value = this.createPatchFromSound(value.slice('sound:'.length)).file;
    setlists[index].slots[slot] = value;
    this.writeSetlists(this._touch(setlists, index));
    return value;
  }

  clearSlot(index, slot) {
    const setlists = this.readSetlists();
    if (!setlists[index] || slot < 0 || slot > 7) throw new Error('Bad slot');
    setlists[index].slots[slot] = null;
    this.writeSetlists(this._touch(setlists, index));
  }

  // Reorder by swap — dropping on an occupied slot exchanges the two, never
  // overwrites; dropping on an empty slot is the same swap with null (a
  // move). Empty slots are legal anywhere; nothing auto-compacts.
  // REORDER, not swap. Dragging slot 5 to slot 2 used to exchange the two and
  // leave everything between them where it was, so building a running order
  // meant a chain of swaps and arithmetic (Daniel, 2026-08-14). Now the
  // dragged patch lands at `to` and the ones it passes close up behind it,
  // which is what dragging a row into a position means everywhere else.
  //
  // The array stays eight long — one removed, one inserted — so slots keep
  // mapping to the bank's eight presets, empties included: an empty slot is a
  // position in the running order too, and dragging past one moves it.
  // Undo is still moveSlot(to, from): removing the patch from `to` and
  // inserting it at `from` puts every displaced slot back where it was.
  moveSlot(index, from, to) {
    const setlists = this.readSetlists();
    const s = setlists[index];
    if (!s || from < 0 || from > 7 || to < 0 || to > 7) throw new Error('Bad slot');
    const [moved] = s.slots.splice(from, 1);
    s.slots.splice(to, 0, moved);
    this.writeSetlists(this._touch(setlists, index));
  }

  readFile(file) {
    const text = fs.readFileSync(path.join(this.dir, file), 'utf8');
    return parseLibrary(text, { schema: this.schema });
  }

  // Write one backup patch as its own container file; returns the filename.
  // Caller supplies the full patch (name, origin, sound, params, captured).
  saveBackupPatch(patch) {
    this.ensureSeeded();
    const file = this.uniqueFile(patch.name);
    writeAtomic(path.join(this.dir, file), serializeLibrary(this.singlePatchContainer(patch)));
    return file;
  }

  // Backup setlists are date-named; a same-day re-run replaces the previous
  // run's setlist of the same name instead of stacking duplicates.
  // `runId` identifies the backup run that wrote this setlist, so the Backups
  // tab can group by run rather than by date. Setlists written before this
  // existed carry none and fall back to date grouping — nothing is backfilled,
  // because inferring old run boundaries from timestamps would write guesses
  // into history nobody can check afterwards (Daniel, 2026-08-16).
  createOrReplaceSetlist(name, slots, runId = null) {
    const setlists = this.readSetlists(); // returns the validated ARRAY
    const padded = [...slots.slice(0, 8)];
    while (padded.length < 8) padded.push(null);
    const existing = setlists.findIndex((s) => s.name === name);
    const now = new Date().toISOString();
    if (existing >= 0) {
      setlists[existing].slots = padded;
      setlists[existing].touchedAt = now;
      if (runId) setlists[existing].runId = runId;
    } else {
      setlists.push({ name, slots: padded, touchedAt: now, ...(runId ? { runId } : {}) });
    }
    this.writeSetlists(setlists);
  }

  // Globals snapshot, record-only (no restore path). Not a .sevenlib.json, so
  // list() never shows it.
  //
  // wfp arrives ALREADY REDACTED from the parse layer, and that is the only
  // thing standing between this file and the instrument's Wi-Fi password.
  // This comment used to add "the serializer guard would refuse a real value
  // anyway", which is false and was worth catching (Daniel's audit,
  // 2026-08-14): the guard lives in serializeLibrary, and this writes with
  // plain JSON.stringify. Nothing here would refuse a wfp. Rule 6 is enforced
  // upstream in seven-midi's parseGlobals — a raw 0x33 frame is decoded and
  // discarded inside _onMessage and the password never leaves it — so if that
  // ever changes, this file is where it would surface.
  writeGlobalsSnapshot(dateStr, globals) {
    this.ensureSeeded();
    const file = `globals-${dateStr}.json`;
    writeAtomic(
      path.join(this.dir, file),
      `${JSON.stringify({ captured: new Date().toISOString(), ...globals }, null, 2)}\n`
    );
    return file;
  }

  // Display-ready entries: one per PATCH (a container may hold several).
  // `sampled`/`missing` come from the CONNECTED unit's table when there is one,
  // and from the schema when there isn't (see soundByName). A sound the table
  // doesn't hold is displayed with the Sampled badge alongside the
  // not-installed warning: it is not one of the built-in modeled engines, so
  // if it exists at all it is on an expansion this unit lacks.
  // `skipMigration` exists for one caller: generating a patch reads the library
  // to find a device-backed donor, and the migration generates patches. Without
  // it the two call each other.
  list({ skipMigration = false } = {}) {
    this.ensureSeeded();
    // One-time, and idempotent: any `sound:NAME` slot left by an older build
    // becomes the patch that assignment makes today, so nothing downstream has
    // to know the old kind ever existed.
    if (!skipMigration) this.migrateSoundSlots();
    const entries = [];
    const files = fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.sevenlib.json'))
      .sort();
    for (const file of files) {
      let parsed;
      try {
        parsed = this.readFile(file);
      } catch (err) {
        entries.push({ file, patchIndex: 0, invalid: true, name: file, error: String(err.message || err) });
        continue;
      }
      if (!parsed.library) {
        entries.push({ file, patchIndex: 0, invalid: true, name: file, error: (parsed.report.errors[0] || 'Unreadable') });
        continue;
      }
      const patchCount = parsed.library.patches.length;
      // Provenance for the row's origin line, from the patch's own `origin`
      // field ONLY — never inferred. A file with no origin (e.g. dropped into
      // the folder by hand) is IMPORTED; "created" requires the explicit
      // `origin: { created: <iso> }` this app writes when it creates a patch.
      parsed.library.patches.forEach((p, i) => {
        const soundName = (p.sound && p.sound.name) || '';
        const sound = this.soundByName.get(soundName);
        let origin;
        if (isBackupRecord(p)) {
          origin = {
            kind: 'backup',
            bank: p.origin.bank,
            preset: p.origin.preset,
            // `captured` is when these VALUES were first read; `verified` is
            // when the instrument last confirmed the slot still holds them. A
            // backup that finds nothing changed writes only the latter, and
            // the UI shows freshness, so it is preferred here.
            date: p.verified || p.captured || parsed.library.created || null,
            captured: p.captured || null,
          };
        } else if (p.origin && p.origin.created) {
          // `verified` wins here too. A patch made in the app, then edited
          // live and saved, would otherwise show its creation date forever —
          // the row's date answers "how fresh is this?", not "when was it
          // born". The creation date is still carried alongside.
          //
          // A GENERATED patch — one the picker made from an instrument — is a
          // patch you made, and its row reads like any other you made. What
          // makes it different is recorded rather than displayed: which sound
          // it was generated from, and how many values had to be seeded
          // because the library held no reading of that sound.
          origin = {
            kind: 'created',
            generatedFrom: p.origin.generatedFrom || null,
            donor: p.origin.donor || null,
            seeded: p.origin.seeded || 0,
            date: p.verified || p.origin.created,
            created: p.origin.created,
            // Where a copy came from, so the UI can say something the patch's
            // own name does not already say — "Electric Grand Piano copy" is
            // no use under a title that reads "Electric Grand Piano".
            copiedFrom: p.origin.copiedFrom || null,
          };
        } else {
          origin = { kind: 'imported' }; // absent or unrecognised — never "Created"
        }
        entries.push({
          file,
          patchIndex: i,
          patchCount,
          name: p.name || file,
          // A borrowed name, and which file lent it. Surfaced so the UI can
          // say the name is inherited rather than chosen — and so its
          // disappearance after a panel edit is legible rather than a mystery
          // (docs/FORMAT.md).
          nameFrom: p.nameFrom || null,
          soundName,
          sampled: sound ? sound.sampled : true,
          missing: !sound,
          origin,
          params: p.params || {},
          warnings: parsed.report.warnings.length,
        });
      });
    }
    return {
      dir: this.dir,
      patches: entries,
      setlists: this.readSetlists(),
      // Empty means nobody has dragged a patch yet, so the list sorts itself.
      patchOrder: this.readPatchOrder(),
    };
  }

  // ---- One name, one patch ------------------------------------------------
  //
  // THE NAMESPACE IS YOUR PATCHES, not the whole folder. Backup records are
  // excluded deliberately: a record can carry a BORROWED name identical to the
  // patch it was named after, so counting records would make every first copy
  // from a backup collide with its own source and arrive as "Reed Piano 2"
  // (Daniel, 2026-08-18). The picker keeps records and patches on separate
  // tabs; this keeps their names apart the same way.
  //
  // Every path that sets a display name goes through here — rename, duplicate
  // (from a backup, from a Crumar preset, from the context menu, from the save
  // bar) and create-from-instrument — because duplicateForEditing and
  // duplicateToPatches have already drifted apart once.
  namedPatches({ exceptFile = null, exceptPatchIndex = 0 } = {}) {
    return this.list({ skipMigration: true }).patches.filter((e) =>
      !e.invalid
      && (e.origin || {}).kind !== 'backup'
      && !(e.file === exceptFile && (e.patchIndex || 0) === (exceptPatchIndex || 0)));
  }

  // The patch already using this name, or null. Compared on the name AS
  // STORED, trimmed — which is what the library lists and what a person types.
  nameTakenBy(name, opts = {}) {
    const wanted = nameKey(name);
    if (!wanted) return null;
    return this.namedPatches(opts).find((e) => nameKey(e.name) === wanted) || null;
  }

  // Binding, not advisory. Throws so no caller can proceed on a name that is
  // already somebody's — the suggestion was always free, so this only fires
  // when a person typed over it.
  assertNameFree(name, opts = {}) {
    const clash = this.nameTakenBy(name, opts);
    if (clash) {
      // THE EXISTING NAME, NOT THE TYPED ONE. Type "alpha" while "Alpha" is
      // taken and a message quoting "alpha" reads as the app being broken —
      // what you typed plainly is not on screen anywhere. Quoting "Alpha"
      // explains itself in one line (Daniel, 2026-08-19).
      const err = new Error(`There's already a patch called “${clash.name}”.`);
      err.code = 'NAME_TAKEN';
      err.file = clash.file;
      throw err;
    }
  }

  // For names the APP generates rather than a person types: never refuse,
  // just find the next free one. "Reed Piano copy", "Reed Piano copy 2"…
  uniqueName(base) {
    const wanted = String(base || 'Patch').trim() || 'Patch';
    if (!this.nameTakenBy(wanted)) return wanted;
    for (let n = 2; n < 500; n++) {
      const candidate = `${wanted} ${n}`;
      if (!this.nameTakenBy(candidate)) return candidate;
    }
    return wanted;
  }

  rename(file, patchIndex, newName) {
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    // Renaming a patch to the name it already has is a no-op, not a clash:
    // the check excludes the patch being renamed.
    //
    // AND THE CHECK IS SYMMETRIC. namedPatches leaves backup records out of
    // the set being SEARCHED, because a record can carry a borrowed name
    // identical to the patch it was named after — so it must also leave them
    // out of the set being CHECKED. Renaming a RECORD is not constrained by
    // your patches' names at all; the rule is one name per patch, and a
    // record is not one of your patches. Half of that rule is not the rule:
    // asking only the first question refused a legitimate rename in the bank
    // view, where every row IS a record.
    if (!isBackupRecord(patch)) {
      this.assertNameFree(newName, { exceptFile: file, exceptPatchIndex: patchIndex });
    }
    patch.name = newName;
    let target = file;
    // Filename follows the patch name only for single-patch files.
    if (parsed.library.patches.length === 1) {
      const wanted = `${slugify(newName)}.sevenlib.json`;
      if (wanted !== file) {
        target = fs.existsSync(path.join(this.dir, wanted)) ? this.uniqueFile(newName) : wanted;
      }
    }
    writeAtomic(path.join(this.dir, file), serializeLibrary(parsed.library));
    if (target !== file) {
      fs.renameSync(path.join(this.dir, file), path.join(this.dir, target));
      // Keep setlist references pointing at the renamed file.
      const setlists = this.readSetlists();
      for (const s of setlists) s.slots = s.slots.map((slot) => (slot === file ? target : slot));
      this.writeSetlists(setlists);
    }
    return target;
  }

  // Write edited parameter values back to a patch. The values came back from
  // the instrument itself (every live edit is echoed by the device before it
  // reaches here), so this IS a device-confirmed state: captured and verified
  // both move to now. Only keys the schema knows are accepted.
  // Change which SOUND a stored patch names. The name is the patch's portable
  // identity (schema soundsNote) — ids differ per unit — so this rewrites the
  // name and the modeled/sampled flag and nothing else. The parameters stay:
  // the Seven keeps engine settings across a sound change (verified 2026-08-09,
  // 0x46), so the app does the same.
  // A Crumar factory capture is not edited in place.
  //
  // A patch whose origin names bank 1 came off the factory bank, and
  // createPatchFromSound seeds every generated patch of that model from it.
  // Editing one silently changes what every future generated patch is built
  // from, and nothing on screen connects the two acts. The app duplicates
  // first and edits the copy; this is the layer that makes that a rule rather
  // than a habit — the UI is where a guard is easiest to route around
  // (Daniel, 2026-08-14).
  //
  // RENAME AND DELETE ARE NOT BLOCKED. A name is not a value, and a file you
  // no longer want is yours to remove; only the numbers a generated patch
  // would inherit are protected.
  _refuseIfFactoryCapture(file, patchIndex, what) {
    let parsed;
    try { parsed = this.readFile(file); } catch { return; } // unreadable is another error's job
    const patch = parsed.library && parsed.library.patches[patchIndex];
    if (patch && patch.origin && patch.origin.bank === 1) {
      throw new Error(
        `${what} would edit a Crumar factory preset in place (${file}). ` +
        'Duplicate it and edit the copy — generated patches are seeded from this file.'
      );
    }
  }

  savePatchSound(file, patchIndex, soundName, sampled) {
    this._refuseIfFactoryCapture(file, patchIndex, 'Changing the sound');
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    const previous = { name: patch.sound && patch.sound.name, sampled: patch.sound && patch.sound.sampled };
    patch.sound = { ...(patch.sound || {}), name: String(soundName) };
    if (typeof sampled === 'boolean') patch.sound.sampled = sampled;
    // NOT touching `verified`: the instrument has not confirmed this patch
    // since the change, and saying otherwise would be a claim we cannot make.
    patch.captured = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    writeAtomic(path.join(this.dir, file), serializeLibrary(parsed.library));
    return { ok: true, previous };
  }

  savePatchParams(file, patchIndex, params) {
    this._refuseIfFactoryCapture(file, patchIndex, 'Saving parameters');
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    const known = new Set(this.schema.parameters.map((p) => p.key));
    const next = { ...patch.params };
    for (const [k, v] of Object.entries(params || {})) {
      if (known.has(k) && Number.isInteger(v)) next[k] = v;
    }
    patch.params = next;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    patch.captured = now;
    patch.verified = now;
    writeAtomic(path.join(this.dir, file), serializeLibrary(parsed.library));
    return { ok: true, captured: now };
  }

  // Stamp a patch as still-current without touching its values. Used by a
  // backup run for slots that hashed identical to what is already on disk:
  // nothing changed, but the instrument DID confirm it, and a library that
  // says "9 Aug" after an 11 Aug run is lying by omission.
  touchVerified(file, patchIndex, iso) {
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    patch.verified = iso;
    writeAtomic(path.join(this.dir, file), serializeLibrary(parsed.library));
  }

  // `newName` is what the copy should be called — the name prompt supplies it
  // when a record is duplicated out of a backup. Without one it falls back to
  // "… copy", which is what the context menu's Duplicate has always done.
  duplicate(file, patchIndex, newName) {
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    const copy = JSON.parse(JSON.stringify(patch));
    // A NAME SOMEBODY TYPED is binding; a name the app made up is made free.
    // The no-name callers — the context menu, the save bar, and duplicating a
    // Crumar preset — used to land on "<name> copy" every time, so doing it
    // twice produced two patches with one name.
    const typed = String(newName || '').trim();
    if (typed) this.assertNameFree(typed);
    copy.name = typed || this.uniqueName(`${copy.name || 'Patch'} copy`);
    // A copy is yours, so it does not carry a borrowed name's provenance: the
    // name is now one you chose.
    delete copy.nameFrom;
    // A copy is NOT a backup record. It kept origin.kind='backup' from the
    // patch it was cloned from, so it filed itself under the bank heading of
    // the capture it came from and could not be found among your own patches
    // (Daniel, 2026-08-13). Where it CAME from is worth keeping — that is
    // provenance — but the claim to be a capture of the instrument on a date
    // is not the copy's to make.
    // A copy is a patch YOU made, not another capture of the instrument. It
    // used to inherit the source's `origin` wholesale, so a copy of a backup
    // record filed itself under that bank's heading and could not be found
    // among your own patches (Daniel, 2026-08-13).
    //
    // The test is `origin.bank`, not `origin.kind`. `kind` is DERIVED in list()
    // from whether a bank number is present and never written to the file — so
    // checking for kind==='backup' here matched nothing at all, and the first
    // version of this fix silently did nothing.
    //
    // Written the way list() recognises a created patch: `origin.created`.
    // Where it came from is kept beside it as provenance.
    if (copy.origin && typeof copy.origin.bank === 'number') {
      copy.origin = {
        created: new Date().toISOString(),
        copiedFrom: { bank: copy.origin.bank, preset: copy.origin.preset },
      };
    }
    const target = this.uniqueFile(copy.name);
    writeAtomic(path.join(this.dir, target), serializeLibrary(this.singlePatchContainer(copy)));
    // { file, patchIndex }, not a bare filename. audition.js reads copy.file
    // to follow the live session onto the copy, and against a string that was
    // always undefined — so every save that took the copy path failed with
    // "Could not make a copy" even though the file had been written
    // (Daniel, 2026-08-13). It surfaced the moment backup records started
    // always copying; the mismatch was there long before.
    return { file: target, patchIndex: 0 };
  }

  // An instrument, made into a patch.
  //
  // Assigning a sound to a setlist slot used to store a `sound:NAME` reference
  // — a second kind of thing a slot could hold, which the row then had to
  // explain to the reader ("Instrument"), and which behaved differently from
  // every patch beside it. It is a patch now: that model, with the effects it
  // comes with (Daniel, 2026-08-14).
  //
  // WHERE THE VALUES COME FROM, and why this is not the invention the
  // sound-only slot existed to avoid: schema/factory-defaults-1.37.json, taken
  // off Bank 1 of the player's own instrument — the factory bank, which cannot
  // be stored to. Eight modeled sounds are covered. For anything else there is
  // no evidence, so the patch carries the effects chain OFF rather than
  // borrowed numbers: a sampled sound appears in no factory preset and has no
  // chain to restore.
  // The DEVICE-BACKED patch whose values a generated patch should copy: a
  // backup record, so its 110 values came off the instrument.
  //
  // LOWEST BANK, THEN LOWEST PRESET. Several backups commonly share a sound —
  // Tine Piano appears in three of Daniel's, DX Synth Piano in four — and
  // "newest" made the choice depend on when a backup happened to run, so the
  // same request could produce different patches on different days. Lowest
  // bank/preset is stable, and it means Bank 1 wins wherever it has coverage:
  // the factory bank cannot be stored to, so those eight are the instrument as
  // it shipped (Daniel, 2026-08-14). Filename breaks a remaining tie, so the
  // order is total.


  // What generating this sound would start from, for the UI to show BEFORE it
  // writes anything. Every device-backed capture of the sound, in the order the
  // rule prefers them, plus what would happen if none is used — because a patch
  // built from seeds must never be generated silently (Daniel, 2026-08-14).

  _factoryDefaults() {
    if (!this.factoryDefaults) {
      // Version-gated like every other schema file, and optional: a build
      // without it seeds rather than failing.
      try {
        this.factoryDefaults = JSON.parse(fs.readFileSync(
          path.join(__dirname, '..', 'schema', 'factory-defaults-1.37.json'), 'utf8'
        ));
      } catch {
        this.factoryDefaults = { sounds: {} };
      }
    }
    return this.factoryDefaults;
  }

  // PREDICTABLE, and one rule per kind (Daniel, 2026-08-16):
  //
  //   MODEL  -> Crumar's Bank 1 preset for that engine. It always exists, it
  //             is always the same, and it does not depend on what else is in
  //             the library. schema/factory-defaults-1.37.json holds exactly
  //             those eight, 110 parameters each.
  //   SAMPLE -> a clean slate. Bank 1 holds no sampled sound, so there is no
  //             factory reference to give and inventing one would be a guess:
  //             the sound is selected, every parameter takes the seed, and the
  //             effects are off.
  //
  // The donor machinery is gone. It asked which capture to start from, which
  // made the same choice produce different patches depending on what had been
  // backed up — and a patch made from an earlier one of your own is what the
  // Patches list is for.
  createPatchFromSound(name, { factoryDefaults, patchName } = {}) {
    // A typed name is binding here too; nextPatchName's suggestion is free by
    // construction, so this only refuses something a person typed over it.
    if (String(patchName || '').trim()) this.assertNameFree(patchName);
    const sound = this.soundByName.get(name);
    if (!sound) throw new Error(`Unknown sound: ${name}`);
    const factory = ((factoryDefaults || this._factoryDefaults()).sounds || {})[name] || null;

    // EVERY parameter, always. A patch that omits keys switches blocks off by
    // absence and leaves the rest inert (Daniel, 2026-08-14).
    const params = {};
    let source;
    if (factory) {
      for (const p of this.schema.parameters) params[p.key] = factory[p.key];
      source = 'factory';
    } else {
      // The seed is min(64, max) — src/defaults.js documents it as NOT
      // evidence — and the effects blocks start off, which is what "no FX"
      // means on this instrument: each block has a switch, and off is 0.
      const OFF = new Set(['fx1_sw', 'fx2_sw', 'amp_sw', 'rev_sw', 'pad_sw']);
      for (const p of this.schema.parameters) {
        params[p.key] = OFF.has(p.key) ? 0 : Math.min(64, p.max);
      }
      source = 'clean';
    }

    const patch = {
      name: String(patchName || name).trim() || name,   // checked by the caller below
      sound: { name, sampled: !!sound.sampled },
      params,
      origin: {
        kind: 'generated',
        generatedFrom: name,
        created: new Date().toISOString(),
        // WHERE THE VALUES CAME FROM, in the file: the factory bank, or a
        // clean slate. Nothing here was read from the player's instrument.
        source,
      },
    };
    this.ensureSeeded();
    const target = this.uniqueFile(patch.name);
    writeAtomic(path.join(this.dir, target), serializeLibrary(this.singlePatchContainer(patch)));
    return { file: target, patchIndex: 0, name: patch.name, params, source };
  }

  // The name a new patch is offered: the sound's own, numbered if that is
  // taken. "Clavi Piano", then "Clavi Piano 2".
  nextPatchName(soundName) {
    // YOUR patches, not backup records — see namedPatches(). Counting records
    // would number the first copy taken from a backup, because a record can
    // hold the very name being suggested.
    // BOTH SIDES THROUGH THE KEY. The set holds normalised names, so the
    // lookups have to be normalised too — comparing a raw candidate against a
    // folded set is the same class of half-applied rule as the record/patch
    // asymmetry, and it would offer "Tine Piano" while "tine piano" existed.
    const taken = new Set(this.namedPatches().map((e) => nameKey(e.name)));
    if (!taken.has(nameKey(soundName))) return soundName;
    for (let n = 2; n < 500; n++) {
      const candidate = `${soundName} ${n}`;
      if (!taken.has(nameKey(candidate))) return candidate;
    }
    return soundName;
  }

  // Setlists written before instruments became patches still hold
  // `sound:NAME` in a slot. Convert each one ONCE, into exactly the patch an
  // assignment would make today, so no setlist is left holding the old second
  // kind of thing. Returns how many it converted.
  migrateSoundSlots() {
    const setlists = this.readSetlists();
    let converted = 0;
    const made = new Map(); // one file per sound, however many slots want it
    for (const s of setlists) {
      s.slots.forEach((v, i) => {
        if (typeof v !== 'string' || !v.startsWith('sound:')) return;
        const name = v.slice('sound:'.length);
        try {
          if (!made.has(name)) made.set(name, this.createPatchFromSound(name).file);
          s.slots[i] = made.get(name);
          converted++;
        } catch {
          // A sound this schema does not know: leave the slot alone rather
          // than dropping what it referenced.
        }
      });
    }
    if (converted) this.writeSetlists(setlists);
    return converted;
  }

  absPath(file) {
    // Refuse anything that escapes the library folder.
    const abs = path.resolve(this.dir, file);
    if (!abs.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('Bad path');
    return abs;
  }
}

module.exports = { LibraryStore, slugify, writeAtomic };
