// THE CAROUSEL IN FRONT OF LIBRARY FILES, AND THE FILE AFTERWARDS.
//
// This control sat here once before, on 2026-08-12, and choosing an instrument
// wrote the new name straight to disk — tine-piano-443, reed-piano, cp70,
// funk-clav and rhodes were silently renamed by what looked like listening.
// It was removed for three weeks and is back, so the guarantee is asserted
// here, in the view where the damage happened.
//
// It checks the FILE, not the screen. A panel showing the old name proves
// nothing about what is on disk, and it was the disk that got hurt.
//
// source-wiring.test.js holds the always-on half of this (no instrument
// needed, runs in CI); this half proves the gesture actually works.
(async () => {
  if (!(await ui.requireDevice())) return;

  const onDisk = async (file) => {
    const lib = await window.sevenAPI.library.list();
    const e = (lib.patches || []).find((x) => x.file === file);
    // Everything the store says about this patch, from disk.
    return e ? JSON.stringify(e) : null;
  };

  // SETTLE THE PREVIOUS PATCH, or the second pass is scenery.
  //
  // Choosing an instrument makes the open patch CHANGED, and since 14 Nov
  // navigating away from a changed patch asks first (audition.confirmLeave).
  // This scenario predates that guard: it chose a sound in `patches`, left the
  // patch unsettled, and clicked a row in `backups` — so the guard's dialog
  // came up and the row click never moved the selection at all.
  //
  // The visible symptom was one failed assertion. The real cost was that the
  // whole backups pass then ran against the patches patch still being live,
  // while measuring the backups FILE — which was of course untouched, because
  // nothing could reach it. A green check for a file nothing could write is
  // the same family as a fixture that cannot express the thing under test.
  //
  // So the guard is answered deliberately, the way a player would: discard.
  // Discarding is what this scenario wants anyway — its whole claim is that
  // the carousel never writes the file.
  const settleLeaveGuard = async (why) => {
    const modal = ui.$('.seven-modal');
    const deny = modal && modal.querySelector('.seven-modal-deny');
    if (!deny) return false;
    ui.note(`${why}: the leave guard asked first — discarding, as a player would`);
    deny.click();
    await ui.sleep(1200);
    return true;
  };

  for (const tab of ['patches', 'backups']) {
    await ui.openLibrary();
    await ui.selectTab(tab);
    await ui.sleep(700);

    // BACKUPS IS TWO LEVELS. It lists backup SETLISTS ("24 August Backup, 32
    // presets"); the patches are inside one. Patches is a flat list. Both end
    // at a row carrying data-file, which is what the carousel needs.
    if (tab === 'backups') {
      const set = ui.$('#library .lib-row.lib-setlist-row');
      if (!set) { ui.note('backups: this library holds no backup — not checked'); await ui.closeLibrary(); continue; }
      ui.click(set, 'a backup setlist');
      await ui.sleep(1000);
    }
    const row = ui.$('#library .lib-row.lib-patch, #library .lib-slot[data-file], #library [data-file]');
    // A precondition this scenario cannot arrange: whether the copied library
    // contains anything in this tab depends on the source library. Noted
    // rather than failed — an empty tab is not this feature misbehaving.
    if (!row) { ui.note(`${tab}: no patch in this library to try — not checked`); await ui.closeLibrary(); continue; }
    const wantFile = row.dataset.file;
    ui.click(row, `a patch in ${tab}`);
    // The guard, if the previous pass left something changed. It answers the
    // navigation, so the selection then proceeds on its own.
    await ui.sleep(400);
    await settleLeaveGuard(tab);
    // Selecting plays it; that send must land before the wheel starts another.
    await ui.sleep(3000);

    // AND THE ROW WE AIMED AT IS ACTUALLY THE OPEN ONE. Without this, a
    // blocked click leaves the previous tab's patch live and every assertion
    // below measures that one while naming this tab — which is exactly how
    // the backups pass went quietly hollow. It fails loudly now instead.
    const open = ui.$(`#library .lib-row.selected[data-file="${wantFile}"]`)
      || ui.$(`#library [data-file="${wantFile}"].selected`);
    if (!ui.check(!!open, `the ${tab} row we clicked is the open patch`)) {
      ui.note(`${tab}: selection did not move to ${wantFile} — nothing below `
        + 'would be measuring this tab, so the pass is abandoned');
      await ui.closeLibrary();
      continue;
    }

    // THE CONTROL IS THERE — this is what was missing until the restoration.
    const car = ui.$('[data-carousel]');
    if (!ui.check(!!car, `the carousel renders in ${tab} with no preset selected`)) {
      await ui.closeLibrary(); continue;
    }
    // THE DEPTH STACK, SINCE 18 Nov 2026. This drove the side-peek wheel:
    // it dispatched a pointermove to OPEN the wheel, clicked a `.is-peek`
    // face to turn it, then clicked `.is-hero` to choose. All three are gone
    // — there is no open state, the cards take no pointer events, and the
    // chevrons are the only hit targets — so the gesture is rewritten rather
    // than the selectors renamed. What it asserts is unchanged: turning
    // centres something different, choosing raises no refusal, and NOTHING
    // IS WRITTEN TO DISK by either.
    const front = ui.$('[data-carousel] .is-front');
    const box = front && front.getBoundingClientRect();
    ui.check(!!box && box.width > 0 && box.height > 0,
      `and the front card is drawn in ${tab} (${box ? Math.round(box.width) : 0}px)`);

    const file = (ui.$('[data-file]') && ui.$('[data-file]').dataset.file) || row.dataset.file;
    const before = await onDisk(file);
    const wasCentred = front.dataset.carName;

    // TURN IT with the chevron, which is the whole control now.
    const step = ui.$('[data-carousel] [data-car-step="1"]');
    if (!ui.check(!!step, `the stack has a next chevron in ${tab}`)) {
      await ui.closeLibrary(); continue;
    }
    ui.click(step, 'the next chevron');
    await ui.sleep(1300);
    const nowCentred = ui.$('[data-carousel] .is-front').dataset.carName;
    ui.check(nowCentred !== wasCentred, `stepping centres a different instrument in ${tab}`);

    // CHOOSE IT with Select, which appears only once the front card differs
    // from what the instrument holds — which is exactly the state the step
    // above just produced.
    const sel = ui.$('[data-carousel] [data-car-select]');
    if (!ui.check(!!sel, `Select appears once the stack has moved in ${tab}`)) {
      await ui.closeLibrary(); continue;
    }
    ui.click(sel, 'Select');
    await ui.sleep(2800);
    // SAY WHAT WAS RAISED. "choosing raised no refusal in backups" named the
    // expectation and not the thing on screen, so a real failure here arrived
    // as a sentence nobody could act on — and the next guess was that it was
    // the same pre-existing connection timeout, which it was not.
    const raised = ui.$('.seven-modal');
    if (raised) {
      const t = (raised.querySelector('.seven-modal-title') || {}).textContent || '';
      ui.note(`${tab}: a modal IS up — title "${t.trim()}" · `
        + `body "${raised.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)}"`);
    }
    ui.check(!raised, `choosing raised no refusal in ${tab}`);

    // THE WHOLE POINT: the file is untouched.
    const after = await onDisk(file);
    ui.check(before !== null && before === after,
      `the patch file is UNCHANGED on disk after choosing in ${tab}`);
    ui.note(`${tab}: ${wasCentred} -> chose ${nowCentred}; file ${before === after ? 'untouched' : 'CHANGED'}`);
    await ui.closeLibrary();
  }
})()
