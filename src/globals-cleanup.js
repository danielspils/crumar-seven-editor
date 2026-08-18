'use strict';

// Cleans a leak that 1.0 could write into a globals snapshot.
//
// THE LEAK. The 0x33 globals reply is split on ';', so a Wi-Fi password
// CONTAINING a semicolon broke into a second pair — "wfp=pass;word=secret" —
// and the parser's catch-all kept "secret" under a key nobody was watching,
// into globals-YYYY-MM-DD.json in the user's library. That file is exactly
// the kind of thing someone attaches to a bug report. The parser stopped
// doing it on 2026-08-17; this cleans up what is already on disk.
//
// REDACT THE VALUE, KEEP THE KEY. A password fragment and a legitimate field
// this build has never seen are the same thing on disk — "word=secret" reads
// identically either way, and no rule can separate them. So nothing is
// deleted: an unknown value is replaced and its key stays, which preserves the
// one fact worth preserving (a field exists that this build does not know —
// Rule 2 says that is worth noticing) while removing the one that might be a
// secret. A false positive costs a value the instrument will happily say
// again, because a globals snapshot is a record, not a one-shot capture
// (Daniel, 2026-08-17).
//
// Quiet by design: a console line, no dialog. It only affects someone whose
// password contains a semicolon, and "we found a fragment of your password in
// a file" is alarming out of all proportion to that.

const fs = require('fs');
const path = require('path');

const MARKER = 'globals-cleanup-done.json';

// What a snapshot legitimately holds. `tun`, `glb` and `wfp` are the whole of
// the 0x33 reply as the device describes it (docs/protocol.md, from live
// interrogation of FW 1.37); `captured` is added by writeGlobalsSnapshot.
const KNOWN_KEYS = new Set(['captured', 'tun', 'glb', 'wfp']);

const REDACTED = '[redacted — unknown field, 1.0 leak]';

function cleanOne(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { touched: false, reason: 'unreadable' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A snapshot we cannot parse is one we must not rewrite.
    return { touched: false, reason: 'unparseable' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { touched: false, reason: 'unexpected shape' };
  }

  const stripped = Object.keys(parsed).filter(
    (k) => !KNOWN_KEYS.has(k) && parsed[k] !== REDACTED
  );
  if (!stripped.length) return { touched: false, stripped: [] };

  const out = {};
  for (const [k, v] of Object.entries(parsed)) out[k] = KNOWN_KEYS.has(k) ? v : REDACTED;
  return { touched: true, stripped, contents: `${JSON.stringify(out, null, 2)}\n` };
}

// `write` is the store's atomic write, injected: a cleanup that truncates a
// file it was rewriting for safety reasons would be a poor joke.
function run({ dir, userDataDir, write, force = false }) {
  const markerPath = path.join(userDataDir, MARKER);
  if (!force && fs.existsSync(markerPath)) return { ran: false, filesChanged: 0 };

  const result = { ran: true, filesChanged: 0, fieldsRedacted: 0, files: [] };
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => /^globals-.*\.json$/.test(f));
  } catch {
    return { ran: false, filesChanged: 0, reason: 'no library folder' };
  }

  for (const name of names) {
    const filePath = path.join(dir, name);
    const outcome = cleanOne(filePath);
    if (!outcome.touched) continue;
    try {
      write(filePath, outcome.contents);
      result.filesChanged++;
      result.fieldsRedacted += outcome.stripped.length;
      result.files.push({ file: name, keys: outcome.stripped });
      // The KEY, never the value — the value is the thing we are here about.
      console.log(`[globals-cleanup] ${name}: redacted ${outcome.stripped.join(', ')}`);
    } catch (err) {
      console.warn(`[globals-cleanup] could not rewrite ${name}: ${err.message}`);
    }
  }

  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      at: new Date().toISOString(), ...result,
    }, null, 2)}\n`);
  } catch (err) {
    console.warn(`[globals-cleanup] could not write the marker: ${err.message}`);
  }
  return result;
}

module.exports = { run, cleanOne, KNOWN_KEYS, REDACTED, MARKER };
