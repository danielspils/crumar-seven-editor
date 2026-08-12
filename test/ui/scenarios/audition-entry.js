// Reaching for a control enters audition mode — from every KIND of control.
// The Clav's switches are here by name: they were unclickable for two rounds
// because a wrapper carried pointer-events:none, and synthetic clicks in an
// earlier version of this suite would have passed anyway.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Bank 1 Preset 4 is a Clavi patch: switches, choice tabs, no bars up top.
  await ui.selectBankPreset(3);
  ui.check(!ui.live(), 'starts outside audition mode');

  const half = ui.$('.param:not(.is-live) .d6-half');
  ui.check(!!half, 'the Clavi patch shows switch halves');
  if (half) {
    const hit = ui.hitTarget(half);
    ui.check(
      !!(hit && hit.closest('[data-set]')),
      `a click on a switch half reaches it (landed on <${hit && hit.className}>)`
    );
    ui.click(half, 'Clavi switch half');
    await ui.waitFor(ui.live, { what: 'audition mode from a switch' });
    ui.note(`switch -> live: ${ui.live()}`);
  }

  // A bar, on a patch whose engine has them.
  //
  // Leave by NAVIGATING, not by the close button: navigation discards, while
  // the close button leaves an edited session standing — so the next audition
  // asks "Reset Sound?" and that dialog sits over the control this step is
  // trying to click. Leaving a session also recalls the slot it started from
  // to put the instrument back, so there is a round trip to wait out.
  await ui.selectBankPreset(1);
  await ui.sleep(1200);
  await ui.selectBankPreset(0);
  await ui.sleep(600);
  const bar = ui.$('.param:not(.is-live) .param-bar');
  ui.check(!!bar, 'a parameter bar is present');
  if (bar) {
    ui.click(bar, 'parameter bar');
    await ui.waitFor(ui.live, { what: 'audition mode from a bar' });
    ui.note(`bar -> live: ${ui.live()}`);
  }

  // No modal should ever be involved in this path any more.
  ui.check(!ui.$('.seven-modal'), 'entering audition mode shows no modal');
})()
