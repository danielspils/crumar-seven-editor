'use strict';

// CARRYING A LIBRARY ACROSS THE FOLDER RENAME 1.0.0 MADE NECESSARY.
//
// `productName` became "This Seven Goes to Eleven", which moves the userData
// folder — so an owner upgrading from "Crumar Seven Editor" would have opened
// 1.0.0 and found an empty library with every patch still on disk under the
// old name.
//
// WHY THIS IS ITS OWN FILE (16 Nov 2026). It lived in main.js, which has no
// unit tests, and CLAUDE.md has called it "the highest-consequence untested
// function in the repo" since August: it is a DATA MIGRATION, it runs once, it
// runs on a real library, and a mistake is discovered after it has already
// happened. It was verified by hand exactly once — 62 files across, original
// untouched — and guarded by nothing since. A later edit could turn the copy
// into a move, or let it overwrite a destination that already has files, and
// nothing would say so.
//
// Extracted the way src/donations.js was: pure logic, injected paths, no
// Electron. The real `fs` is used against a temporary directory in the tests
// rather than a fake one, because the thing most worth asserting is what
// cpSync actually does — a fake that cannot move a file cannot express the
// bug where this moves one.
//
// FOUR RULES, each of which is a way somebody loses their patches:
//
//   1. AN EXISTING DESTINATION IS NEVER TOUCHED. If the new folder is there,
//      this app has already run; copying over it would overwrite work done
//      since.
//   2. COPY, NEVER MOVE. The old folder stays exactly as it was. If anything
//      about the copy is wrong, the originals are still there to try again
//      from — and the owner can go back to the old version.
//   3. A MISSING SOURCE IS A NO-OP, not an error. Most people installing
//      1.0.0 or later never had the old folder.
//   4. A FAILURE CANNOT STOP THE APP OPENING. A library that could not be
//      carried over is a library the owner still has; an app that will not
//      start is not.
//
// IT ANSWERS WITH A REASON rather than a bare false. A quiet "did nothing" is
// indistinguishable from a broken one, which is the shape this project keeps
// getting caught by (the Notes strip, the daily ping, the download report).

const fs = require('node:fs');
const path = require('node:path');

// The folder name the app used before 1.0.0. A literal, and it has to stay
// one: it names a directory that exists on other people's disks and can never
// change retrospectively.
const LEGACY_APP_DIR = 'Crumar Seven Editor';
const LIBRARY_DIR = 'Library';

function migrateLegacyLibrary({
  userDataDir = null,
  // SEVEN_LIBRARY_DIR. When a library directory has been chosen explicitly —
  // which is every test run, because test/ui/run.js points the app at a scratch
  // copy — there is nothing to migrate and nothing may be written.
  // RULE 7: a test must never write to the real library, and this is one of
  // the places that could.
  libraryOverride = null,
  legacyAppDir = LEGACY_APP_DIR,
  log = () => {},
} = {}) {
  if (libraryOverride) {
    return { ran: false, reason: 'an explicit library directory is set' };
  }
  if (!userDataDir) {
    return { ran: false, reason: 'no userData directory was given' };
  }
  try {
    const dest = path.join(userDataDir, LIBRARY_DIR);
    if (fs.existsSync(dest)) {
      return { ran: false, reason: 'the current library folder already exists' };
    }
    const legacy = path.join(path.dirname(userDataDir), legacyAppDir, LIBRARY_DIR);
    if (!fs.existsSync(legacy)) {
      return { ran: false, reason: 'there is no old library folder to carry over' };
    }
    // COPY. `cpSync` with recursive leaves the source alone — the whole
    // guarantee of rule 2 is this one call not being a rename.
    fs.cpSync(legacy, dest, { recursive: true });
    log(`[library] carried over from ${legacy}`);
    return { ran: true, from: legacy, to: dest };
  } catch (err) {
    // NEVER THROWS. The caller runs before the window exists.
    log(`[library] could not carry over the old folder: ${err.message}`);
    return { ran: false, reason: `failed: ${err.message}`, error: true };
  }
}

module.exports = { migrateLegacyLibrary, LEGACY_APP_DIR, LIBRARY_DIR };
