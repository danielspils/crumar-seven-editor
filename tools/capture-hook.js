'use strict';

// capture-hook.js — browser console tap for the manufacturer's web editor.
//
// NOT a Node module: paste the snippet below into the DevTools console on the
// gsidsp.com Seven editor page. It patches MIDIOutput.prototype.send so every
// message the EDITOR sends to the instrument is logged with a timestamp.
//
// Outbound direction ONLY, by design: editor→device frames never carry `wfp`
// (the Wi-Fi password lives in the device's 0x33 globals REPLY — Rule 6), so
// this log is safe to copy around. The device→host direction is captured
// separately by tools/listen.js, which redacts wfp before writing.
//
// Usage:
//   1. Start `node tools/listen.js --label <session>` on the host FIRST, while
//      the MIDI stream is idle (a port opened mid-SysEx can wedge — see the
//      caution in listen.js).
//   2. Open the editor page in Chrome, open DevTools, paste the snippet.
//   3. Let the editor connect; perform ONLY the action under test.
//   4. In the console: copy(window.__sevenTap)  → paste the JSON into a file
//      under captures/ next to the listener's .jsonl.
//
// ---- paste everything below this line into the console ----------------------
/*
(() => {
  const orig = MIDIOutput.prototype.send;
  const log = [];
  window.__sevenTap = log;
  MIDIOutput.prototype.send = function (data, ts) {
    const row = {
      t: new Date().toISOString(),
      port: this.name,
      // Number(b) FIRST. The editor supplies some bytes as strings — a
      // slider's .value — and String.prototype.toString ignores a radix, so
      // `"85".toString(16)` returns "85" and the byte landed in the log as
      // decimal text while everything around it was hex. The frame on the wire
      // was always right; only the log was mixed-base. It cost a reading of
      // the 2026-08-14 capture, where the ramp appeared to peak at 0x85 = 133,
      // which cannot travel in SysEx at all.
      hex: Array.from(data).map((b) => Number(b).toString(16).padStart(2, '0')).join(' '),
    };
    log.push(row);
    console.log('[seven-tap]', row.t, row.hex);
    return orig.call(this, data, ts);
  };
  console.log('[seven-tap] armed. Copy the log with: copy(window.__sevenTap)');
})();
*/

module.exports = {};
