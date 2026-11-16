'use strict';

// WHICH MIDI CC MEANS WHICH PARAMETER.
//
// The app follows the instrument's panel by listening for CCs: a knob moves,
// the Seven announces it, and audition.js reads the value back over SysEx
// (onPanelCc). This is the map from the announcement to the parameter.
//
// IT IS BUILT FROM `flag`, NOT FROM `cc`, and that is the whole point of this
// file existing rather than being a line in main.js.
//
// The device's own parameter table reports a `cc` for every parameter, and
// for 85 of the 110 it is -1, the sentinel for "no CC". Three are neither:
// exp_fn (107) reports 1, exp_mn (108) reports 0, exp_mx (109) reports 1.
// Those are not assignments. Four independent tells, settled 15 Nov 2026 and
// written up in docs/SCHEMA-VS-MANUAL.md §2:
//
//   1. -1 is the sentinel for every other flag=0 parameter — 85 of 88.
//   2. flag=1 covers exactly 22 parameters, and they are exactly the 22 fixed
//      CCs the manual's §10.4 lists. So `flag` is what marks a real
//      assignment, and `cc` is only meaningful when it is set.
//   3. 0 and 1 are Bank Select MSB and Modulation Wheel — implausible as
//      factory assignments for a pedal's function and range.
//   4. The manual lists the expression pedal as ABSENT from the CC map, and
//      says anything not in the map is unassigned by default.
//
// WHAT READING `cc` WITHOUT THE GATE DID. `map[p.cc] = p.key` lets a later id
// win, so CC 1 resolved to exp_mx and CC 0 to exp_mn. An incoming Bank Select
// or Mod Wheel on the port — from anything, not just the Seven — was then
// treated as a panel move and spent a SysEx read on a pedal parameter. Worse
// in principle than wasteful: if that value had drifted, the read would have
// updated it and marked the session as the player's unsaved work, raising the
// leave guard over something nobody touched.
//
// LATENT RATHER THAN LIVE, as far as anyone can tell: the app listens to the
// Seven's own port, the Seven has no modulation wheel, and nothing has
// observed it. It is closed because the field was being read where it has no
// meaning, not because a bug was seen.
function buildCcMap(parameters) {
  const map = {};
  for (const p of parameters || []) {
    if (p.flag !== 1) continue;
    if (!(p.cc >= 0)) continue;   // belt and braces: flag=1 always carries one
    map[p.cc] = p.key;
  }
  return map;
}

module.exports = { buildCcMap };
