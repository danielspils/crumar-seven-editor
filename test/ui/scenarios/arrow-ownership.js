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
  await ui.selectTab('backups');
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
  await ui.selectTab('patches');
  await ui.sleep(400);
  const patch = ui.$('#library .lib-row.lib-patch');
  if (!patch) {
    ui.note('skipped: no patch in the library to select');
    return;
  }
  ui.click(patch.querySelector('.patch-name') || patch, 'a patch in the library');
  await ui.sleep(500);

  // COME BACK THE WAY A PERSON DOES: select the Seven tab. Deliberately NOT a
  // click inside the bank region — the arrows have to work without any click
  // on the tabs themselves.
  await ui.selectTab('seven');
  await ui.sleep(400);

  // THE TABS MUST BE ON SCREEN, and this is checked HERE rather than before
  // the trip back. It used to sit above, where it was harmlessly true because
  // both regions were on screen at once. With four tabs the bank tabs are
  // genuinely out of the layout while Patches is showing, so asking there
  // turned the whole second half into a SKIP — a test reporting green while
  // asserting nothing, which is the shape CLAUDE.md files under "a test that
  // skips on failure is worse than no test". Asked where the answer means
  // something, it is a real precondition again.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  if (!ui.check(tabs.length > 0 && !!ui.$('#bank-tabs').offsetParent,
    'the bank tabs are on screen once the Seven tab is selected')) return;
  const before = activeBank();

  await key('ArrowRight');
  const after = activeBank();
  ui.check(after !== before,
    `ArrowRight moves the bank after clicking back onto OTS (${before} → ${after})`);

  // …and it is still the tabs answering, not a stale library selection.
  await key('ArrowLeft');
  ui.check(activeBank() === before,
    `ArrowLeft comes back (${after} → ${activeBank()})`);

  // THERE USED TO BE A SECOND WAY BACK, and a second scenario for it.
  //
  // With two trays you could leave a backup run open BEHIND the collapsed
  // library and it still answered both arrow axes — a state
  // arrow-ownership-open.js existed to reproduce, because a comment here had
  // once declared it unreachable. The measurement behind that comment was
  // right (the tray was 0px, #seven-head display:none, only #bank-strip
  // hittable); the conclusion drawn from it was wrong, and the comment is why
  // nobody looked until Daniel hit it on the release.
  //
  // That state is now UNCONSTRUCTABLE: four tabs put exactly one navigable
  // list on screen, so there is no behind. The scenario was replaced rather
  // than deleted — one-list-on-screen.js asserts the invariant that makes it
  // impossible, which is the risk it was really guarding.
})()
