'use strict';

// READING PARAMETERS OFF THE INSTRUMENT — the one retry, and the one full read.
//
// Two call sites grew the same four lines independently (backup-runner and
// transfer-runner), because the Seven drops roughly one reply in 110 under a
// fast burst and a single read is therefore not a read. This is that retry,
// once. It is NOT the loop: those two loops are genuinely different and
// merging them would make the transfer slower (see below), so what gets shared
// is the piece that was actually duplicated.
//
// Pure, taking the instrument as an argument, for the same reason drift.js is:
// `npm test` can reach it, and the fake instruments the runner suites already
// have need nothing added to them — `readParamValue` is the whole contract.

// ONE PARAMETER, up to `attempts` tries. Throws with the id in the message, so
// a failure names what could not be read rather than reporting a count.
//
// A read is attempted only while the instrument is there: see requireLive.
async function readParamWithRetry(midi, id, attempts = 3) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    requireLive(midi);
    try {
      return await midi.readParamValue(id);
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`param ${id} unreadable after ${attempts} attempts (${last ? last.message : 'no reason given'})`);
}

// THE WHOLE EDIT BUFFER, one verified read per id, in the order given.
//
// ALL OR NOTHING, and that is the point of it. Daniel moves the one USB cable
// between this app and his JUNO-X rig, so losing the instrument part-way
// through a 1.3s read is an ordinary event. A patch file holding sixty fresh
// values and fifty stale ones, saved under a name, is worse than no file at
// all: nothing afterwards can tell it from a real one, and the library's whole
// claim is that a record says what the instrument held. So a read that cannot
// be finished throws, and the caller must not write anything.
//
// `requireLive` is checked before EVERY read rather than once at the top. A
// check at the top only proves the cable was there when the loop started,
// which is the one moment the failure in question does not happen.
async function readBuffer(midi, ids, { attempts = 3 } = {}) {
  const params = {};
  const keys = [];
  for (const id of ids) {
    const r = await readParamWithRetry(midi, id, attempts);
    if (typeof r.key !== 'string' || !r.key) {
      throw new Error(`param ${id} answered with no key — refusing to build a patch from it`);
    }
    params[r.key] = r.value;
    keys.push(r.key);
  }
  requireLive(midi); // the last read's reply proves nothing about now
  return { params, keys };
}

// WHAT THE DEVICE DID NOT REPORT. The read list comes from the instrument's own
// parameter table, not the schema (backup-runner.js:117, deliberately) — so a
// unit reporting fewer parameters than the schema carries simply has no value
// for those keys. They must be NAMED by whatever is about to save, never
// quietly back-filled from the app's copy: a file that mixes what the
// instrument said with what the app assumed is the same lie as a partial read,
// just a quieter one.
function missingKeys(wantedKeys, params) {
  return wantedKeys.filter((k) => params[k] === undefined);
}

function requireLive(midi) {
  if (!midi || midi.state !== 'connected') {
    throw new Error('the Seven disconnected during the read');
  }
}

module.exports = { readParamWithRetry, readBuffer, missingKeys };
