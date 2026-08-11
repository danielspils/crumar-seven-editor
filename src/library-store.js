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

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patch';
}

class LibraryStore {
  constructor(dir, schema, fixtureLibrary) {
    this.dir = dir;
    this.schema = schema;
    this.fixtureLibrary = fixtureLibrary;
    this.soundByName = new Map(schema.sounds.map((s) => [s.name, s]));
  }

  setlistsFile() { return path.join(this.dir, 'setlists.json'); }

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
      fs.writeFileSync(target, `${JSON.stringify({ setlists }, null, 2)}\n`);
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

  singlePatchContainer(patch) {
    return {
      format: 'crumar-seven-library',
      formatVersion: 1,
      created: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      source: {
        app: APP_TAG,
        firmware: this.schema.firmware || '1.37',
        schema: 'seven-1.37.json',
        soundList: this.schema.sounds.map(({ id, name }) => ({ id, name })),
      },
      patches: [patch],
    };
  }

  // First run: create the folder and seed it from the fixture library so the
  // UI has content. DEMO data — fixtures are never evidence (CLAUDE.md).
  ensureSeeded() {
    if (fs.existsSync(this.dir)) return;
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
        fs.writeFileSync(path.join(this.dir, file), serializeLibrary(container));
        files.push(file);
      }
    }
    // One demo setlist: five filled slots, three left empty.
    fs.writeFileSync(this.setlistsFile(), `${JSON.stringify({
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
    fs.writeFileSync(this.setlistsFile(), `${JSON.stringify({ setlists }, null, 2)}\n`);
  }

  // ---- setlist mutations — every one persists immediately ------------------
  createSetlist(name) {
    const setlists = this.readSetlists();
    setlists.push({ name: String(name).trim() || 'Untitled setlist', slots: Array(8).fill(null) });
    this.writeSetlists(setlists);
    return setlists.length - 1;
  }

  renameSetlist(index, name) {
    const setlists = this.readSetlists();
    if (!setlists[index]) throw new Error('No such setlist');
    setlists[index].name = String(name).trim() || setlists[index].name;
    this.writeSetlists(setlists);
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
  assignSlot(index, slot, file) {
    const setlists = this.readSetlists();
    if (!setlists[index] || slot < 0 || slot > 7) throw new Error('Bad slot');
    setlists[index].slots[slot] = String(file);
    this.writeSetlists(setlists);
  }

  clearSlot(index, slot) {
    const setlists = this.readSetlists();
    if (!setlists[index] || slot < 0 || slot > 7) throw new Error('Bad slot');
    setlists[index].slots[slot] = null;
    this.writeSetlists(setlists);
  }

  // Reorder by swap — dropping on an occupied slot exchanges the two, never
  // overwrites; dropping on an empty slot is the same swap with null (a
  // move). Empty slots are legal anywhere; nothing auto-compacts.
  moveSlot(index, from, to) {
    const setlists = this.readSetlists();
    const s = setlists[index];
    if (!s || from < 0 || from > 7 || to < 0 || to > 7) throw new Error('Bad slot');
    [s.slots[from], s.slots[to]] = [s.slots[to], s.slots[from]];
    this.writeSetlists(setlists);
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
    fs.writeFileSync(path.join(this.dir, file), serializeLibrary(this.singlePatchContainer(patch)));
    return file;
  }

  // Backup setlists are date-named; a same-day re-run replaces the previous
  // run's setlist of the same name instead of stacking duplicates.
  createOrReplaceSetlist(name, slots) {
    const setlists = this.readSetlists(); // returns the validated ARRAY
    const padded = [...slots.slice(0, 8)];
    while (padded.length < 8) padded.push(null);
    const existing = setlists.findIndex((s) => s.name === name);
    if (existing >= 0) setlists[existing].slots = padded;
    else setlists.push({ name, slots: padded });
    this.writeSetlists(setlists);
  }

  // Globals snapshot, record-only (no restore path). wfp arrives already
  // redacted from the parse layer; the serializer guard would refuse a real
  // value anyway. Not a .sevenlib.json, so list() never shows it.
  writeGlobalsSnapshot(dateStr, globals) {
    this.ensureSeeded();
    const file = `globals-${dateStr}.json`;
    fs.writeFileSync(
      path.join(this.dir, file),
      `${JSON.stringify({ captured: new Date().toISOString(), ...globals }, null, 2)}\n`
    );
    return file;
  }

  // Display-ready entries: one per PATCH (a container may hold several).
  // `sampled`/`missing` derive from the schema sound list; a sound the schema
  // doesn't know is by definition not one of the built-in modeled engines, so
  // it displays with the Sampled badge alongside the not-installed warning.
  list() {
    this.ensureSeeded();
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
        if (p.origin && typeof p.origin.bank === 'number') {
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
          origin = {
            kind: 'created',
            date: p.verified || p.origin.created,
            created: p.origin.created,
          };
        } else {
          origin = { kind: 'imported' }; // absent or unrecognised — never "Created"
        }
        entries.push({
          file,
          patchIndex: i,
          patchCount,
          name: p.name || file,
          soundName,
          sampled: sound ? sound.sampled : true,
          missing: !sound,
          origin,
          params: p.params || {},
          warnings: parsed.report.warnings.length,
        });
      });
    }
    return { dir: this.dir, patches: entries, setlists: this.readSetlists() };
  }

  rename(file, patchIndex, newName) {
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    patch.name = newName;
    let target = file;
    // Filename follows the patch name only for single-patch files.
    if (parsed.library.patches.length === 1) {
      const wanted = `${slugify(newName)}.sevenlib.json`;
      if (wanted !== file) {
        target = fs.existsSync(path.join(this.dir, wanted)) ? this.uniqueFile(newName) : wanted;
      }
    }
    fs.writeFileSync(path.join(this.dir, file), serializeLibrary(parsed.library));
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
  savePatchParams(file, patchIndex, params) {
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
    fs.writeFileSync(path.join(this.dir, file), serializeLibrary(parsed.library));
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
    fs.writeFileSync(path.join(this.dir, file), serializeLibrary(parsed.library));
  }

  duplicate(file, patchIndex) {
    const parsed = this.readFile(file);
    if (!parsed.library) throw new Error('File is not readable');
    const patch = parsed.library.patches[patchIndex];
    if (!patch) throw new Error('No such patch in file');
    const copy = JSON.parse(JSON.stringify(patch));
    copy.name = `${copy.name || 'Patch'} copy`;
    const target = this.uniqueFile(copy.name);
    fs.writeFileSync(path.join(this.dir, target), serializeLibrary(this.singlePatchContainer(copy)));
    return target;
  }

  absPath(file) {
    // Refuse anything that escapes the library folder.
    const abs = path.resolve(this.dir, file);
    if (!abs.startsWith(path.resolve(this.dir) + path.sep)) throw new Error('Bad path');
    return abs;
  }
}

module.exports = { LibraryStore, slugify };
