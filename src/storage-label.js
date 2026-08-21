'use strict';

// THE DEVICE'S STORAGE FIGURE, labelled so it cannot be misread.
//
// It is FREE SPACE. Measured 2026-08-21 on Daniel's unit: it read "4.0GB" on
// 2026-08-09 and 2026-08-15, and "2.5GB" after three expansions were installed
// on the 20th. The old reading was never a capacity that happened to look
// round — it was a free reading taken when more was free.
//
// The display was removed in c052079 because the number looked unreliable.
// That was right about the symptom and wrong about the cause: it moved because
// free space moves, while everyone was reading it as a fixed capacity.
//
// SO THE WORD "free" IS NOT DECORATION. A bare "2.5GB" beside a sound count is
// exactly the misreading that got the display deleted the first time, and this
// module exists so that no caller can produce one by accident.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenStorageLabel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // Nothing attached, or a firmware that did not answer: NO STRING AT ALL.
  // Not "0GB", not the last value seen — an absent field says "not asked",
  // which is the truth, while a zero would claim a full instrument.
  function storageLabel(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    // The device says "2.5GB" today. If some firmware ever answers with the
    // word already in it, do not say it twice — but never REMOVE it, because
    // the whole point is that it is always there.
    if (/\bfree\b/i.test(s)) return s;
    return `${s} free`;
  }

  return { storageLabel };
});
