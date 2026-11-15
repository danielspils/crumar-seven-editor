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

  // ---- WHAT ONE ROW SHOWS -------------------------------------------------
  //
  // "On the Seven" shows the live instrument as far as it is known (Daniel,
  // 2026-11-15). Each row is one of three things, and the difference is what
  // the app has actually been told:
  //
  //   live-read    a slot the app has heard from THIS SESSION. The 0x45 that
  //                answers a recall names the SOUND, which is enough to say
  //                the row is live; the patch NAME needs the parameters.
  //   from-backup  no reading this session: all there is, is the backup
  //                record. Drawn faded, because it describes the past.
  //   empty        no reading and no backup. The honest answer is nothing.
  //
  // THE NAME ARRIVES AFTER THE ROW GOES LIVE, which is the whole shape of
  // this. A slot move already costs a recall; a 110-parameter read costs
  // ~1.4s on top (measured 2026-11-14: min 1353, median 1363). Waiting for it
  // before showing anything would make every arrow-press feel broken, so the
  // row goes live on the sound and the name fills in when the read lands.
  // `pending` is what the view shimmers on — and it is a SHIMMER, not a glow:
  // a glow means a value on the panel knobs and that meaning is taken.
  //
  // "(UNSAVED)" IS A CLAIM, and only the parameters can support it. It says
  // these values match no patch in your library — which the app cannot know
  // from the sound alone, because two different patches can share a sound and
  // two files captured from different slots have been found differing in 0 of
  // 110 parameters. So a read that FAILED or was abandoned settles on the bare
  // sound name: it is live, it is named as far as anyone knows, and nothing is
  // claimed about the library. Guessing there is how "verified" became a lie
  // once already.
  function slotView({
    backupName = null,
    backupSound = null,
    // The sound this slot broadcast when the app recalled it. Null until the
    // app has heard from the slot at all.
    liveSound = null,
    // True once the 110-parameter read has landed for this slot.
    liveParams = false,
    // The read was abandoned or failed. Distinct from "not yet": one settles,
    // the other is still coming.
    readFailed = false,
    // What the library matched those parameters to, or null for no match.
    // Meaningless until liveParams — a caller passing it early is asserting a
    // match it cannot have made.
    matchedName = null,
  } = {}) {
    if (!liveSound) {
      if (backupName || backupSound) {
        return {
          state: 'from-backup', name: backupName, sound: backupSound, pending: false,
        };
      }
      return { state: 'empty', name: null, sound: null, pending: false };
    }
    const pending = !liveParams && !readFailed;
    let name = liveSound;
    if (liveParams) name = matchedName || `${liveSound} (unsaved)`;
    return { state: 'live-read', name, sound: liveSound, pending };
  }

  // HOW MANY SLOTS HAVE BEEN HEARD FROM THIS SESSION — the header's <n>.
  //
  // Counted on the SOUND, not on the parameter read, because that is the
  // moment the row becomes live on screen. A count that waited for the
  // parameters would disagree with what the player can see.
  function liveCount(records = []) {
    let n = 0;
    for (const r of records) if (r && r.liveSound) n += 1;
    return n;
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

  return { slotState, asOfLabel, slotView, liveCount };
});
