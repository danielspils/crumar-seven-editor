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

  readSetlists() {
    this.migrateSetlists();
    try {
      const raw = JSON.parse(fs.readFileSync(this.setlistsFile(), 'utf8'));
      return Array.isArray(raw.setlists)
        ? raw.setlists.map((s) => ({
            name: String(s.name || 'Untitled setlist'),
            slots: Array.from({ length: 8 }, (_, i) => (s.slots && s.slots[i]) || null),
          }))
        : [];
    } catch {
      return [];
    }
  }

  writeSetlists(setlists) {
    fs.writeFileSync(this.setlistsFile(), `${JSON.stringify({ setlists }, null, 2)}\n`);
  }

  readFile(file) {
    const text = fs.readFileSync(path.join(this.dir, file), 'utf8');
    return parseLibrary(text, { schema: this.schema });
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
            date: p.captured || parsed.library.created || null,
          };
        } else if (p.origin && p.origin.created) {
          origin = { kind: 'created', date: p.origin.created };
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
