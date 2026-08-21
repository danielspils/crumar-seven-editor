'use strict';

// WHAT "ON THE SEVEN" CAN HONESTLY CLAIM.
//
// The region shows what the last BACKUP saw, because the Seven has no
// read-slot opcode — there is no way to ask it what a preset holds without
// recalling it, which plays it aloud.
//
// But clicking a row ALREADY recalls that slot: the app has been sending a
// Program Change and the instrument has been playing the slot's real contents
// all along. Only the panel was stale, because it seeded its working copy from
// the backup file. The recall broadcasts the slot's real SOUND for free
// (`0x45`), so the app can learn the truth about one slot at a time at no cost
// in noise beyond the note the player asked to hear.
//
// IT LEARNS THE SOUND AND NOTHING ELSE, deliberately:
//
//   - NOT the 22-CC fingerprint. Its documented hole (2026-08-15) lets
//     parameters with no CC differ while it reads "unchanged", and a false
//     "verified" is the exact failure class this project spent a week deleting.
//   - NOT a 110-parameter read per row. ~2.2s each, which would need
//     coalescing to survive somebody arrowing down a bank.
//
// So a row can say "this is no longer what your backup recorded" and can name
// the SOUND — but never the patch name, because the Seven stores no names and
// the app has no way to know what the slot is called now.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenOtsFreshness = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // 'unknown'    never visited — the backup is all there is
  // 'match'      visited, and it still holds the sound the backup recorded
  // 'changed'    visited, and the sound is different: the backup is out of date
  // 'unrecorded' visited, but there was no backup record to compare with
  //
  // The last one matters: "no record at all" and "the record is out of date"
  // are different unknowns, and the row already says "Not backed up" for the
  // first. Collapsing them would make one sentence cover two situations.
  function slotState({ backupSound = null, verifiedSound = null } = {}) {
    if (!verifiedSound) return 'unknown';
    if (!backupSound) return 'unrecorded';
    return verifiedSound === backupSound ? 'match' : 'changed';
  }

  // NO "as of now". It is true for one instant and then decays silently, and
  // the app would go on saying it for an hour. A clock time cannot rot that
  // way: it says when it was true and lets the reader judge. Relative time
  // ("6 minutes ago") was considered and rejected for the same reason — left
  // on screen it keeps claiming six minutes, and arming a minute-timer for a
  // label nobody is watching is not worth it (Daniel, 2026-08-21).
  //
  // The disconnected state is NOT distinguished: the timestamp already says
  // when it was true, and the connection dot says whether the cable is in.
  function asOfLabel({
    banksAsOf = null, verified = 0, total = 32, readAt = null,
    now = new Date(), fmtDate, fmtTime, ago,
  } = {}) {
    const backup = banksAsOf
      ? `as of last backup · ${fmtDate(new Date(banksAsOf))} (${ago(banksAsOf)})`
      : 'not yet backed up';

    // Nothing verified: the app has read no slot, so it may not name a time.
    if (!verified || !readAt) return backup;

    // AFTER MIDNIGHT a bare clock time is ambiguous, and the app would go on
    // showing it. The day-rollover tick re-renders once a day, which is
    // exactly this cadence — nothing new is armed for it.
    const sameDay = readAt.getFullYear() === now.getFullYear()
      && readAt.getMonth() === now.getMonth()
      && readAt.getDate() === now.getDate();
    const when = sameDay ? fmtTime(readAt) : `${fmtTime(readAt)}, ${fmtDate(readAt)}`;

    if (verified >= total) return `as of ${when}`;
    // Both halves counted, because neither describes the whole region.
    return `${verified} of ${total} as of ${when} - ${total - verified} as of last backup`;
  }

  return { slotState, asOfLabel };
});
