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
  // Leave by NAVIGATING, not by the close button: navigation discards, while
  // the close button leaves an edited session standing — so the next audition
  // asks "Reset Sound?" and that dialog sits over the control this step is
  // trying to click. Leaving a session also recalls the slot it started from
  // to put the instrument back, so there is a round trip to wait out.
  // A patch whose engine has bars, to prove it is not a Clavi-only trick.
  await ui.selectBankPreset(0);
  await ui.sleep(600);
  const bar = ui.$('.param.is-live .param-bar');
  ui.check(!!bar, 'a parameter bar is live too');

  // Nothing may ever ask permission on this path.
  ui.check(!ui.$('.seven-modal'), 'no dialog stands between a patch and playing it');
})()
