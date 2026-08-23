'use strict';

// WHAT THE END OF A SEND SAYS — the last screen of the walk, built as a string
// so `npm test` can reach every branch of it.
//
// It was inline in app.js's transferDone, which meant the only way to see any
// of it was to write to somebody's instrument. Two of the three cases here
// cannot be produced by hand at all: a run where every slot already held its
// patch, and a ONE-SLOT SETLIST, which has to read as a bank send and not as a
// single one.
//
// ONE MODAL SERVES BOTH FLOWS. sendPatchToSlot and sendSetlist go through the
// same walk and the same summary, so the single-send wording had to be added
// without touching the bank wording — Daniel: "Making the single case right by
// breaking the bank case is not a trade I want."
//
// THE DISCRIMINATOR IS setlistIndex, NOT A COUNT. The runner sets it: null in
// startSlot, the setlist's own index in start. A count would be an inference,
// and it would be wrong for exactly one case — a setlist holding a single
// patch, which is a bank send that happens to write one preset. That case is
// the reason this is not `total === 1`, and it is pinned in the tests.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenTransferSummary = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // A single-patch send is the one with no setlist behind it. STRICTLY null:
  // the runner writes it explicitly, and a report built from a run that never
  // started carries neither field — that is "unknown", not "single".
  const isSingle = (report) => !!report && report.setlistIndex === null;

  // One name for the action, so its ending carries the same word.
  function title(report) {
    return report && (report.error || report.cancelled) ? 'Send stopped' : 'Sent to Seven';
  }

  function body(report) {
    if (!report) return '';
    const stored = (report.confirmed || []).length;
    const loose = report.loadedNotConfirmed || [];
    const alreadyThere = report.alreadyThere || [];
    const already = alreadyThere.length;
    const single = isSingle(report);

    // EVERY SLOT ALREADY HELD ITS PATCH: nothing was sent, nothing was held,
    // and the instrument is correct. "0 of 8 presets stored" reads as failure
    // when the truth is that the bank was already right (Daniel, 2026-08-16).
    //
    // Never for a single send. One preset is not "the bank already matched",
    // and the single wording says the patch and the destination anyway — the
    // "already held its patch" line below does the explaining.
    const nothingNeeded = !single && !report.error && !report.cancelled
      && stored === 0 && already > 0 && already === report.total;

    // A SINGLE SEND NAMES THE PATCH AND THE WHOLE DESTINATION.
    //
    // It used to borrow the bank walk's sequence language and count to one —
    // "1 of 1 preset stored" — over a destination that stopped at the bank.
    // The modal never said what was sent, and "Bank 3" does not say where it
    // went (Daniel, 2026-08-23).
    const head = single
      ? `<p class="tx-step-name">${esc(report.name || 'This patch')}</p>` +
        `<p class="tx-step-where">Bank ${esc(report.bank)} · Preset ${esc(report.preset)}</p>`
      : (nothingNeeded
        ? `<p class="tx-step-name">Bank ${esc(report.bank)} already matched — ` +
          'nothing needed storing</p>'
        : `<p class="tx-step-name">${stored} of ${report.total} ` +
          `preset${report.total === 1 ? '' : 's'} stored</p>` +
          `<p class="tx-step-where">Bank ${esc(report.bank)}</p>`);

    return (report.error ? `<p class="tx-note tx-alarm">${esc(report.error)}</p>` : '') +
      head +
      // Slots that needed nothing are reported separately from slots the
      // player stored. Both are "done"; only one was work.
      (already && !nothingNeeded
        ? `<p class="tx-note">Preset ${alreadyThere.join(', ')} already held ` +
          `${already === 1 ? 'its patch' : 'their patches'}, so nothing was sent.</p>`
        : '') +
      (loose.length
        ? `<p class="tx-note">Preset ${loose.join(', ')} was loaded but you did not confirm ` +
          'the hold, so it is still in the edit buffer rather than saved on the instrument.</p>'
        : '') +
      // NOTHING ABOUT SAMPLE-SET VERSIONS. A line here once said sampled
      // sounds "may differ slightly if this Seven has a different version of
      // the sample set" — removed 2026-08-22 because nothing ever established
      // that a version of a sample set exists (docs/DEVICE.md §11).
      '';
  }

  return { title, body, isSingle };
});
