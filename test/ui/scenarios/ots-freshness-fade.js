// STEP 2: A SLOT NOT HEARD FROM THIS SESSION IS DRAWN FADED.
//
// "On the Seven shows the live instrument as far as it is known" (Daniel,
// 15 Nov 2026). Step 1 is src/ots-freshness.js — the verdict, pure and
// unit-tested. This is the drawing of it, and the scope is deliberately one
// thing: the bank slot ROWS fade, and selecting a row brings it up to full.
// Not the detail pane, not the effects chain, no shimmer, no markers.
//
// THE ROW COMES UP BY ITSELF, which is the part worth testing rather than
// asserting. Selecting a slot recalls it; the instrument broadcasts 0x45 with
// the sound; recordSlotSound files it and renderList() runs again. There is no
// refresh path of its own — so if any link in that chain breaks, the fade
// never lifts and this fails.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 100) / 100;

  await ui.selectTab('seven');
  await ui.sleep(900);

  // NOT BANK 1 — IT IS EXEMPT FROM THE RULE THIS SCENARIO CHECKS.
  //
  // THIS WAS THE BUG, found 18 Nov 2026 in the first real device pass. The
  // scenario read whichever bank the app had opened on, and `bankIndex` starts
  // at 0 and is never persisted, so a fresh launch always lands on Bank 1 —
  // the FACTORY bank. app.js says why that bank never fades, in capitals:
  //
  //   // BANK 1 NEVER FADES. The fade says "this describes the past and may
  //   // have moved since". A factory bank cannot be stored to, so its record
  //   // is still current however old it is
  //   row.classList.toggle('is-stale',
  //     view.state === 'from-backup' && !bankIsFactory(bankIndex));
  //
  // So it asserted "every backed-up row starts faded" about the one bank where
  // nothing ever fades, and reported all eight rows stale=no, opacity=1. IT HAD
  // NEVER PASSED: written 15 Nov, it skips without an instrument, and the first
  // device pass to run it was three days later.
  //
  // THE IDENTICAL DEFECT TO backup-detail-controls.js, repaired the day before
  // this one — it measured #bank-asof on whichever bank the app opened on, and
  // asked the one bank whose caveat is deliberately empty. Twice now, from the
  // same root: a fresh launch lands on the factory bank, and the factory bank
  // is the exception to most claims this region makes.
  //
  // AND THE TAB IS CHOSEN, NOT INHERITED, which CLAUDE.md has required since
  // 2026-08-22 for a second reason: the bank tab survives the scenario that
  // set it, so reading "whatever is active" also makes this depend on which
  // scenario ran last.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  const labelOf = (t) => (t.querySelector('.bank-tab-label') || t).textContent.trim();
  const active = () => ui.$('#bank-tabs .bank-tab.active');
  if (active() && /\b1\b/.test(labelOf(active()))) {
    const other = tabs.find((t) => !/\b1\b/.test(labelOf(t)));
    if (other) { ui.click(other, 'a bank that is not the factory bank'); await ui.sleep(900); }
  }
  const bankName = active() ? labelOf(active()) : '(unknown)';
  ui.note(`working in ${bankName}`);
  if (/\b1\b/.test(bankName)) {
    return { skipped: 'only Bank 1 is available, and the factory bank never fades' };
  }

  const rows = () => ui.$$('#patch-list .patch-row');
  if (!rows().length) { ui.note('no bank rows'); return; }

  const faded = (el) => Number(getComputedStyle(el).opacity);
  const describe = (el) => `${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 38)}`;

  // ---- 1. A FRESH SESSION STARTS FADED -----------------------------------
  //
  // Nothing has been heard from yet, so every row showing a BACKUP is showing
  // the past. Rows with nothing to show are not faded: "Not backed up" is the
  // absence of a claim, not a stale one.
  const before = rows().map((r) => ({
    i: Number(r.dataset.index),
    stale: r.classList.contains('is-stale'),
    empty: r.classList.contains('empty-slot'),
    opacity: faded(r),
    text: describe(r),
  }));
  ui.note('row | stale | empty | opacity | text');
  for (const r of before) {
    ui.note(`${String(r.i + 1).padStart(3)} | ${r.stale ? 'yes  ' : 'no   '}`
      + ` | ${r.empty ? 'yes  ' : 'no   '} | ${String(px(r.opacity)).padStart(7)} | ${r.text}`);
  }

  const backed = before.filter((r) => !r.empty);
  const emptied = before.filter((r) => r.empty);
  ui.check(backed.length > 0, `there are backed-up rows to fade (${backed.length})`);
  ui.check(backed.every((r) => r.stale),
    'every backed-up row starts faded — nothing has been heard from this session');
  ui.check(backed.every((r) => r.opacity < 1),
    `and the fade is real, not just a class (${backed.map((r) => px(r.opacity)).join(', ')})`);
  ui.check(emptied.every((r) => !r.stale),
    `an empty slot is NOT faded (${emptied.length} of them) — it is not claiming`
    + ' anything about the past');

  // ---- 2. SELECTING ONE BRINGS IT UP -------------------------------------
  const target = backed.find((r) => r.i !== 0) || backed[0];
  ui.note(`selecting row ${target.i + 1}: "${target.text}"`);
  rows()[target.i].dispatchEvent(new MouseEvent('click', { bubbles: true }));

  // The recall, the 0x45, and the re-render. Generous: the read behind it is
  // ~1.4s and the point is whether it lifts at all, not how fast.
  const lifted = await ui.waitFor(
    () => {
      const row = rows()[target.i];
      return row && !row.classList.contains('is-stale');
    },
    { timeout: 12000, what: 'the selected row to come up to full' }
  ).then(() => true).catch(() => false);

  const after = rows()[target.i];
  ui.note(`after selecting: stale=${after.classList.contains('is-stale')}`
    + ` · opacity ${px(faded(after))}`);
  ui.check(lifted && !after.classList.contains('is-stale'),
    `the selected row came up to full — the recall, the broadcast and the`
    + ` re-render all connected`);

  // ---- 3. AND ONLY THAT ONE ----------------------------------------------
  //
  // The fade is per slot. A refresh that cleared the whole list would look
  // identical on the row that was clicked and would be wrong about the rest.
  const others = rows().filter((r) => Number(r.dataset.index) !== target.i
    && !r.classList.contains('empty-slot'));
  const stillStale = others.filter((r) => r.classList.contains('is-stale'));
  ui.note(`other backed-up rows still faded: ${stillStale.length} of ${others.length}`);
  ui.check(stillStale.length === others.length,
    'the rows that were not selected are still faded — the freshness is per slot');

  // ---- 4. AND BANK 1 NEVER FADES AT ALL ----------------------------------
  //
  // THE OTHER HALF OF THE BUG ABOVE. Avoiding the factory bank fixes the
  // scenario; it does not test the exemption, and an exemption nothing checks
  // is one somebody deletes. backup-detail-controls.js gained the same pairing
  // the day before: measure the bank that CAN go stale, and additionally pin
  // that the factory bank does not.
  //
  // A factory bank cannot be stored to, so its backup record is still current
  // however old it is — fading it would make the same false claim the caveat
  // line above the rows stopped making.
  // RE-QUERIED, NOT THE CACHED LIST. `tabs` was captured before the bank
  // switch at the top, and renderTabs() rebuilds those elements — so the
  // cached nodes are DETACHED and clicking one does nothing at all. The first
  // version of this block did that, stayed on Bank 2, and reported "Bank 1:
  // 7 faded". The giveaway was in its own output: exactly one row at opacity
  // 1, which is the row step 2 had just selected on Bank 2.
  const bank1 = ui.$$('#bank-tabs .bank-tab').find((t) => /\b1\b/.test(labelOf(t)));
  if (bank1) {
    ui.click(bank1, 'Bank 1, the factory bank');
    // AND THE SWITCH PROVES ITSELF before anything is concluded from it, the
    // same way the pane squeeze in fx-head-fits.js has to.
    const switched = await ui.waitFor(
      () => active() && /\b1\b/.test(labelOf(active())),
      { timeout: 4000, what: 'the Bank 1 tab to become active' }
    );
    if (!ui.check(!!switched,
      `the bank actually changed to Bank 1 (it is ${active() ? labelOf(active()) : 'unknown'})`)) {
      ui.note('nothing below this would be about Bank 1 — not checked');
      return;
    }
    await ui.sleep(600);
    const factoryRows = rows().filter((r) => !r.classList.contains('empty-slot'));
    const factoryStale = factoryRows.filter((r) => r.classList.contains('is-stale'));
    ui.note(`Bank 1: ${factoryRows.length} backed-up rows, ${factoryStale.length} faded`
      + ` · opacities ${factoryRows.map((r) => px(faded(r))).join(', ')}`);
    ui.check(factoryRows.length > 0,
      `Bank 1 has rows to check (${factoryRows.length})`);
    ui.check(factoryStale.length === 0,
      `and NONE of them fades — the factory bank cannot go stale`
      + ` (${factoryStale.length} faded)`);
    ui.check(factoryRows.every((r) => px(faded(r)) === 1),
      'and the opacity says so too, not just the class');
  }
})()
