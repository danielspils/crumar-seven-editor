// onPanelCc — THE ONE PATH NOTHING CAN AUTOMATE.
//
// It answers "the player just touched the panel", so producing the input needs
// a hand on the instrument. Everything either side of that is checked here.
//
//   SEVEN_UI_SIGNAL=/tmp/seven-signal npm run test:ui panel-cc-follow
//   …then turn the knob, and: echo go > /tmp/seven-signal
//
// WHAT IT GUARDS. While a patch is live, the app's copy of a parameter must
// follow what the INSTRUMENT reports, not what the app last sent — the panel is
// the truth about the edit buffer. And a change the player made must count as
// UNSAVED WORK, because the alternative is saving a patch that quietly disagrees
// with the instrument it came from. That reconciliation is where a wrong answer
// overwrites somebody's patch.
//
// Treble (veq_trb, CC 13) because it is one of only 25 parameters that announce
// a CC at all, and the EQ belongs to every patch whatever engine is loaded.
// Nothing here is stored: the edit buffer holds it until a preset is recalled,
// and no save runs.
(async () => {
  const KEY = 'veq_trb';
  const valueOf = () => {
    const row = ui.$(`.param[data-key="${KEY}"] .param-value`);
    return row ? row.textContent.trim() : null;
  };
  // IS ANYTHING UNSAVED? Read the BAR, not the button.
  //
  // This used to ask whether #save-live-btn was enabled, which was the same
  // question until 2026-08-21. It is not any more: ON THE SEVEN the control is
  // always available, because there is no file behind a bank slot to compare
  // against — so an enabled button there means "you may save this", not "you
  // changed something". The bar's own class still follows drift in every
  // context, which is the thing this scenario actually means.
  const dirty = () => !!ui.$('.audition-bar.is-live');

  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Get a patch live. Selecting a bank preset recalls it, and the buffer then
  // holds exactly what is on screen — which is the one condition editing needs.
  await ui.openLibrary();
  if (!(await ui.selectBankPreset(0))) return;
  const isLive = await ui.enterAudition();
  if (!ui.check(isLive, 'a patch is live, so the panel and the screen agree')) return;

  const before = valueOf();
  if (!ui.check(before !== null, `the ${KEY} row is on screen (value: ${before})`)) return;
  ui.note(`Treble reads ${before} before you touch it`);

  // If it is already dirty the test cannot tell an old edit from the one it is
  // about to ask for. Say so rather than reporting a pass that means nothing.
  if (dirty()) {
    ui.check(false,
      'this patch already has unsaved edits — recall a preset to clear them, then re-run');
    return;
  }

  // SAY WHAT ACTUALLY WORKED (Daniel, 18 Nov 2026, at the instrument).
  //
  // This asked for "a good amount" and the first real attempt FAILED with
  // Treble 64 -> 64 — and the read straight off the Seven also said 64, so
  // the knob had sent nothing at all. A full sweep down and back up on the
  // same knob, a minute later, gave 64 -> 127 and passed.
  //
  // THAT IS PICKUP BEHAVIOUR: a knob resting near its stored value sends
  // nothing until it CROSSES that value, so "a good amount" can be a large
  // turn that still transmits nothing. The instruction has to name the
  // gesture that cannot fail rather than describe an amount, because the
  // person following it cannot see which side of the stored value they are
  // on.
  const got = await ui.waitForHuman(
    `TURN THE TREBLE KNOB fully DOWN and then fully UP (it is CC 13). `
    + `A small turn may send nothing — the knob has to cross its stored `
    + `value. Nothing is stored. Then signal.`,
    { timeout: 180000 }
  );
  if (!got) {
    // TOLD TO THE RUNNER, NOT ONLY TO THE LOG. This was `ui.note(...)` and a
    // bare `return`, so the word "skipped" went into a note while the return
    // value said the scenario had run clean — and it printed ✓ in the 18 Nov
    // device pass having never asked Daniel for the knob he was sitting next
    // to. The skip is part of the RESULT, the same way the device skip four
    // branches up already was.
    // `hand: true` MAKES THIS A FAILED DEVICE PASS. Without it the runner read
    // this as an ordinary precondition — the reason does not match "no
    // instrument attached" — so a run started for device coverage ended
    // without saying that a device scenario had been skipped.
    return {
      skipped: 'nobody answered the prompt for the Treble knob',
      hand: true,
    };
  }

  // onPanelCc debounces by 80ms and then reads the parameter back off the
  // instrument, so give the round trip room without making it a fixed sleep.
  await ui.waitFor(() => valueOf() !== before, { timeout: 5000, what: 'the value to follow the panel' });

  const after = valueOf();
  // Recorded as a NOTE, not only inside the check: a passing check prints
  // nothing, so a green run would say the app followed the panel without ever
  // showing the numbers it followed it to. "Measure, don't eyeball" applies to
  // the test's own output.
  ui.note(`Treble: ${before} → ${after} after your turn`);
  ui.check(after !== before,
    `the app followed the panel rather than its own last value (${before} → ${after})`);
  ui.check(dirty(),
    'and counted it as unsaved work — a player edit the library does not have yet');

  // The value must be what the INSTRUMENT says, not a guess: onPanelCc reads
  // the parameter back rather than trusting the CC's own data byte, because a
  // CC is 7-bit and this parameter is not.
  const readBack = await window.sevenAPI.midi.readParam(KEY);
  ui.note(`the Seven itself reports ${readBack && readBack.value}`);
  ui.check(readBack && readBack.ok && String(readBack.value) === after,
    `the displayed value is the one the Seven reports (screen: ${after}, device: ${readBack && readBack.value})`);
})()
