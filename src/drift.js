'use strict';

// HAS ANYTHING CHANGED SINCE THIS PATCH LOADED?
//
// The one question the save button asks. It used to ask `liveEdit.dirty`, a
// flag set the moment any control was touched and never recomputed — so
// turning a knob up and back left the button showing, claiming an edit that no
// longer existed. A flag records that something HAPPENED; only a comparison
// can say whether anything is DIFFERENT, and different is what the button is
// offering to save.
//
// THE BASELINE IS WHAT THE APP SENT, NOT THE RAW FILE (Daniel, 2026-08-21).
// Sending clamps every value to the schema max, so a file holding an
// out-of-range value is not what the instrument received. Compare against the
// file and such a patch shows drift the instant it loads, with nobody having
// touched anything — turning the save button into a second, wronger channel
// for a condition that already has an honest one: the format layer's
// out-of-range warning, which fires at parse time and names key, value and max.
//
// Drift means "changed since it loaded". A value the instrument cannot
// represent never loaded faithfully, and the user did not change it.
//
// Pure, so `npm test` can reach it — the renderer half cannot be unit-tested at
// all, and the restore-to-original case is the one most easily lost.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenDrift = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // Numbers, not strings. The device echoes numbers and a file may hold "64";
  // a strict compare would make that a permanent phantom drift on a patch
  // nobody had touched.
  const same = (a, b) => Number(a) === Number(b);

  function hasDrift({ baseline, live, baselineSound = null, liveSound = null } = {}) {
    // NO BASELINE MEANS NO CLAIM. Nothing was sent, so there is nothing to have
    // drifted from, and a save button here would be offering to save an edit
    // nobody made. This is also the ON THE SEVEN case by construction: there is
    // no file behind a bank slot, so that view never runs this at all.
    if (!baseline || !live) return false;

    // A sound change is drift even when every value matches: the buffer no
    // longer holds the preset the file describes, and keeping it needs the
    // same save (Daniel, 2026-08-21).
    if (baselineSound != null && liveSound != null && baselineSound !== liveSound) return true;

    const keys = new Set([...Object.keys(baseline), ...Object.keys(live)]);
    for (const key of keys) {
      // A key on one side only counts: a value that vanished or appeared is as
      // much a difference as one that moved.
      if (!(key in baseline) || !(key in live)) return true;
      if (!same(baseline[key], live[key])) return true;
    }
    return false;
  }

  return { hasDrift };
});
