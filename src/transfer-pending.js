'use strict';

// A walk you did not finish.
//
// A setlist transfer is eight three-second holds, and quitting at slot six used
// to mean starting over. It does NOT need per-slot progress: the walk recalls
// each slot and reads every parameter back before it asks for a hold, so a slot
// already stored is skipped on its own. Restarting from the top costs about
// twelve seconds of reading and then asks only for what is genuinely
// outstanding — which is stronger than any record, because it is the instrument
// answering rather than us remembering (Daniel, 2026-08-16).
//
// So this remembers exactly two facts and a timestamp: which setlist, which
// bank, and when the walk began. Everything else the walk works out again.
//
// It lives in userData beside pending-glb-restore.json — app state, not a
// document. The Library folder is for things you would open.

const fs = require('node:fs');
const path = require('node:path');

const FILE = 'pending-transfer.json';

// A walk abandoned three weeks ago is not something to offer on launch.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

class PendingTransfer {
  constructor(dir) {
    this.dir = dir;
  }

  path() { return path.join(this.dir, FILE); }

  // Written when a walk starts. The setlist is remembered by NAME as well as
  // index: an index is a position in a file that other things reorder.
  start({ setlistIndex, setlistName, bank, at }) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.path(), `${JSON.stringify({
        setlistIndex, setlistName, bank, startedAt: at || new Date().toISOString(),
      }, null, 2)}\n`);
    } catch { /* a marker we cannot write is a resume we do not offer */ }
  }

  clear() {
    try { fs.unlinkSync(this.path()); } catch { /* already gone */ }
  }

  // What to offer, or null. Reading is also PRUNING: a marker that is stale,
  // malformed, or points at a setlist that no longer exists is deleted here
  // rather than left to be asked about again.
  read(setlists, now = Date.now()) {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.path(), 'utf8'));
    } catch {
      return null; // absent or unreadable: nothing to resume
    }
    const started = Date.parse(raw && raw.startedAt);
    if (!raw || !Number.isFinite(started) || !raw.setlistName || !raw.bank) {
      this.clear();
      return null;
    }
    if (now - started > STALE_AFTER_MS) {
      this.clear();
      return null;
    }
    // By name, since a setlist can be reordered or deleted between sessions.
    const index = (setlists || []).findIndex((s) => s && s.name === raw.setlistName);
    if (index < 0) {
      this.clear();
      return null;
    }
    return {
      setlistIndex: index,
      setlistName: raw.setlistName,
      bank: raw.bank,
      startedAt: raw.startedAt,
    };
  }
}

module.exports = { PendingTransfer, STALE_AFTER_MS };
