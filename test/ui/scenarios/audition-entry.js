// Selecting a patch IS the session — there is nothing to enter. Recalling the
// slot puts it in the instrument's edit buffer, which is the only thing a live
// control ever required, so every control on screen is live from the moment
// the patch is chosen.
//
// The Clav's switches are here by name: they were unclickable for two rounds
// because a wrapper carried pointer-events:none, and synthetic clicks in an
// earlier version of this suite would have passed anyway.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Bank 1 Preset 4 is a Clavi patch: switches, choice tabs, no bars up top.
  await ui.selectBankPreset(3);
  ui.check(ui.live(), 'selecting a preset opens the session — nothing to press');
  ui.check(!ui.$('#audition-btn'), 'and there is no Audition button to press');

  const half = ui.$('.param.is-live .d6-half');
  ui.check(!!half, 'the Clavi patch shows switch halves, live');
  if (half) {
    const hit = ui.hitTarget(half);
    ui.check(
      !!(hit && hit.closest('[data-set]')),
      `a click on a switch half reaches it (landed on <${hit && hit.className}>)`
    );
    ui.click(half, 'Clavi switch half');
    await ui.sleep(600);
    ui.check(ui.live(), 'the switch stays live after being pressed');
  }

  // A bar, on a patch whose engine has them.
  //
  // Leave by NAVIGATING, not by the close button: the close button leaves an
  // edited session standing — so the next audition asks "Reset Sound?" and
  // that dialog sits over the control this step is trying to click. Leaving a
  // session also recalls the slot it started from to put the instrument back,
  // so there is a round trip to wait out.
  //
  // THE SWITCH ABOVE WAS AN EDIT, so navigating away now asks before it
  // discards — new on 14 Nov 2026, after Daniel lost two patches walking out
  // of a patch looking for a save control (docs/save-what-you-hear.md §5).
  // That dialog is pinned in switch-patch-guard.js; here it is in the way of
  // what this scenario is actually about, so it is answered and the entry
  // claim is then made on a clean selection.
  await ui.selectBankPreset(0);
  // Polled by hand rather than with ui.waitFor: a timeout there records a
  // FAILED check, and this dialog is expected-but-optional — the switch above
  // may not have moved anything on every engine.
  let leaving = false;
  for (let i = 0; i < 16 && !leaving; i++) {
    leaving = !!ui.$('.seven-modal .seven-modal-deny');
    if (!leaving) await ui.sleep(150);
  }
  if (leaving) {
    ui.click(ui.$('.seven-modal .seven-modal-deny'), 'Discard changes and leave');
    await ui.sleep(900);
    await ui.selectBankPreset(0);
  }
  await ui.sleep(600);
  const bar = ui.$('.param.is-live .param-bar');
  ui.check(!!bar, 'a parameter bar is live too');

  // NOTHING MAY EVER ASK PERMISSION ON THE WAY IN. This is the claim the
  // scenario is named for and it is unchanged: selecting a patch plays it.
  // Asserted here on a selection with nothing edited behind it, so a dialog
  // about LEAVING cannot be mistaken for one about entering.
  ui.check(!ui.$('.seven-modal'), 'no dialog stands between a patch and playing it');

  // And again, from a clean patch to another clean one — the common case the
  // 2026-08-12 decision was protecting, which must still cost nothing.
  await ui.selectBankPreset(1);
  await ui.sleep(700);
  ui.check(!ui.$('.seven-modal'), 'nor between one unedited patch and the next');
})()
