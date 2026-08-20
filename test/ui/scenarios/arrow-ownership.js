// WHO OWNS THE ARROW KEYS. Two bugs with one cause, both reported on
// 2026-08-20 and both reproduced before the fix.
//
// `lastTouched` decides which region the arrows drive, and it only ever moved
// when something was SELECTED. Neither of these counts as a selection:
//
//   - Opening a backup run. lastTouched stayed 'device', so up/down moved the
//     INSTRUMENT's selection: the centre column changed while no row in the run
//     ever highlighted.
//   - Clicking back onto the bank tabs after visiting the library. Nothing put
//     lastTouched back to 'device', so left/right stayed swallowed and the tabs
//     were dead until the app was relaunched.
//
// This runs only under `npm run test:ui` — the unit glob is "test/*.test.js"
// and never descends here, and app.js is not reachable from a unit test at all.
(async () => {
  const rowsSel = '#library .lib-row.lib-patch, #library .lib-slot[data-file]';
  const rows = () => ui.$$(rowsSel);
  const selectedIndex = () => rows().findIndex((r) => r.classList.contains('selected'));
  const activeBank = () => {
    const t = ui.$$('#bank-tabs .bank-tab').find((x) => x.classList.contains('active'));
    return t ? t.textContent.trim() : null;
  };
  const key = async (k) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await ui.sleep(320);
  };

  // ── 1. up/down inside a backup run highlight a row ────────────────────
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="backups"]', 'the Backups tab'), 'Backups');
  await ui.sleep(500);
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  if (!run) {
    ui.note('skipped: this library has no backup run to open');
  } else {
    ui.click(run.querySelector('.patch-name') || run, 'the newest backup run');
    await ui.waitFor(() => rows().length > 0, { what: "the run's rows" });

    // BEFORE the fix this stayed -1 forever, because the keys were driving the
    // instrument's selection instead of this list.
    await key('ArrowDown');
    const first = selectedIndex();
    ui.check(first >= 0, `ArrowDown highlights a row in the run (index ${first})`);

    await key('ArrowDown');
    const second = selectedIndex();
    ui.check(second === first + 1,
      `ArrowDown moves to the next row (${first} → ${second})`);

    await key('ArrowUp');
    ui.check(selectedIndex() === first,
      `ArrowUp moves back (${second} → ${selectedIndex()})`);

    // And the bank tabs still answer left/right while the run is open.
    const bankBefore = ui.$$('.lib-bank-tabs .bank-tab, .bank-tabs .bank-tab')
      .find((t) => t.classList.contains('active'));
    await key('ArrowRight');
    const bankAfter = ui.$$('.lib-bank-tabs .bank-tab, .bank-tabs .bank-tab')
      .find((t) => t.classList.contains('active'));
    ui.check(bankBefore !== bankAfter || !bankBefore,
      'ArrowRight still walks the run’s banks');
  }

  // ── 2. the OTS tabs get the arrows back after a trip to the library ───
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(400);
  const patch = ui.$('#library .lib-row.lib-patch');
  if (!patch) {
    ui.note('skipped: no patch in the library to select');
    return;
  }
  ui.click(patch.querySelector('.patch-name') || patch, 'a patch in the library');
  await ui.sleep(500);

  // The tabs must be on screen for any of this to mean anything.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  if (!tabs.length || !ui.$('#bank-tabs').offsetParent) {
    ui.note('skipped: the OTS bank tabs are not visible in this layout');
    return;
  }

  // COME BACK THE WAY A PERSON DOES: close the library, which puts the tray
  // back on screen. This gesture is deliberately NOT a click inside the bank
  // region — it is the case the region-click claim does not cover, and the one
  // that has to work without any click on the tabs at all.
  ui.click(ui.$('#library-head'), 'the library header (collapsing it)');
  await ui.waitFor(() => !ui.$('#library.lib-open'), { what: 'the library to close' });
  await ui.sleep(400);
  const before = activeBank();

  await key('ArrowRight');
  const after = activeBank();
  ui.check(after !== before,
    `ArrowRight moves the bank after clicking back onto OTS (${before} → ${after})`);

  // …and it is still the tabs answering, not a stale library selection.
  await key('ArrowLeft');
  ui.check(activeBank() === before,
    `ArrowLeft comes back (${after} → ${activeBank()})`);

  // NO PART 3. An earlier version of this fix also let a click anywhere in the
  // bank region reclaim the arrows, for the case where the library stays open.
  // That case does not exist: with the library open, the ONLY thing in
  // #bank-region a mouse can reach is the collapsed strip, and clicking it
  // closes the library — after which the open/closed gate above hands the keys
  // back anyway. The tabs are covered by the library's own title (measured
  // 2026-08-20: reachable=false), and #seven-head is zero-size. The listener
  // was removed rather than kept with a test that could only pass by
  // dispatching a click no mouse could make.
})()
