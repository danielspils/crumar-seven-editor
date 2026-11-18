'use strict';

// DID THE SEVEN ANSWER? Not "is a port free", and not "is a port named like
// a Seven on the bus".
//
// WHY THIS EXISTS (Daniel, 18 Nov 2026). A device pass was started on the
// strength of the MIDI port being FREE — which only means no sibling session
// is holding it. Nothing was plugged in, so every device scenario skipped and
// the run would have ended green having proved none of the thing it was for.
//
// THAT IS THE SAME FAILURE THIS PROJECT CAUGHT TWICE THE SAME DAY: a guard
// that silently deletes the test (carousel-stack.js keyed its whole turning
// block on a caption that is now absent at rest) and a scenario that passed
// under mutation. A green suite with the device cases skipped is not a
// smaller pass, it is a different question answered.
//
// THREE DIFFERENT CLAIMS, AND ONLY THE LAST ONE IS THE ONE THAT MATTERS:
//
//   the port is free    no other process holds it. Says nothing about
//                       whether anything is attached.
//   portPresent()       a port whose NAME matches /seven|crumar/ exists.
//                       seven-midi.js's own comment: "A name match is not
//                       proof the instrument is alive; connect()'s liveness
//                       probe is what decides that."
//   THE SEVEN ANSWERED  a STRING-4 round trip completed. This module.
//
// IT USES THE APP'S OWN connect(), deliberately, rather than re-deriving a
// frame: the mandatory liveness probe, the reply matchers that validate
// echoed ids (macOS delivers device replies to every client on the port, so
// opcode-only matching can be satisfied by the manufacturer editor's
// traffic), and the same no-port path. A second implementation of "is it
// there" is a second thing that can be wrong, and this one would be wrong in
// the direction that lets a hollow pass look full.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A throwaway userData dir. SevenMidi writes a pending-restore marker before
// any Send PC change; it must never land in the real profile from a probe.
function scratchUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'seven-probe-'));
}

// Resolves { ok, firmware, reason }. NEVER throws and never rejects: the
// caller is a gate, and a gate that explodes is a gate that stops the run for
// the wrong reason.
async function deviceAnswered({ timeoutMs = 6000 } = {}) {
  if (process.env.SEVEN_NO_DEVICE) {
    return { ok: false, reason: 'SEVEN_NO_DEVICE is set — the probe was told to see nothing' };
  }
  let SevenMidi;
  try {
    ({ SevenMidi } = require('../../src/seven-midi'));
  } catch (e) {
    return { ok: false, reason: `could not load the MIDI layer: ${e.message}` };
  }

  const userDataDir = scratchUserData();
  let midi = null;
  try {
    midi = new SevenMidi({ userDataDir });
  } catch (e) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    return { ok: false, reason: `could not open the MIDI backend: ${e.message}` };
  }

  // THE NAME CHECK FIRST, only so the failure can SAY WHICH of the two it is.
  // "nothing is plugged in" and "something is plugged in and did not answer"
  // are different problems with different fixes, and a gate that reports them
  // as one sends the next person looking in the wrong place.
  let named = false;
  try { named = midi.portPresent(); } catch { named = false; }

  const give = (ok, reason, firmware) => {
    try { midi.disconnect(); } catch { /* never connected */ }
    fs.rmSync(userDataDir, { recursive: true, force: true });
    return { ok, reason, firmware, portNamed: named };
  };

  if (!named) {
    return give(false, 'no MIDI port named like a Seven is on the bus — nothing is plugged in');
  }

  // A TIMEOUT OF OUR OWN, because connect() is allowed to take its time (the
  // boot connection measured ~2.1s on Daniel's unit: the port, the liveness
  // probe, the device's own parameter table, the sound table, the globals).
  // Hanging here would wedge the suite before it started.
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    const res = await Promise.race([midi.connect(), timeout]);
    clearTimeout(timer);
    if (res && res.timedOut) {
      return give(false,
        `a Seven-named port is there but nothing answered within ${timeoutMs}ms`);
    }
    // CONNECTED MEANS THE STRING-4 ROUND TRIP COMPLETED. The firmware string
    // is the proof, and it is reported so the run's header says WHICH
    // instrument answered rather than only that one did.
    return give(true, 'the Seven answered', midi.firmware || '(no firmware string)');
  } catch (e) {
    clearTimeout(timer);
    return give(false, `the Seven did not answer: ${e && e.message ? e.message : e}`);
  }
}

module.exports = { deviceAnswered };
