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
})()
