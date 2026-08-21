// THE GESTURE THAT SHIPPED BROKEN IN 1.4.0. Reported by Daniel on his own
// machine, on the release, the day it went out:
//
//   1. On the Seven — arrows work
//   2. Open On this computer AND OPEN A BACKUP RUN
//   3. Go back to On the Seven
//   4. Up/down change the patch ON THE INSTRUMENT but move no selection in the
//      list you are watching. Left/right do nothing at all.
//
// STEP 2 IS THE WHOLE TEST, and it is the half the sibling scenario
// arrow-ownership.js leaves out: it comes back from the PATCHES tab, where no
// run is open, and it passed green through all of this.
//
// With a run open, both library consumers answer whatever you are looking at.
// `moveBackupBank` runs first on left/right and swallows them into a list that
// is no longer on screen; `ownsVerticalArrows` claims up/down for as long as
// the run exists — AND MOVING THAT SELECTION AUDITIONS, so every press loads a
// different patch onto the instrument while the visible list sits still. That
// is why this one is worth its own file: the wrong answer changes what the
// Seven is playing.
//
// Runs only under `npm run test:ui` — the unit glob is "test/*.test.js" and
// never descends into test/ui/, and app.js is unreachable from a unit test.
(async () => {
  const key = async (k) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    await ui.sleep(320);
  };
  const activeBank = () => {
    const t = ui.$$('#bank-tabs .bank-tab').find((x) => x.classList.contains('active'));
    return t ? t.textContent.trim() : null;
  };
  const libRows = () => ui.$$('#library .lib-row.lib-patch, #library .lib-slot[data-file]');
  const libIndex = () => libRows().findIndex((r) => r.classList.contains('selected'));
  const deviceSel = () => {
    const r = ui.$('#bank-region .patch-row.selected, #bank-region .bank-slot.selected');
    return r ? r.textContent.trim() : null;
  };

  // ── step 2: a backup run, open ───────────────────────────────────────
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="backups"]', 'the Backups tab'), 'Backups');
  await ui.sleep(500);
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  if (!run) return { skipped: 'this library has no backup run — a precondition, not a result' };
  ui.click(run.querySelector('.patch-name') || run, 'the newest backup run');
  await ui.waitFor(() => libRows().length > 0, { what: "the run's rows" });

  // Put a selection in it, the way a person browsing a run does.
  await key('ArrowDown');
  const libBefore = libIndex();
  ui.check(libBefore >= 0, `the run has a selected row to leave behind (index ${libBefore})`);

  // ── step 3: back to On the Seven ─────────────────────────────────────
  //
  // #bank-strip, because with the library open it is the ONLY part of the bank
  // region a mouse can reach — the tray is 0px tall and #seven-head is
  // display:none (measured 2026-08-20). Clicking it restores the tray.
  //
  // An earlier pass measured that same fact, concluded from it that no gesture
  // could hand the keys back, deleted the listener and wrote the conclusion
  // into a comment as settled. The gesture is right here, and the run left open
  // behind it is what the conclusion missed.
  ui.click(ui.$('#bank-strip'), 'the ON THE SEVEN strip (going back)');
  await ui.sleep(600);
  const tabs = ui.$$('#bank-tabs .bank-tab');
  if (!tabs.length) return { skipped: 'the OTS bank tabs are not rendered in this layout' };

  // ── step 4: the keys belong to the region you came back to ───────────
  const bankBefore = activeBank();
  await key('ArrowRight');
  ui.note(`bank: ${bankBefore} → ${activeBank()}`);
  ui.check(activeBank() !== bankBefore,
    `ArrowRight walks the OTS banks with a run still open behind (${bankBefore} → ${activeBank()})`);

  const devBefore = deviceSel();
  await key('ArrowDown');
  ui.note(`run selection ${libBefore} → ${libIndex()} · device "${devBefore}" → "${deviceSel()}"`);

  // THE EXPENSIVE HALF: moving the run's selection auditions.
  ui.check(libIndex() === libBefore,
    `ArrowDown leaves the run's selection alone (${libBefore} → ${libIndex()})`);
  ui.check(!!ui.$('#bank-region .selected'),
    'and moves the ON THE SEVEN selection instead');

  await key('ArrowLeft');
  ui.check(activeBank() === bankBefore, `ArrowLeft comes back (${activeBank()})`);

  // ── and the run gets them back when you click into it ────────────────
  await ui.openLibrary();
  await ui.sleep(400);
  const row = libRows()[libBefore] || libRows()[0];
  if (!row) return;
  ui.click(row.querySelector('.patch-name') || row, 'back into the run');
  await ui.sleep(400);
  const before = libIndex();
  await key('ArrowDown');
  ui.check(libIndex() !== before,
    `clicking into the library hands the keys straight back (${before} → ${libIndex()})`);
})()
