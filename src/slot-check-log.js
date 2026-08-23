'use strict';

// WHY A SLOT WAS SKIPPED, OR WASN'T — written down at the time.
//
// On 2026-08-23 a bank restore reported "Bank 3 already matched — nothing
// needed storing" for eight slots that demonstrably did not match, wrote
// nothing, and said it had succeeded. Finding out what had happened took a day
// of probes that each needed somebody present, an instrument in the right
// state, and hours of guessing about what the state had BEEN. The failure
// itself left no trace at all.
//
// The comparison that decides whether to skip a slot is the one place in this
// app where getting it wrong silently costs somebody their presets. So it says
// what it did, every time, somewhere that survives the session.
//
// SMALL ENOUGH TO LEAVE ON PERMANENTLY, which is the only kind of logging that
// is ever running on the day it matters: one line per slot — 32 for a whole
// bank send, one for a single patch — and the file is capped, oldest first. A
// debug mode somebody has to enable is off when it counts.
//
// It records what the check SAW, not what it concluded from it: the sound id
// and whether the lookup resolved, the table size the device reported, how
// many parameters were actually compared. The 2026-08-23 failure needed both
// the sound check and the parameter check to have failed, and neither of those
// facts was recoverable afterwards.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenSlotCheckLog = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // Roughly a thousand slot checks. A whole-bank send writes 8; a heavy day of
  // testing wrote perhaps 300.
  const MAX_BYTES = 128 * 1024;

  // One line, in the order somebody reading it wants to ask: which slot, what
  // it saw, what it decided.
  function line(r = {}) {
    const at = r.at || '';
    const sound = r.soundId === null || r.soundId === undefined ? '-' : r.soundId;
    const name = r.soundName ? `(${r.soundName})` : '';
    const parts = [
      at,
      `bank${r.bank}/preset${r.preset}`,
      `sound=${sound}${name}`,
      `lookup=${r.lookup || 'unknown'}`,
      `wants=${JSON.stringify(r.wants === undefined ? null : r.wants)}`,
      `table=${r.tableSize === null || r.tableSize === undefined ? '-' : r.tableSize}`,
      `patch=${r.patchSize === null || r.patchSize === undefined ? '-' : r.patchSize}`,
      `compared=${r.compared === undefined ? '-' : r.compared}`,
      `verdict=${r.verdict}`,
    ];
    // WHY, when the answer was anything but a plain match. A verdict with no
    // reason is the thing that cost the day.
    if (r.reason) parts.push(`reason=${r.reason}`);
    if (r.detail) parts.push(`detail=${r.detail}`);
    return parts.join(' ');
  }

  // Append, capped, oldest first. Injected fs and path so `npm test` can drive
  // it without a filesystem of its own.
  function append(fs, file, text, { maxBytes = MAX_BYTES } = {}) {
    try {
      fs.appendFileSync(file, `${text}\n`);
      // Trim on the way past the cap rather than on every write: reading the
      // file back costs more than the line that triggered it.
      const size = fs.statSync(file).size;
      if (size <= maxBytes) return true;
      const kept = String(fs.readFileSync(file)).split('\n').slice(-2000).join('\n');
      fs.writeFileSync(file, kept);
      return true;
    } catch (err) {
      // A log that cannot be written must never stop a transfer. The whole
      // point of it is the run it is describing.
      return false;
    }
  }

  return { line, append, MAX_BYTES };
});
